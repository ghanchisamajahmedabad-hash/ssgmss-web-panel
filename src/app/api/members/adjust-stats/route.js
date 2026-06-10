import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { agentId, programId, paidDelta, type } = await req.json();
    const delta = Number(paidDelta) || 0;
    if (delta === 0) return NextResponse.json({ success: true, message: 'No change' });

    const batch = db.batch();

    if (type === 'joinFees' || !type) {
      if (agentId) {
        batch.set(db.collection('agents').doc(agentId), {
          totalJoinFeesPaid: INC(delta),
          totalJoinFeesPending: INC(-delta),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (programId) {
        batch.set(db.collection('programs').doc(programId), {
          totalJoinFeesPaid: INC(delta),
          totalJoinFeesPending: INC(-delta),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      batch.set(db.collection('organizationStats').doc('current'), {
        totalJoinFeesPaid: INC(delta),
        totalJoinFeesPending: INC(-delta),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (type === 'closingPayment') {
      if (agentId) {
        batch.set(db.collection('agents').doc(agentId), {
          closing_paidAmount: INC(delta),
          closing_pendingAmount: INC(-delta),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (programId) {
        batch.set(db.collection('programs').doc(programId), {
          totalClosingPaidAmount: INC(delta),
          totalClosingPendingAmount: INC(-delta),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      batch.set(db.collection('organizationStats').doc('current'), {
        totalClosingPaidAmount: INC(delta),
        totalClosingPendingAmount: INC(-delta),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    return NextResponse.json({ success: true, message: 'Stats adjusted' });
  } catch (error) {
    console.error('Adjust stats error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
