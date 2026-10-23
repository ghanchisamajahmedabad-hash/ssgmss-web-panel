import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { creditCommissionStandalone } from "../commission/route";
import { sendToAgent } from "../db/fcm";
import { checkUtrCapacity } from "../db/utrLedger";
import { memberAdvanceOf, creditOps, debitOps, applyOps } from "../db/memberAdvance";
import { recomputeMemberClosingCounts } from "../db/closingCounts";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// Auto-generate a cash reference ID so cash payments are searchable
const generateCashId = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSH-${date}-${time}-${rand}`;
};

// ─── helpers ──────────────────────────────────────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

// Fetch closing_payment docs for a member — returns pending or partially-paid docs
const fetchClosingPaymentDocs = async (memberId) => {
  const snap = await db.collection("closing_payment")
    .where("memberId", "==", memberId)
    .where("status", "in", ["pending", "partial"])
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─────────────────────────────────────────────────────────────────────────────
// POST — Closing Payment
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  // Hoisted so the catch block can release the claim — the request body is
  // already consumed by then and can't be re-read.
  let idemRefOuter = null;
  let committed    = false;

  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const currentUser = authResult.user;
    if (!checkRole(['superadmin', 'admin'], currentUser.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const {
      closingPayments, memberPayments, paymentDate, paymentMethod, paymentNote,
      totalAmount, transactionId, fileUrl, agentId, programId, idempotencyKey,
      // Bank amount of the UTR — lets one transfer be split across members,
      // agents and closing/join-fees payments (see db/utrLedger.js).
      utrTotalAmount,
      // [{ memberId, amount }] — part a member paid beyond their dues,
      // kept as that member's advance.
      memberAdvanceCredits,
    } = body;
    const isMemberAdvancePay = paymentMethod === 'memberAdvance';

    // ── Idempotency guard ─────────────────────────────────────────────────────
    // The UTR check below only fires when the user typed a transaction ID, so
    // CASH closing payments had no duplicate protection at all — a double-click,
    // a browser retry, or a second click after a slow response wrote a second
    // payment group and deducted the member twice. Claiming a key atomically
    // closes that for every payment method.
    const idemRef = idempotencyKey
      ? db.collection('paymentIdempotency').doc(String(idempotencyKey))
      : null;
    idemRefOuter = idemRef;

    if (idemRef) {
      const prior = await db.runTransaction(async (txn) => {
        const snap = await txn.get(idemRef);
        if (snap.exists) return snap.data();       // someone already claimed it
        txn.set(idemRef, {
          status:    'in_progress',
          type:      'closingPayment',
          agentId:   agentId || null,
          createdBy: currentUser.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      });

      if (prior) {
        console.warn(`[ClosingPayment] Duplicate submission blocked (key=${idempotencyKey}, status=${prior.status})`);
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          paymentGroupId: prior.paymentGroupId || null,
          message: prior.status === 'completed'
            ? 'This payment was already recorded — no duplicate was created.'
            : 'This payment is already being processed. Please wait a moment and refresh.',
        });
      }
    }

    // Release the claim if we bail out, so a genuine retry isn't blocked forever
    const releaseIdempotency = async () => {
      if (!idemRef) return;
      try { await idemRef.delete(); } catch (e) { console.error('Failed to release idempotency key:', e); }
    };

    const batch = db.batch();
    const numTotalAmount = Number(totalAmount);
    const timestamp = STS();
    const now = new Date().toISOString();

    // ── Resolve final transaction ID (auto-generate for cash) ─────────────────
    const finalTxId = (transactionId && transactionId.trim())
      ? transactionId.trim()
      : paymentMethod === 'cash' ? generateCashId() : '';

    // ── UTR check happens after the member loop (below), once we know the
    //    amount actually applied. A UTR may now be reused until its bank
    //    amount is used up — see db/utrLedger.js.

    // ── Agent ──────────────────────────────────────────────────────────────

    // A member with no agent would reach db.collection('agents').doc('') below,
    // which Firestore rejects with the opaque "documentPath is not a valid
    // resource path" — an error that says nothing about the real problem. Fail
    // early with something the user can act on.
    if (!agentId || typeof agentId !== 'string' || !agentId.trim()) {
      // The idempotency key was already claimed above; release it so a genuine
      // retry (once an agent is assigned) isn't rejected as a duplicate.
      await releaseIdempotency();
      return NextResponse.json({
        success: false,
        message: 'This member has no agent assigned, so the payment cannot be recorded against one. Assign an agent to the member first.',
      }, { status: 400 });
    }

    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) throw new Error('Agent not found');
    // Accumulate per-program deltas — written as dot-notation INC() to avoid
    // overwriting the entire programStats map (race condition).
    const programDeltas = {}; // { [programId]: { paid, pending, paidCount, pendingCount } }

    // ── Payment group ──────────────────────────────────────────────────────
    const paymentGroupRef = db.collection('paymentGroups').doc();
    batch.set(paymentGroupRef, {
      agentId, totalAmount: numTotalAmount, paymentMethod, transactionId: finalTxId,
      paymentDate: new Date(paymentDate), createdBy: authResult.user.uid,
      paymentNote, fileUrl: fileUrl || '', paymentType: 'closingPayment',
      createdAt: timestamp,
    });

    // ── Resolve which format was sent ──────────────────────────────────────
    // new format: closingPayments = [{ memberId, closingGroupId, amount, memberName }]
    // old format: memberPayments = [{ memberId, memberName, amount }] — auto-distribute
    const useNewFormat = closingPayments && closingPayments.length > 0;
    const paymentEntries = useNewFormat ? closingPayments : (memberPayments || []);

    let grandTotalPaid  = 0;
    let grandTotalCount = 0;
    const memberAllocations = {};
    const commissionMembers = [];
    // Member advance spent in this payment (paymentMethod 'memberAdvance'):
    // memberId → { amount, memberData }. A member can appear in several
    // closing-group entries, so track what's already been taken.
    const advanceSpent = {};
    const memberDataCache = {};
    // closing_payment docs changed in this batch → used to recompute counts
    const cpOverrides = {};

    // ── Helper: update single closing_payment doc ──────────────────────────
    const updateClosingPaymentDoc = (cpDoc, coverAmount) => {
      const docTotal     = Number(cpDoc.totalAmount || 0);
      const docPaidSoFar = Number(cpDoc.paidAmount  || 0);
      const newDocPaid   = docPaidSoFar + coverAmount;
      const docFullyPaid = newDocPaid >= docTotal;
      const cpRef        = db.collection("closing_payment").doc(cpDoc.id);
      cpOverrides[cpDoc.id] = { paidAmount: newDocPaid, status: docFullyPaid ? "paid" : "partial" };

      batch.update(cpRef, {
        paidAmount:        newDocPaid,
        pendingAmount:     Math.max(0, docTotal - newDocPaid),
        status:            docFullyPaid ? "paid" : "partial",
        paymentPercentage: docTotal > 0 ? Number(((newDocPaid / docTotal) * 100).toFixed(2)) : 100,
        lastPaymentAmount:   coverAmount,
        lastPaymentDate:     paymentDate || now,
        lastPaymentMethod:   paymentMethod,
        lastPaymentGroupId:  paymentGroupRef.id,
        lastPaymentNote:     paymentNote     || null,
        lastTransactionId:   finalTxId || null,
        lastFileUrl:         fileUrl   || null,
        lastPaidBy:          authResult.user.uid,
        lastPaidByName:      authResult.user.displayName || null,
        lastUpdatedAt:       timestamp,
        paymentHistory: admin.firestore.FieldValue.arrayUnion({
          amount: coverAmount, paymentDate: paymentDate || now, paymentMethod,
          paymentGroupId: paymentGroupRef.id, transactionId: finalTxId || null,
          fileUrl: fileUrl || null, note: paymentNote || null,
          paidBy: authResult.user.uid, paidAt: now,
        }),
      });

      // Closing counts are counts of CLOSINGS (marriage events), not of
      // closing_payment docs: one group doc can hold several closings
      // (closingCount). A closing counts as paid only when its doc is FULLY
      // paid — the same rule closed_payment_entry and closing/audit use.
      // This used to add 1 per doc that was 'pending' (even on a partial
      // payment), so paying a 2-closing group showed "1/5" instead of "2/5".
      const closingsInDoc   = Number(cpDoc.closingCount || cpDoc.closingDetails?.length || 1);
      const closingsNowPaid = (docFullyPaid && cpDoc.status !== 'paid') ? closingsInDoc : 0;

      return { docFullyPaid, closingsNowPaid, closingGroupId: cpDoc.closingGroupId };
    };

    // ── Per-member/per-group loop ────────────────────────────────────────────
    for (const payment of paymentEntries) {
      const { memberId, memberName, amount } = payment;
      const requestedAmount = Number(amount);
      if (requestedAmount <= 0) continue;

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) continue;

      const memberData     = memberDoc.data();

      // Guard: never accept payments for soft-deleted (trashed) members
      if (memberData.delete_flag === true) {
        console.warn(`[closingPayment] Member ${memberId} is deleted (in trash) — skipping`);
        continue;
      }

      const pId            = memberData.programId   || '';
      const programName    = memberData.programName || '';
      const closingPending = Number(memberData.closing_pendingAmount || 0);
      const pendingCnt     = Number(memberData.pendingClosingCount  || 0);

      if (closingPending <= 0) {
        console.warn(`[closingPayment] Member ${memberId} has no closing_pendingAmount — skipping`);
        continue;
      }

      memberDataCache[memberId] = memberData;

      let deduction = Math.min(requestedAmount, closingPending);

      // Paying out of the member's own advance — never more than they have.
      if (isMemberAdvancePay) {
        const spentSoFar = advanceSpent[memberId]?.amount || 0;
        const available  = memberAdvanceOf(memberData) - spentSoFar;
        deduction = Math.min(deduction, Math.max(0, available));
        if (deduction > 0) {
          advanceSpent[memberId] = { amount: spentSoFar + deduction, memberData };
        }
      }
      if (deduction <= 0) continue;

      let paidDocsCount = 0;
      const paidGroupIds = [];

      try {
        if (useNewFormat && payment.closingGroupId) {
          // ── NEW FORMAT: pay a specific closing group ───────────────────────
          const cpDocId = `${memberId}_${payment.closingGroupId}`;
          const cpSnap = await db.collection("closing_payment").doc(cpDocId).get();
          if (cpSnap.exists) {
            const cpData = { id: cpDocId, ...cpSnap.data() };
            const docPending = Number(cpData.totalAmount || 0) - Number(cpData.paidAmount || 0);
            const coverAmount = Math.min(deduction, docPending);
            if (coverAmount > 0) {
              const result = updateClosingPaymentDoc(cpData, coverAmount);
              paidDocsCount += result.closingsNowPaid;
              paidGroupIds.push({ closingGroupId: result.closingGroupId, amount: coverAmount });
            }
          }
        } else {
          // ── OLD FORMAT: auto-distribute across pending docs oldest-first ──
          const pendingClosingDocs = await fetchClosingPaymentDocs(memberId);
          let remainingDeduction = deduction;

          for (const cpDoc of pendingClosingDocs) {
            if (remainingDeduction <= 0) break;
            const docPending = Number(cpDoc.totalAmount || 0) - Number(cpDoc.paidAmount || 0);
            if (docPending <= 0) continue;
            const coverAmount = Math.min(remainingDeduction, docPending);
            const result = updateClosingPaymentDoc(cpDoc, coverAmount);
            remainingDeduction -= coverAmount;
            paidDocsCount += result.closingsNowPaid;
            paidGroupIds.push({ closingGroupId: result.closingGroupId, amount: coverAmount });
          }
        }
      } catch (cpErr) {
        console.error(`[closingPayment] closing_payment update failed for ${memberId}:`, cpErr);
      }

      // ── Build per-group update map for member doc ────────────────────────
      const groupUpdates = {};
      for (const g of paidGroupIds) {
        const gId = g.closingGroupId;
        if (!gId) continue;
        // Read current per-group values from member doc (or default 0)
        const currPaid   = Number((memberData.closingGroupPaidAmounts || {})[gId] || 0);
        const currPending = Number((memberData.closingGroupPendingAmounts || {})[gId] || 0);
        const oldTotal    = currPaid + currPending;
        const newPaidAmt  = currPaid + g.amount;
        const newPending  = Math.max(0, oldTotal - newPaidAmt);
        groupUpdates[`closingGroupPaidAmounts.${gId}`]    = newPaidAmt;
        groupUpdates[`closingGroupPendingAmounts.${gId}`] = newPending;
        groupUpdates[`closingGroupPaidCounts.${gId}`]     = INC(1);
        groupUpdates[`closingGroupStatus.${gId}`]         = newPending <= 0 ? "paid" : "partial";
      }

      // ── Update member doc ────────────────────────────────────────────────
      const closingTotal = memberData.closing_totalAmount || 0;
      const newPaid      = (memberData.closing_paidAmount || 0) + deduction;
      const paymentPct   = closingTotal > 0 ? Math.min((newPaid / closingTotal) * 100, 100) : 0;
      const decrementCnt = Math.min(paidDocsCount, pendingCnt);

      batch.update(memberRef, {
        closing_paidAmount:         INC(deduction),
        closing_pendingAmount:      INC(-deduction),
        closing_paymentPercentage:  Number(paymentPct.toFixed(2)),
        // paid/pending closing COUNTS are recomputed after this loop
        updated_at:                 timestamp,
        ...groupUpdates,
      });

      // ── Program stats ────────────────────────────────────────────────────
      if (pId) {
        batch.set(db.collection('programs').doc(pId), {
          totalClosingPaidAmount:    INC(deduction),
          totalClosingPendingAmount: INC(-deduction),
          updated_at:                timestamp,
        }, { merge: true });

        if (!programDeltas[pId]) programDeltas[pId] = { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 };
        programDeltas[pId].paid        += deduction;
        programDeltas[pId].pending     -= deduction;
      }

      // ── Commission ──────────────────────────────────────────────────────
      commissionMembers.push({
        memberId,
        memberName: memberData.displayName || memberName,
        memberFatherName: memberData.fatherName || '',
        memberRegNo: memberData.registrationNumber || '',
        deduction, programId: pId, programName
      });

      const closingGroupIdsStr = paidGroupIds.map(g => g.closingGroupId).filter(Boolean).join(',');
      memberAllocations[memberId] = { programId: pId, programName, amount: deduction, paidDocsCount, closingGroupIds: closingGroupIdsStr };
      grandTotalPaid  += deduction;

      // ── Transaction record ─────────────────────────────────────────────
      const fatherName = memberData.fatherName || '';
      const phone = memberData.phone || '';
      const regNo = memberData.registrationNumber || '';
      const aadhaarNo = memberData.aadhaarNo || '';
      const displayName = memberData.displayName || memberName;
      const keyword = [displayName, regNo, fatherName, phone, aadhaarNo]
        .filter(Boolean).join(' ').toLowerCase();

      batch.set(db.collection('memberClosingFees').doc(), {
        memberId, memberName: displayName,
        memberFatherName: fatherName,
        memberPhone: phone,
        memberRegNo: regNo,
        memberAadhaar: aadhaarNo,
        programId: pId, programName,
        amount: deduction, requestedAmount,
        paymentMode:     paymentMethod,
        transactionId:   finalTxId,
        transactionDate: paymentDate,
        status:          'completed',
        createdBy:       authResult.user.uid,
        paymentNote,
        groupId:         paymentGroupRef.id,
        closingGroupId:  paidGroupIds.map(g => g.closingGroupId).filter(Boolean)[0] || '',
        paymentType:     'closingPayment',
        agentId:         agentId || '',
        createdAt:       timestamp,
        search_keyword: keyword,
      });
    }

    // ── Closing counts: recompute from the closing_payment docs ─────────────
    // Paid closings are counted from the money on each group doc (see
    // utils/closingCounts.js), and written as ABSOLUTE values instead of a
    // running +1/−1 — the counter used to drift (₹800 paid = 2 closings, yet
    // "1/5" shown). Agent / program / org counters move by the change.
    let countPendingDelta = 0;
    for (const [memberId, alloc] of Object.entries(memberAllocations)) {
      const counts = await recomputeMemberClosingCounts(memberId, cpOverrides);
      if (!counts) continue;                       // legacy: no group docs
      const old      = memberDataCache[memberId] || {};
      const dPaid    = counts.paidClosingCount    - Number(old.paidClosingCount    || 0);
      const dPending = counts.pendingClosingCount - Number(old.pendingClosingCount || 0);
      batch.update(db.collection('members').doc(memberId), counts);
      alloc.paidDocsCount = Math.max(0, dPaid);
      grandTotalCount    += dPaid;
      countPendingDelta  += dPending;
      if (alloc.programId) {
        const pd = (programDeltas[alloc.programId] ||= { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 });
        pd.paidCount    += dPaid;
        pd.pendingCount += dPending;
      }
    }
    for (const [pId, d] of Object.entries(programDeltas)) {
      if (!d.paidCount && !d.pendingCount) continue;
      batch.set(db.collection('programs').doc(pId), {
        paidClosingCount:    INC(d.paidCount),
        pendingClosingCount: INC(d.pendingCount),
        updated_at:          timestamp,
      }, { merge: true });
    }

    // ── Member advance spent (paymentMethod 'memberAdvance') ────────────────
    for (const [memberId, s] of Object.entries(advanceSpent)) {
      applyOps(batch, debitOps({
        memberId, memberData: s.memberData, amount: s.amount,
        paymentGroupId: paymentGroupRef.id, transactionId: finalTxId,
        note: paymentNote || null, createdBy: currentUser.uid, agentId,
      }));
    }

    // ── Extra amount → member advance ───────────────────────────────────────
    // Only real money (cash / online) can create advance; paying from an
    // advance can't create more of it.
    let advanceCreditedTotal = 0;
    const advanceCreditMap = {};
    if (!isMemberAdvancePay && paymentMethod !== 'advance' && Array.isArray(memberAdvanceCredits)) {
      for (const c of memberAdvanceCredits) {
        const amt = Math.round(Number(c?.amount || 0) * 100) / 100;
        if (!c?.memberId || amt <= 0) continue;
        let mData = memberDataCache[c.memberId];
        if (!mData) {
          const s = await db.collection('members').doc(c.memberId).get();
          if (!s.exists) continue;
          mData = s.data();
        }
        if (mData.delete_flag === true) continue;
        applyOps(batch, creditOps({
          memberId: c.memberId, memberData: mData, amount: amt,
          paymentGroupId: paymentGroupRef.id, transactionId: finalTxId,
          paymentMethod, note: paymentNote || null, createdBy: currentUser.uid, agentId,
        }));
        advanceCreditMap[c.memberId] = (advanceCreditMap[c.memberId] || 0) + amt;
        advanceCreditedTotal += amt;
      }
    }

    // ── Guard: nothing was actually applied — don't write a phantom group ────
    if (grandTotalPaid + advanceCreditedTotal <= 0) {
      await releaseIdempotency();
      return NextResponse.json({
        success: false,
        message: isMemberAdvancePay
          ? 'No payment applied — the selected members have no advance balance (or nothing pending).'
          : 'No payment applied — all selected members were skipped (nothing pending, deleted, or not found).',
      }, { status: 400 });
    }

    // ── UTR capacity check ──────────────────────────────────────────────────
    // A UTR can be shared by several payments (different agents, closing +
    // join fees) as long as the total doesn't exceed the bank amount.
    if (transactionId && transactionId.trim() !== '') {
      const utrCheck = await checkUtrCapacity({
        utr: transactionId,
        amount: grandTotalPaid + advanceCreditedTotal,
        utrTotalAmount,
        createdBy: currentUser.uid,
      });
      if (!utrCheck.ok) {
        await releaseIdempotency();
        return NextResponse.json({ success: false, message: utrCheck.message, duplicate: true }, { status: 409 });
      }
      if (utrCheck.registryWrite) {
        batch.set(utrCheck.registryWrite.ref, utrCheck.registryWrite.data, { merge: true });
      }
    }

    // ── Agent main doc — use dot-notation INC per programId (atomic, no race) ──
    // NOTE: must use update(), NOT set({merge:true}) — the Admin SDK only
    // interprets dot-notation field paths in update(); set() would create
    // literal top-level fields named "programStats.x.y" (stats mismatch bug).
    // Clamp the decrements so the agent can never go negative.
    //
    // INC(-grandTotalPaid) has no floor: whenever the agent's stored pending was
    // already lower than the payment being applied — a member charged without
    // the agent aggregate being updated, a half-applied close, a stat that was
    // rebuilt in between — the subtraction ran straight past zero. That is how
    // an agent ends up showing closing pending of -12,000. Reading the agent doc
    // first and writing an absolute floor costs one read and makes the field
    // impossible to corrupt this way.
    const agentSnapNow  = await agentRef.get();
    const agentNow      = agentSnapNow.exists ? agentSnapNow.data() : {};
    const curPending    = Number(agentNow.closing_pendingAmount || 0);
    const curPendCount  = Number(agentNow.pendingClosingCount   || 0);

    if (curPending < grandTotalPaid) {
      console.warn(
        `[ClosingPayment] agent ${agentId} pending (${curPending}) is less than the ` +
        `payment being applied (${grandTotalPaid}) — clamping to 0. Agent stats have ` +
        `drifted from their members; run Sync Stats.`
      );
    }

    const agentUpdate = {
      closing_paidAmount:    INC(grandTotalPaid),
      closing_pendingAmount: Math.max(0, curPending   - grandTotalPaid),
      paidClosingCount:      INC(grandTotalCount),
      pendingClosingCount:   Math.max(0, curPendCount + countPendingDelta),
      updated_at:            timestamp,
    };
    for (const [pid, delta] of Object.entries(programDeltas)) {
      agentUpdate[`programStats.${pid}.totalClosingPaidAmount`]    = INC(delta.paid);
      agentUpdate[`programStats.${pid}.totalClosingPendingAmount`] = INC(delta.pending);
      agentUpdate[`programStats.${pid}.paidClosingCount`]          = INC(delta.paidCount);
      agentUpdate[`programStats.${pid}.pendingClosingCount`]       = INC(delta.pendingCount);
      agentUpdate[`programStats.${pid}.lastUpdated`]               = timestamp;
    }
    batch.update(agentRef, agentUpdate);

    // ── Finalize payment group — keep totalAmount equal to actual applied ────
    batch.update(paymentGroupRef, {
      status:          'completed',
      paidAt:          timestamp,
      memberAllocations,
      totalAmount:     grandTotalPaid,
      requestedAmount: numTotalAmount,
      actualTotalPaid: grandTotalPaid,
      // Extra kept as member advance — counts toward the UTR's usage
      advanceCredited:      advanceCreditedTotal,
      memberAdvanceCredits: advanceCreditMap,
      utrTotalAmount:       Number(utrTotalAmount || 0) || null,
    });

    // ── Org stats ──────────────────────────────────────────────────────────
    batch.set(db.collection('organizationStats').doc('current'), {
      totalClosingPaidAmount:    INC(grandTotalPaid),
      totalClosingPendingAmount: INC(-grandTotalPaid),
      paidClosingCount:          INC(grandTotalCount),
      pendingClosingCount:       INC(countPendingDelta),
      updated_at:                timestamp,
    }, { merge: true });

    await batch.commit();
    committed = true;

    // Payment is durable from here — mark the key so any replay of this exact
    // submission returns the existing group instead of writing another one.
    if (idemRef) {
      try {
        await idemRef.update({
          status:         'completed',
          paymentGroupId: paymentGroupRef.id,
          actualTotalPaid: grandTotalPaid,
          completedAt:    admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to mark idempotency key completed:', e);
      }
    }

    // ── Commission — 5% of each closing payment credited to agent wallet ──
    const agentSnap = await agentRef.get();
    const agentName = agentSnap.exists ? agentSnap.data().name || '' : '';
    const commissionPromises = commissionMembers.map(c =>
      creditCommissionStandalone({
        agentId, agentName,
        amount: c.deduction,
        source: 'closingPayment',
        sourceId: c.memberId,
        memberName: c.memberName,
        memberFatherName: c.memberFatherName,
        memberRegNo: c.memberRegNo,
        programId: c.programId,
        programName: c.programName,
        createdBy: authResult.user.uid,
        paymentGroupId: paymentGroupRef.id,
      })
    );
    await Promise.allSettled(commissionPromises);

    // ── Notify agent ──────────────────────────────────────────
    const closingMemberNames = commissionMembers.map(m => m.memberName).join(', ');
    await sendToAgent(
      agentId,
      "Closing Payment Received",
      `₹${grandTotalPaid} received for ${commissionMembers.length} member(s): ${closingMemberNames || agentName}` +
        (advanceCreditedTotal > 0 ? ` (+₹${advanceCreditedTotal} kept as member advance)` : ''),
      { type: 'closingPayment', amount: String(grandTotalPaid), memberCount: String(commissionMembers.length) }
    );

    return NextResponse.json({
      success: true,
      message: 'Closing payment processed successfully',
      data: {
        paymentGroupId:       paymentGroupRef.id,
        totalAmount:          grandTotalPaid,
        totalClosingEntries:  grandTotalCount,
        allocations:          memberAllocations,
        advanceCredited:      advanceCreditedTotal,
      },
    });

  } catch (error) {
    console.error('❌ Error processing closing payment:', error);
    // Free the key so a genuine retry isn't blocked by a failed attempt — but
    // only if nothing was written. If the batch committed and a later step
    // (commission, FCM) threw, the payment exists and must stay claimed.
    if (idemRefOuter && !committed) {
      try { await idemRefOuter.delete(); }
      catch (e) { console.error('Failed to release idempotency key after error:', e); }
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}