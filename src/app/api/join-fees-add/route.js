import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { creditCommissionStandalone } from "../commission/route";
import { sendToAgent } from "../db/fcm";

const db = admin.firestore();

// Auto-generate a cash reference ID so cash payments are searchable
const generateCashId = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSH-${date}-${time}-${rand}`;
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const currentUser = authResult.user;

    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to create payment entry' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      memberPayments, paymentDate, paymentMethod, paymentNote,
      totalAmount, transactionId, fileUrl, agentId
    } = body;

    const batch        = db.batch();
    const numTotalAmount = Number(totalAmount);

    // ── Resolve final transaction ID (auto-generate for cash) ─────────────────
    // Online payments provide a UTR; cash payments get an auto-generated CSH-... ID
    // so they are searchable in payment history.
    const finalTxId = (transactionId && transactionId.trim())
      ? transactionId.trim()
      : paymentMethod === 'cash' ? generateCashId() : '';

    // ── Duplicate UTR / transaction ID check (online only) ───────────────────
    if (transactionId && transactionId.trim() !== '') {
      const utrSnap = await db.collection('paymentGroups')
        .where('transactionId', '==', transactionId.trim())
        .limit(1)
        .get();
      if (!utrSnap.empty) {
        const existing = utrSnap.docs[0].data();
        const existingDate = existing.paymentDate?.toDate
          ? existing.paymentDate.toDate().toLocaleDateString('en-IN')
          : existing.paymentDate || '';
        return NextResponse.json({
          success: false,
          message: `Duplicate transaction: UTR/Transaction ID "${transactionId.trim()}" was already used in a ${existing.paymentType === 'joinFees' ? 'Join Fees' : 'Closing'} payment on ${existingDate}. Please verify and use a different ID.`,
          duplicate: true,
          existingPaymentGroupId: utrSnap.docs[0].id,
        }, { status: 409 });
      }
    }

    // ── Agent doc ─────────────────────────────────────────────────────────────
    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) throw new Error("Agent not found");

    // Accumulate per-program deltas — will be written as dot-notation INC()
    // to avoid overwriting the entire programStats map (race condition).
    const programDeltas = {}; // { [programId]: { paid: number, pending: number } }

    // Track actual deduction sum — some members may be skipped, so body.totalAmount
    // may be larger than what is actually deducted.
    let actualTotalPaid = 0;

    // ── Payment group (one record per batch) ──────────────────────────────────
    const paymentGroupRef = db.collection('paymentGroups').doc();
    batch.set(paymentGroupRef, {
      agentId,
      totalAmount:   numTotalAmount,
      paymentMethod,
      transactionId: finalTxId,
      paymentDate:   new Date(paymentDate),
      createdBy:     authResult.user.uid,
      paymentNote,
      fileUrl:       fileUrl || '',
      paymentType:   'joinFees',
      createdAt:     admin.firestore.FieldValue.serverTimestamp()
    });

    // ── Process each member ───────────────────────────────────────────────────
    const commissionMembers = [];
    for (const payment of memberPayments) {
      const { memberId, memberName, amount } = payment;

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) {
        console.warn(`Member ${memberId} not found — skipping`);
        continue;
      }

      const memberData = memberDoc.data();

      // ── Single-program fields live flat on the member doc ─────────────────
      const programId      = memberData.programId      || '';
      const programName    = memberData.programName    || '';
      const pendingAmount  = memberData.pendingAmount  || 0;
      const currentPaid    = memberData.paidAmount     || 0;
      const joinFees       = memberData.joinFees       || 0;

      // Guard: nothing to pay
      if (pendingAmount <= 0) {
        console.warn(`Member ${memberId} already fully paid — skipping`);
        continue;
      }

      // ── Deduction = min(what they sent, what is actually pending) ─────────
      const requestedAmount  = Number(amount);
      const deduction        = Math.min(requestedAmount, pendingAmount);

      if (deduction <= 0) {
        console.warn(`Deduction is 0 for member ${memberId} — skipping`);
        continue;
      }

      const newPaid        = currentPaid + deduction;
      const newPending     = Math.max(0, pendingAmount - deduction);
      const paymentPct     = joinFees > 0 ? Math.min((newPaid / joinFees) * 100, 100) : 0;
      const paymentStatus  = paymentPct >= 100 ? 'paid' : paymentPct > 0 ? 'partial' : 'pending';

      // ── Update member doc (all financial + payment status fields) ──────────
      batch.update(memberRef, {
        paidAmount:         admin.firestore.FieldValue.increment(deduction),
        pendingAmount:      admin.firestore.FieldValue.increment(-deduction),
        paymentPercentage:  Number(paymentPct.toFixed(2)),
        paymentStatus,
        hasPendingPayments: newPending > 0,
        updated_at:         admin.firestore.FieldValue.serverTimestamp()
      });

      // ── Update global program stats ────────────────────────────────────────
      if (programId) {
        const globalProgramRef = db.collection('programs').doc(programId);
        batch.set(globalProgramRef, {
          totalJoinFeesPaid:    admin.firestore.FieldValue.increment(deduction),
          totalJoinFeesPending: admin.firestore.FieldValue.increment(-deduction),
          updated_at:           admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // ── Accumulate per-program deltas for agent programStats ─────────────
        if (!programDeltas[programId]) programDeltas[programId] = { paid: 0, pending: 0 };
        programDeltas[programId].paid    += deduction;
        programDeltas[programId].pending -= deduction;
      }

      actualTotalPaid += deduction;

    // ── Transaction record ────────────────────────────────────────────────
    const fatherName = memberData.fatherName || '';
    const phone = memberData.phone || '';
    const regNo = memberData.registrationNumber || '';
    const aadhaarNo = memberData.aadhaarNo || '';
    const displayName = memberData.displayName || memberName;
    const keyword = [displayName, regNo, fatherName, phone, aadhaarNo]
      .filter(Boolean).join(' ').toLowerCase();

    const feeRef = db.collection('memberJoinFees').doc();
    batch.set(feeRef, {
      memberId,
      memberName: displayName,
      memberFatherName: fatherName,
      memberPhone: phone,
      memberRegNo: regNo,
      memberAadhaar: aadhaarNo,
      programId,
      programName,
      amount:           deduction,          // actual applied amount
      requestedAmount,                       // original requested amount
      paymentMode:      paymentMethod,
      transactionId:    finalTxId,
      transactionDate:  paymentDate,
      status:           'completed',
      createdBy:        authResult.user.uid,
      paymentNote,
      groupId:          paymentGroupRef.id,
      agentId:          agentId || '',
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
      search_keyword: keyword
    });

    commissionMembers.push({
      memberId,
      memberName: memberData.displayName || memberName,
      memberFatherName: memberData.fatherName || '',
      memberRegNo: memberData.registrationNumber || '',
      deduction, programId, programName
    });
  }

    // ── Agent totals — use dot-notation INC per programId (atomic, no race) ──
    const agentUpdate = {
      totalJoinFeesPaid:    admin.firestore.FieldValue.increment(actualTotalPaid),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(-actualTotalPaid),
      updated_at:           admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const [pid, delta] of Object.entries(programDeltas)) {
      agentUpdate[`programStats.${pid}.totalJoinFeesPaid`]    = admin.firestore.FieldValue.increment(delta.paid);
      agentUpdate[`programStats.${pid}.totalJoinFeesPending`] = admin.firestore.FieldValue.increment(delta.pending);
      agentUpdate[`programStats.${pid}.lastUpdated`]          = admin.firestore.FieldValue.serverTimestamp();
    }
    batch.set(agentRef, agentUpdate, { merge: true });

    // ── Org totals ────────────────────────────────────────────────────────────
    const orgRef = db.collection('organizationStats').doc('current');
    batch.set(orgRef, {
      totalJoinFeesPaid:    admin.firestore.FieldValue.increment(actualTotalPaid),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(-actualTotalPaid),
      updated_at:           admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();

    // ── Commission processing — 5% of each payment credited to agent wallet ──
    const agentSnap = await agentRef.get();
    const agentName = agentSnap.exists ? agentSnap.data().name || '' : '';
    const commissionPromises = commissionMembers.map(c =>
      creditCommissionStandalone({
        agentId, agentName,
        amount: c.deduction,
        source: 'joinFees',
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

    // ── Notify agent ──────────────────────────────────────────
    const memberNames = commissionMembers.map(m => m.memberName).join(', ');
    await sendToAgent(
      agentId,
      "Join Fee Payment Received",
      `₹${actualTotalPaid} received for ${commissionMembers.length} member(s): ${memberNames || agentName}`,
      { type: 'joinFee', amount: String(actualTotalPaid), memberCount: String(commissionMembers.length) }
    );

    return NextResponse.json({ success: true, message: "Payment processed successfully" });

  } catch (error) {
    console.error("❌ Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}