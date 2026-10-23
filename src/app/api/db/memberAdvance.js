// app/api/db/memberAdvance.js
//
// Member advance = money a member paid beyond what they owed (e.g. ₹10,000
// against ₹8,000 pending → ₹2,000 advance). It sits on the member doc as
// `memberAdvanceBalance` and can later be spent on closing payments
// (paymentMethod 'memberAdvance').
//
// Every movement is recorded in `memberAdvanceLedger`:
//   type 'credit'  — extra amount parked from a payment
//   type 'debit'   — advance spent on a closing payment
//   type 'reversal'— a credit or debit undone because its payment was reverted
import admin from './firebaseAdmin';

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

export const MEMBER_ADVANCE_FIELD = 'memberAdvanceBalance';

export const memberAdvanceOf = (memberData) =>
  Number((memberData || {})[MEMBER_ADVANCE_FIELD] || 0);

const ledgerBase = (memberId, memberData, extra) => ({
  memberId,
  memberName:  memberData?.displayName || '',
  memberRegNo: memberData?.registrationNumber || '',
  agentId:     memberData?.agentId || extra.agentId || '',
  createdAt:   STS(),
  ...extra,
});

/** Ops (for a batch) that move `amount` INTO the member's advance. */
export function creditOps({ memberId, memberData, amount, paymentGroupId, transactionId, paymentMethod, note, createdBy, agentId, source = 'payment' }) {
  const before = memberAdvanceOf(memberData);
  return [
    { kind: 'update', ref: db.collection('members').doc(memberId),
      data: { [MEMBER_ADVANCE_FIELD]: INC(amount), updated_at: STS() } },
    { kind: 'set', ref: db.collection('memberAdvanceLedger').doc(),
      data: ledgerBase(memberId, memberData, {
        type: 'credit', amount, source,   // 'payment' = extra on a payment, 'direct' = advance deposit
        balanceBefore: before, balanceAfter: before + amount,
        paymentGroupId: paymentGroupId || '', transactionId: transactionId || '',
        paymentMethod: paymentMethod || '', note: note || 'Extra amount kept as advance',
        createdBy: createdBy || null, agentId,
      }) },
  ];
}

/** Ops that spend `amount` FROM the member's advance. Caller checks the balance. */
export function debitOps({ memberId, memberData, amount, paymentGroupId, transactionId, note, createdBy, agentId }) {
  const before = memberAdvanceOf(memberData);
  return [
    { kind: 'update', ref: db.collection('members').doc(memberId),
      data: { [MEMBER_ADVANCE_FIELD]: INC(-amount), updated_at: STS() } },
    { kind: 'set', ref: db.collection('memberAdvanceLedger').doc(),
      data: ledgerBase(memberId, memberData, {
        type: 'debit', amount,
        balanceBefore: before, balanceAfter: before - amount,
        paymentGroupId: paymentGroupId || '', transactionId: transactionId || '',
        paymentMethod: 'memberAdvance', note: note || 'Advance used for closing payment',
        createdBy: createdBy || null, agentId,
      }) },
  ];
}

/** Apply op list from creditOps/debitOps/planReversal to a batch-like object. */
export function applyOps(batch, ops) {
  for (const op of ops) {
    if (op.kind === 'update') batch.update(op.ref, op.data);
    else batch.set(op.ref, op.data, op.opts || {});
  }
}

/**
 * Plan undoing the advance movements of a reverted payment.
 *
 *  - credits made by this payment group are taken back (member must still
 *    have that much advance — if it was already spent, the revert is refused)
 *  - advance spent by the reverted fee docs (paymentMode 'memberAdvance')
 *    is given back
 *
 * @param paymentGroupId
 * @param memberIds   only these members (single-fee revert); null = whole group
 * @param refundFees  fee docs being reverted: [{ memberId, amount, paymentMode }]
 * @returns {{ ok: true, ops, creditReversed }} | {{ ok: false, message }}
 */
export async function planReversal({ paymentGroupId, memberIds = null, refundFees = [], createdBy }) {
  const ops = [];
  const balanceDelta = {};        // memberId → change to advance
  let creditReversed = 0;

  if (paymentGroupId) {
    const snap = await db.collection('memberAdvanceLedger')
      .where('paymentGroupId', '==', paymentGroupId)
      .get();
    snap.forEach((d) => {
      const c = d.data();
      if (c.type !== 'credit' || c.reversed) return;
      if (memberIds && !memberIds.includes(c.memberId)) return;
      const amt = Number(c.amount || 0);
      balanceDelta[c.memberId] = (balanceDelta[c.memberId] || 0) - amt;
      creditReversed += amt;
      ops.push({ kind: 'update', ref: d.ref, data: { reversed: true, reversedAt: STS(), reversedBy: createdBy || null } });
    });
  }

  for (const f of refundFees) {
    if (f.paymentMode !== 'memberAdvance' || !f.memberId) continue;
    balanceDelta[f.memberId] = (balanceDelta[f.memberId] || 0) + Number(f.amount || 0);
  }

  const touched = Object.keys(balanceDelta).filter((id) => balanceDelta[id] !== 0);
  if (!touched.length) return { ok: true, ops, creditReversed };

  const snaps = await Promise.all(touched.map((id) => db.collection('members').doc(id).get()));
  for (const s of snaps) {
    if (!s.exists) continue;
    const m = s.data();
    const before = memberAdvanceOf(m);
    const delta  = balanceDelta[s.id];
    if (before + delta < -0.001) {
      return {
        ok: false,
        message:
          `Cannot revert: ${m.displayName || s.id} has only ₹${before.toLocaleString('en-IN')} advance left, ` +
          `but this payment put ₹${(-delta).toLocaleString('en-IN')} into it — that advance was already spent. ` +
          `Revert the payment that used the advance first.`,
      };
    }
    ops.push({ kind: 'update', ref: s.ref, data: { [MEMBER_ADVANCE_FIELD]: INC(delta), updated_at: STS() } });
    ops.push({ kind: 'set', ref: db.collection('memberAdvanceLedger').doc(),
      data: ledgerBase(s.id, m, {
        type: 'reversal', amount: Math.abs(delta), direction: delta > 0 ? 'in' : 'out',
        balanceBefore: before, balanceAfter: before + delta,
        paymentGroupId: paymentGroupId || '', note: 'Payment reverted',
        createdBy: createdBy || null,
      }) });
  }
  return { ok: true, ops, creditReversed };
}
