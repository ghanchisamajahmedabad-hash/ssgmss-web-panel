import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── helpers ──────────────────────────────────────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

// Fetch closing_payment docs for a member — returns all pending docs for that member
const fetchClosingPaymentDocs = async (memberId) => {
  const snap = await db.collection("closing_payment")
    .where("memberId", "==", memberId)
    .where("status", "==", "pending")
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
      memberPayments, paymentDate, paymentMethod, paymentNote,
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

    let grandTotalPaid  = 0;
    let grandTotalCount = 0;
    const memberAllocations = {};

    // ── Per-member loop ────────────────────────────────────────────────────
    for (const payment of memberPayments) {
      const { memberId, memberName, amount } = payment;

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) continue;

      const memberData     = memberDoc.data();
      const pId            = memberData.programId   || '';
      const programName    = memberData.programName || '';
      const closingPending = Number(memberData.closing_pendingAmount || 0);

      if (closingPending <= 0) {
        console.warn(`[closingPayment] Member ${memberId} has no closing_pendingAmount — skipping`);
        continue;
      }

      const requestedAmount = Number(amount);
      const deduction       = Math.min(requestedAmount, closingPending);
      if (deduction <= 0) continue;

      // ── Update member doc ────────────────────────────────────────────────
      const closingTotal = memberData.closing_totalAmount || 0;
      const newPaid      = (memberData.closing_paidAmount || 0) + deduction;
      const paymentPct   = closingTotal > 0 ? Math.min((newPaid / closingTotal) * 100, 100) : 0;
      const isFullyPaid  = (closingPending - deduction) <= 0;

      batch.update(memberRef, {
        closing_paidAmount:         INC(deduction),
        closing_pendingAmount:      INC(-deduction),
        closing_paymentPercentage:  Number(paymentPct.toFixed(2)),
        paidClosingCount:           INC(1),
        pendingClosingCount:        INC(-1),
        updated_at:                 timestamp,
      });

      // ── Update closing_payment collection ────────────────────────────────
      // Find all pending closing_payment docs for this member and update them.
      // Strategy: distribute deduction across pending docs oldest-first,
      // marking each as "paid" or "partial" as the amount covers them.
      try {
        const pendingClosingDocs = await fetchClosingPaymentDocs(memberId);

        let remainingDeduction = deduction;

        for (const cpDoc of pendingClosingDocs) {
          if (remainingDeduction <= 0) break;

          const cpRef        = db.collection("closing_payment").doc(cpDoc.id);
          const docTotal     = Number(cpDoc.totalAmount || 0);
          const docPaidSoFar = Number(cpDoc.paidAmount  || 0);
          const docPending   = docTotal - docPaidSoFar;

          if (docPending <= 0) continue;

          const coverAmount = Math.min(remainingDeduction, docPending);
          const newDocPaid  = docPaidSoFar + coverAmount;
          const docFullyPaid = newDocPaid >= docTotal;

          batch.update(cpRef, {
            // payment tracking
            paidAmount:        newDocPaid,
            pendingAmount:     Math.max(0, docTotal - newDocPaid),
            status:            docFullyPaid ? "paid" : "partial",
            paymentPercentage: docTotal > 0 ? Number(((newDocPaid / docTotal) * 100).toFixed(2)) : 100,

            // payment details
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

            // append to payment history array
            paymentHistory: admin.firestore.FieldValue.arrayUnion({
              amount:          coverAmount,
              paymentDate:     paymentDate || now,
              paymentMethod,
              paymentGroupId:  paymentGroupRef.id,
              transactionId:   transactionId || null,
              fileUrl:         fileUrl       || null,
              note:            paymentNote   || null,
              paidBy:          authResult.user.uid,
              paidAt:          now,
            }),
          });

          remainingDeduction -= coverAmount;
        }
      } catch (cpErr) {
        // Non-fatal — log but don't fail the whole payment
        console.error(`[closingPayment] closing_payment update failed for ${memberId}:`, cpErr);
      }

      // ── Global program stats ──────────────────────────────────────────────
      if (pId) {
        batch.set(db.collection('programs').doc(pId), {
          totalClosingPaidAmount:    INC(deduction),
          totalClosingPendingAmount: INC(-deduction),
          paidClosingCount:          INC(1),
          pendingClosingCount:       INC(-1),
          updated_at:                timestamp,
        }, { merge: true });

        // ── Agent program stats ───────────────────────────────────────────
        if (!updatedProgramStats[pId])
          updatedProgramStats[pId] = {
            totalClosingPaidAmount: 0, totalClosingPendingAmount: 0,
            paidClosingCount: 0, pendingClosingCount: 0,
          };
        updatedProgramStats[pId].totalClosingPaidAmount     = (updatedProgramStats[pId].totalClosingPaidAmount     || 0) + deduction;
        updatedProgramStats[pId].totalClosingPendingAmount  = (updatedProgramStats[pId].totalClosingPendingAmount  || 0) - deduction;
        updatedProgramStats[pId].paidClosingCount           = (updatedProgramStats[pId].paidClosingCount           || 0) + 1;
        updatedProgramStats[pId].pendingClosingCount        = (updatedProgramStats[pId].pendingClosingCount        || 0) - 1;
        updatedProgramStats[pId].lastUpdated                = new Date();
      }

      memberAllocations[memberId] = { programId: pId, programName, amount: deduction };
      grandTotalPaid  += deduction;
      grandTotalCount += 1;

      // ── Transaction record ─────────────────────────────────────────────
      batch.set(db.collection('memberClosingFees').doc(), {
        memberId, memberName,
        programId: pId, programName,
        amount: deduction, requestedAmount,
        paymentMode:     paymentMethod,
        transactionId:   transactionId || '',
        transactionDate: paymentDate,
        status:          'completed',
        createdBy:       authResult.user.uid,
        paymentNote,
        groupId:         paymentGroupRef.id,
        paymentType:     'closingPayment',
        createdAt:       timestamp,
        search_memberName: memberName.toLowerCase(),
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