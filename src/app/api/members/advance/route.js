// /api/members/advance — a member pays money IN ADVANCE (nothing due yet, or
// on purpose ahead of the next closing).
//
//   GET    ?memberId=…            advance history (memberAdvanceLedger)
//   POST   { memberId, amount, paymentMethod: 'cash'|'online', transactionId?,
//            utrTotalAmount?, paymentDate?, note?, idempotencyKey? }
//   DELETE { paymentGroupId }      superadmin: undo a direct advance deposit
//
// The money lands in the member's `memberAdvanceBalance` (see db/memberAdvance.js)
// and is spent later with the "Member Advance" method on the closing payment
// page. Each deposit also writes a paymentGroups doc (paymentType
// 'memberAdvance') so the UTR rule — one transfer may be split across
// payments up to its bank amount — counts it, and so it can be undone.
import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { checkUtrCapacity } from '../../db/utrLedger';
import { creditOps, applyOps, planReversal, memberAdvanceOf } from '../../db/memberAdvance';

const db  = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

const generateCashId = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSH-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${rand}`;
};

const deny = (auth) => NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

// ── GET: history ─────────────────────────────────────────────────────────────
export async function GET(req) {
  const auth = await verifyToken(req);
  if (!auth.success) return deny(auth);

  const memberId = new URL(req.url).searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

  try {
    const [memberSnap, ledgerSnap] = await Promise.all([
      db.collection('members').doc(memberId).get(),
      db.collection('memberAdvanceLedger').where('memberId', '==', memberId).get(),
    ]);
    const rows = ledgerSnap.docs
      .map(d => {
        const x = d.data();
        return { id: d.id, ...x, createdAt: x.createdAt?.toDate?.()?.toISOString?.() || null };
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return NextResponse.json({
      success: true,
      balance: memberSnap.exists ? memberAdvanceOf(memberSnap.data()) : 0,
      data: rows,
    });
  } catch (e) {
    console.error('[member-advance GET]', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ── POST: deposit ────────────────────────────────────────────────────────────
export async function POST(req) {
  let idemRef = null;
  let committed = false;
  try {
    const auth = await verifyToken(req);
    if (!auth.success) return deny(auth);
    if (!checkRole(['superadmin', 'admin'], auth.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const {
      memberId, amount, paymentMethod = 'cash', transactionId, utrTotalAmount,
      paymentDate, note, idempotencyKey, fileUrl,
    } = await req.json();

    const amt = Math.round(Number(amount || 0) * 100) / 100;
    if (!memberId || !(amt > 0))
      return NextResponse.json({ success: false, message: 'memberId and a positive amount are required' }, { status: 400 });
    if (!['cash', 'online'].includes(paymentMethod))
      return NextResponse.json({ success: false, message: 'paymentMethod must be cash or online' }, { status: 400 });
    if (paymentMethod === 'online' && !String(transactionId || '').trim())
      return NextResponse.json({ success: false, message: 'Transaction ID / UTR is required for online payment' }, { status: 400 });

    // Double-click / retry protection, same as the other payment routes
    if (idempotencyKey) {
      idemRef = db.collection('paymentIdempotency').doc(String(idempotencyKey));
      const prior = await db.runTransaction(async (t) => {
        const s = await t.get(idemRef);
        if (s.exists) return s.data();
        t.set(idemRef, { status: 'in_progress', type: 'memberAdvance', memberId, createdBy: auth.user.uid, createdAt: STS() });
        return null;
      });
      if (prior) {
        idemRef = null;   // not ours to release
        return NextResponse.json({ success: true, alreadyProcessed: true, message: 'This advance was already recorded.' });
      }
    }
    const release = async () => { if (idemRef) { try { await idemRef.delete(); } catch {} } };

    const memberSnap = await db.collection('members').doc(memberId).get();
    if (!memberSnap.exists) { await release(); return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 }); }
    const member = memberSnap.data();
    if (member.delete_flag === true) { await release(); return NextResponse.json({ success: false, message: 'Member is deleted (in trash)' }, { status: 400 }); }

    const finalTxId = String(transactionId || '').trim() || (paymentMethod === 'cash' ? generateCashId() : '');
    const batch = db.batch();

    // UTR may be shared with other payments up to its bank amount
    if (paymentMethod === 'online') {
      const chk = await checkUtrCapacity({ utr: finalTxId, amount: amt, utrTotalAmount, createdBy: auth.user.uid });
      if (!chk.ok) { await release(); return NextResponse.json({ success: false, message: chk.message, duplicate: true }, { status: 409 }); }
      if (chk.registryWrite) batch.set(chk.registryWrite.ref, chk.registryWrite.data, { merge: true });
    }

    const groupRef = db.collection('paymentGroups').doc();
    batch.set(groupRef, {
      agentId:              member.agentId || '',
      paymentType:          'memberAdvance',
      status:               'completed',
      totalAmount:          0,              // nothing applied to dues …
      advanceCredited:      amt,            // … all of it kept as advance
      memberAdvanceCredits: { [memberId]: amt },
      memberId,
      memberName:           member.displayName || '',
      paymentMethod,
      transactionId:        finalTxId,
      utrTotalAmount:       Number(utrTotalAmount || 0) || null,
      paymentDate:          paymentDate ? new Date(paymentDate) : new Date(),
      paymentNote:          note || '',
      fileUrl:              fileUrl || '',
      createdBy:            auth.user.uid,
      createdAt:            STS(),
    });

    applyOps(batch, creditOps({
      memberId, memberData: member, amount: amt,
      paymentGroupId: groupRef.id, transactionId: finalTxId, paymentMethod,
      note: note || 'Advance payment', createdBy: auth.user.uid, agentId: member.agentId || '',
      source: 'direct',
    }));

    await batch.commit();
    committed = true;
    if (idemRef) {
      try { await idemRef.update({ status: 'completed', paymentGroupId: groupRef.id, completedAt: STS() }); } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `₹${amt.toLocaleString('en-IN')} advance jama hua`,
      paymentGroupId: groupRef.id,
      newBalance: memberAdvanceOf(member) + amt,
      transactionId: finalTxId,
    });
  } catch (e) {
    console.error('[member-advance POST]', e);
    if (idemRef && !committed) { try { await idemRef.delete(); } catch {} }
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ── DELETE: undo a direct deposit (superadmin) ───────────────────────────────
export async function DELETE(req) {
  try {
    const auth = await verifyToken(req);
    if (!auth.success) return deny(auth);
    if (!checkRole(['superadmin'], auth.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can revert payments' }, { status: 403 });

    const { paymentGroupId } = await req.json();
    if (!paymentGroupId) return NextResponse.json({ success: false, message: 'paymentGroupId is required' }, { status: 400 });

    const groupRef = db.collection('paymentGroups').doc(paymentGroupId);
    const g = await groupRef.get();
    if (!g.exists || g.data().paymentType !== 'memberAdvance')
      return NextResponse.json({ success: false, message: 'Advance payment not found' }, { status: 404 });

    // Refused if the advance was already spent on a closing payment
    const plan = await planReversal({ paymentGroupId, createdBy: auth.user.uid });
    if (!plan.ok) return NextResponse.json({ success: false, message: plan.message }, { status: 400 });

    const batch = db.batch();
    applyOps(batch, plan.ops);
    batch.delete(groupRef);           // frees the amount on its UTR too
    await batch.commit();

    return NextResponse.json({ success: true, message: `Advance ₹${plan.creditReversed.toLocaleString('en-IN')} reverted` });
  } catch (e) {
    console.error('[member-advance DELETE]', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
