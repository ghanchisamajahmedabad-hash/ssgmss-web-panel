import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { creditCommissionStandalone } from "../commission/route";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

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
      totalAmount, transactionId, fileUrl, agentId, programId,
    } = body;

    const batch = db.batch();
    const numTotalAmount = Number(totalAmount);
    const timestamp = STS();
    const now = new Date().toISOString();

    // ── Agent ──────────────────────────────────────────────────────────────
    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) throw new Error('Agent not found');
    let updatedProgramStats = { ...(agentDoc.data().programStats || {}) };

    // ── Payment group ──────────────────────────────────────────────────────
    const paymentGroupRef = db.collection('paymentGroups').doc();
    batch.set(paymentGroupRef, {
      agentId, totalAmount: numTotalAmount, paymentMethod, transactionId,
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

    // ── Helper: update single closing_payment doc ──────────────────────────
    const updateClosingPaymentDoc = (cpDoc, coverAmount) => {
      const docTotal     = Number(cpDoc.totalAmount || 0);
      const docPaidSoFar = Number(cpDoc.paidAmount  || 0);
      const newDocPaid   = docPaidSoFar + coverAmount;
      const docFullyPaid = newDocPaid >= docTotal;
      const cpRef        = db.collection("closing_payment").doc(cpDoc.id);

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
        lastTransactionId:   transactionId   || null,
        lastFileUrl:         fileUrl         || null,
        lastPaidBy:          authResult.user.uid,
        lastPaidByName:      authResult.user.displayName || null,
        lastUpdatedAt:       timestamp,
        paymentHistory: admin.firestore.FieldValue.arrayUnion({
          amount: coverAmount, paymentDate: paymentDate || now, paymentMethod,
          paymentGroupId: paymentGroupRef.id, transactionId: transactionId || null,
          fileUrl: fileUrl || null, note: paymentNote || null,
          paidBy: authResult.user.uid, paidAt: now,
        }),
      });

      return { docFullyPaid, wasPending: cpDoc.status === 'pending', closingGroupId: cpDoc.closingGroupId };
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
      const pId            = memberData.programId   || '';
      const programName    = memberData.programName || '';
      const closingPending = Number(memberData.closing_pendingAmount || 0);
      const pendingCnt     = Number(memberData.pendingClosingCount  || 0);

      if (closingPending <= 0) {
        console.warn(`[closingPayment] Member ${memberId} has no closing_pendingAmount — skipping`);
        continue;
      }

      const deduction = Math.min(requestedAmount, closingPending);
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
              if (result.wasPending) paidDocsCount += 1;
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
            if (result.wasPending) paidDocsCount += 1;
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
        paidClosingCount:           INC(paidDocsCount),
        pendingClosingCount:        decrementCnt > 0 ? INC(-decrementCnt) : INC(0),
        updated_at:                 timestamp,
        ...groupUpdates,
      });

      // ── Program stats ────────────────────────────────────────────────────
      if (pId) {
        batch.set(db.collection('programs').doc(pId), {
          totalClosingPaidAmount:    INC(deduction),
          totalClosingPendingAmount: INC(-deduction),
          paidClosingCount:          INC(paidDocsCount),
          pendingClosingCount:       decrementCnt > 0 ? INC(-decrementCnt) : INC(0),
          updated_at:                timestamp,
        }, { merge: true });

        if (!updatedProgramStats[pId])
          updatedProgramStats[pId] = {
            totalClosingPaidAmount: 0, totalClosingPendingAmount: 0,
            paidClosingCount: 0, pendingClosingCount: 0,
          };
        updatedProgramStats[pId].totalClosingPaidAmount     = (updatedProgramStats[pId].totalClosingPaidAmount     || 0) + deduction;
        updatedProgramStats[pId].totalClosingPendingAmount  = Math.max(0, (updatedProgramStats[pId].totalClosingPendingAmount || 0) - deduction);
        updatedProgramStats[pId].paidClosingCount           = (updatedProgramStats[pId].paidClosingCount           || 0) + paidDocsCount;
        updatedProgramStats[pId].pendingClosingCount        = Math.max(0, (updatedProgramStats[pId].pendingClosingCount || 0) - decrementCnt);
        updatedProgramStats[pId].lastUpdated                = new Date();
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
      grandTotalCount += paidDocsCount;

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
        transactionId:   transactionId || '',
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

    // ── Agent main doc ─────────────────────────────────────────────────────
    batch.set(agentRef, {
      closing_paidAmount:    INC(grandTotalPaid),
      closing_pendingAmount: INC(-grandTotalPaid),
      paidClosingCount:      INC(grandTotalCount),
      pendingClosingCount:   INC(-grandTotalCount),
      programStats:          updatedProgramStats,
      updated_at:            timestamp,
    }, { merge: true });

    // ── Finalize payment group ─────────────────────────────────────────────
    batch.update(paymentGroupRef, {
      status:          'completed',
      paidAt:          timestamp,
      memberAllocations,
      actualTotalPaid: grandTotalPaid,
    });

    // ── Org stats ──────────────────────────────────────────────────────────
    batch.set(db.collection('organizationStats').doc('current'), {
      totalClosingPaidAmount:    INC(grandTotalPaid),
      totalClosingPendingAmount: INC(-grandTotalPaid),
      paidClosingCount:          INC(grandTotalCount),
      pendingClosingCount:       INC(-grandTotalCount),
      updated_at:                timestamp,
    }, { merge: true });

    await batch.commit();

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
      })
    );
    await Promise.allSettled(commissionPromises);

    return NextResponse.json({
      success: true,
      message: 'Closing payment processed successfully',
      data: {
        paymentGroupId:       paymentGroupRef.id,
        totalAmount:          grandTotalPaid,
        totalClosingEntries:  grandTotalCount,
        allocations:          memberAllocations,
      },
    });

  } catch (error) {
    console.error('❌ Error processing closing payment:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}