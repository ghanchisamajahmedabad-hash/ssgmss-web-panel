// POST /api/closing/revert-member
//
// Revert ONE closed member — without touching the other members closed in the
// same closing group (DELETE /api/closed_payment_entry reverses a whole group;
// /api/closing/mark-active only flips the status and leaves every charge).
//
// What happens:
//   1. The member is un-closed (closedStatus entry for the group removed; the
//      closed flags cleared when no other closing is left).
//   2. That member's kist is taken off EVERY member who was charged for it:
//      their closing_payment doc for the group loses the closingDetails entry,
//      closingCount / totalAmount / pending / status are recomputed, and the
//      doc is deleted when nothing is left on it.
//   3. Money already paid on that doc beyond the new total is released:
//        paidHandling 'advance' (default) → goes to the member's advance
//                                           (memberAdvanceLedger credit)
//        paidHandling 'remove'            → taken off, as a whole-group revert does
//   4. Member, agent, group, programme and organisation totals follow.
//   5. History: one `kistRemovalLog` doc per member whose kist was removed and one
//      `closingRevertLog` doc for the revert itself.
//
// Body: { memberId, closingGroupId?, paidHandling?: 'advance'|'remove', reason?, dryRun?: boolean }
// dryRun (default false) → only the preview: who is affected and by how much.
import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { paidClosingsInDoc } from '../../../../utils/closingCounts';
import { creditOps, applyOps } from '../../db/memberAdvance';
import { addKistLog } from '../../db/kistLog';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db  = admin.firestore();
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

const num   = (v) => Number(v) || 0;
const money = (v) => Math.round(num(v));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Batches committed one after another (each is atomic on its own) — same as closed_payment_entry.
class MultiBatch {
  constructor() { this._b = [db.batch()]; this._ops = 0; }
  _cur() {
    if (this._ops >= 450) { this._b.push(db.batch()); this._ops = 0; }
    return this._b[this._b.length - 1];
  }
  set(ref, data, opts) { this._cur().set(ref, data, opts || {}); this._ops++; }
  update(ref, data) { this._cur().update(ref, data); this._ops++; }
  delete(ref) { this._cur().delete(ref); this._ops++; }
  async commit() { for (const b of this._b) await b.commit(); }
}

const fetchMembers = async (ids) => {
  const out = {};
  for (const c of chunk([...new Set(ids)].filter(Boolean), 300)) {
    const snaps = await db.getAll(...c.map((id) => db.collection('members').doc(id)));
    snaps.forEach((s) => { if (s.exists) out[s.id] = { id: s.id, ...s.data() }; });
  }
  return out;
};

const statusOf = (total, paid) => (total <= 0 ? 'pending' : paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending');
const dmy = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.includes('T') ? v.slice(0, 10) : v;
  const t = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(t) ? '' : t.toISOString().slice(0, 10);
};

export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
  if (!checkRole(['superadmin', 'admin'], auth.user.role))
    return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });
  const by = { uid: auth.user.uid || '', name: auth.user.name || auth.user.displayName || auth.user.email || '' };

  try {
    const body = await req.json().catch(() => ({}));
    const memberId = String(body.memberId || '');
    const paidHandling = body.paidHandling === 'remove' ? 'remove' : 'advance';
    const reason = String(body.reason || '').trim().slice(0, 300) || 'Closed member reverted';
    const dryRun = body.dryRun === true;
    if (!memberId) return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    // ── the closed member and their closing group ───────────────────────
    const xSnap = await db.collection('members').doc(memberId).get();
    if (!xSnap.exists) return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });
    const X = { id: xSnap.id, ...xSnap.data() };
    const statusList = Array.isArray(X.closedStatus) ? X.closedStatus : [];
    const lastStatus = statusList[statusList.length - 1] || {};
    const groupId = String(body.closingGroupId || X.closingGroupId || lastStatus.closingGroupId || '');
    if (!groupId && X.member_closed !== true)
      return NextResponse.json({ success: false, message: 'Ye member closed nahi hai' }, { status: 400 });

    const gSnap = groupId ? await db.collection('groupClosings').doc(groupId).get() : null;
    const group = gSnap?.exists ? gSnap.data() : null;
    const programId = group?.programId || lastStatus.programId || X.member_closed_program || X.programId || '';
    const groupName = group?.groupName || '';

    // ── every member charged a kist for X in this group ─────────────────
    const cpSnap = groupId
      ? await db.collection('closing_payment').where('closingGroupId', '==', groupId).get()
      : { docs: [] };
    const plans = [];
    for (const d of cpSnap.docs) {
      const cp = d.data();
      if (cp.isReversed === true) continue;
      const details = Array.isArray(cp.closingDetails) ? cp.closingDetails : [];
      const hits = details.filter((e) => e?.closed_memberId === memberId);
      if (!hits.length) continue;
      const keep = details.filter((e) => e?.closed_memberId !== memberId);

      const count = num(cp.closingCount) || details.length;
      const total = money(cp.totalAmount);
      const pay = num(cp.payAmount) || (count ? total / count : 0);
      const newCount = details.length ? keep.length : Math.max(0, count - hits.length);
      const newTotal = pay > 0 ? money(newCount * pay) : Math.max(0, total - money(hits.length * pay));
      const paid = money(cp.paidAmount);
      const newPaid = Math.min(paid, newTotal);
      const released = paid - newPaid;                       // paid money no longer owed
      const before = { closingCount: count, status: cp.status, paidAmount: paid, payAmount: pay, totalAmount: total };
      const after  = { closingCount: newCount, status: statusOf(newTotal, newPaid), paidAmount: newPaid, payAmount: pay, totalAmount: newTotal };

      plans.push({
        ref: d.ref, id: d.id, cp, payerId: cp.memberId, keep, hits,
        count, newCount, total, newTotal, paid, newPaid, released,
        dPaidCount: paidClosingsInDoc(before) - paidClosingsInDoc(after),
        empty: newCount <= 0,
      });
    }

    const payers = await fetchMembers(plans.map((p) => p.payerId));
    const sum = (k) => plans.reduce((s, p) => s + p[k], 0);
    const removedAmount = plans.reduce((s, p) => s + (p.total - p.newTotal), 0);
    const removedKists  = plans.reduce((s, p) => s + (p.count - p.newCount), 0);
    const releasedPaid  = sum('released');

    const preview = {
      member: { id: X.id, name: X.displayName || '', regNo: X.registrationNumber || '' },
      closingGroupId: groupId, closingGroupName: groupName, programId,
      affectedMembers: plans.length, removedKists, removedAmount, releasedPaid, paidHandling,
      rows: plans.slice(0, 300).map((p) => {
        const m = payers[p.payerId] || {};
        return {
          memberId: p.payerId, name: m.displayName || p.cp.memberName || '', regNo: m.registrationNumber || '',
          kists: p.count - p.newCount, amount: p.total - p.newTotal, paid: p.paid, released: p.released,
          newTotal: p.newTotal, newPaid: p.newPaid, removesDoc: p.empty,
        };
      }),
    };
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, preview });

    // ── write ────────────────────────────────────────────────────────────
    const mb = new MultiBatch();
    const ts = STS();
    const revertRef = db.collection('closingRevertLog').doc();
    const agentD = {};                    // agentId → deltas
    const bumpAgent = (aid, k, v) => { if (!aid || !v) return; (agentD[aid] ??= {})[k] = (agentD[aid][k] || 0) + v; };
    const breakdown = { ...(group?.paymentBreakdown || {}) };
    let paymentMemberIds = [...(group?.paymentMemberIds || [])];
    let pendingDelta = 0, pendingCountDelta = 0;

    for (const p of plans) {
      const m = payers[p.payerId];
      // closing_payment doc
      if (p.empty) {
        mb.delete(p.ref);
      } else {
        const pend = Math.max(0, p.newTotal - p.newPaid);
        mb.update(p.ref, {
          closingDetails: p.keep,
          closingCount: p.newCount,
          totalAmount: p.newTotal,
          paidAmount: p.newPaid,
          pendingAmount: pend,
          status: statusOf(p.newTotal, p.newPaid),
          paymentPercentage: p.newTotal > 0 ? Number(((p.newPaid / p.newTotal) * 100).toFixed(2)) : 0,
          updatedAt: ts,
          updatedBy: by.uid,
          updatedByName: by.name,
          lastKistRemoval: { closedMemberId: memberId, closedMemberName: X.displayName || '', at: new Date().toISOString(), revertId: revertRef.id },
        });
      }

      const dTotal = p.total - p.newTotal;
      const dPaid  = p.released;
      const dCount = p.count - p.newCount;
      const dPend  = dTotal - dPaid;
      pendingDelta += dPend;

      // the paying member's totals
      if (m) {
        const total = Math.max(0, money(m.closing_totalAmount) - dTotal);
        const paid  = Math.max(0, money(m.closing_paidAmount) - dPaid);
        const tCount = Math.max(0, num(m.totalClosingCount) - dCount);
        const pCount = Math.min(tCount, Math.max(0, num(m.paidClosingCount) - p.dPaidCount));
        pendingCountDelta += (num(m.totalClosingCount) - num(m.paidClosingCount)) - (tCount - pCount);
        mb.update(db.collection('members').doc(m.id), {
          closing_totalAmount: total,
          closing_paidAmount: paid,
          closing_pendingAmount: Math.max(0, total - paid),
          closing_paymentPercentage: total > 0 ? Number(((paid / total) * 100).toFixed(2)) : 0,
          totalClosingCount: tCount,
          paidClosingCount: pCount,
          pendingClosingCount: Math.max(0, tCount - pCount),
          ...(p.empty
            ? { closingGroupIds: admin.firestore.FieldValue.arrayRemove(groupId),
                [`closingGroupAmounts.${groupId}`]: DEL(), [`closingGroupCounts.${groupId}`]: DEL() }
            : { [`closingGroupAmounts.${groupId}`]: p.newTotal, [`closingGroupCounts.${groupId}`]: p.newCount }),
          updated_at: ts,
        });
        // paid money that is no longer owed → the member's advance
        if (dPaid > 0 && paidHandling === 'advance') {
          applyOps(mb, creditOps({
            memberId: m.id, memberData: m, amount: dPaid, paymentGroupId: '', transactionId: '',
            paymentMethod: 'kistRevert', source: 'kist-revert', agentId: m.agentId || '',
            note: `Kist hati — ${X.displayName || memberId} (${X.registrationNumber || ''}) ki closing revert, group ${groupName || groupId}`,
            createdBy: by.uid,
          }));
        }
        bumpAgent(m.agentId, 'total', dTotal);
        bumpAgent(m.agentId, 'paid', dPaid);
        bumpAgent(m.agentId, 'count', dCount);
        bumpAgent(m.agentId, 'paidCount', p.dPaidCount);
      }

      // group breakdown for this payer
      if (breakdown[p.payerId]) {
        const b = breakdown[p.payerId];
        const amount = Math.max(0, num(b.amount) - dTotal);
        const count = Math.max(0, num(b.count) - dCount);
        if (p.empty || count <= 0) { delete breakdown[p.payerId]; paymentMemberIds = paymentMemberIds.filter((id) => id !== p.payerId); }
        else breakdown[p.payerId] = { ...b, amount, count };
      }

      // kist removal history — whose, from which group, which closing
      const hit = p.hits[0] || {};
      addKistLog(mb, {
        memberId: p.payerId, memberName: m?.displayName || p.cp.memberName || '', memberRegNo: m?.registrationNumber || '',
        agentId: m?.agentId || p.cp.agentId || '', programId,
        closingGroupId: groupId, closingGroupName: groupName,
        closedMemberId: memberId, closedMemberName: X.displayName || hit.closed_memberName || '',
        closedMemberRegNo: X.registrationNumber || hit.closing_registrationNumber || '',
        closedDate: dmy(hit.closed_date || hit.marriageDate || X.closed_date),
        kistCount: dCount, amount: dTotal, paidReverted: dPaid, paidHandling: dPaid > 0 ? paidHandling : '',
        reason: 'MEMBER_REVERTED', source: 'revert-member', note: reason, revertId: revertRef.id,
        removedBy: by.uid, removedByName: by.name,
      });
    }

    // ── un-close the member ──────────────────────────────────────────────
    const keptStatus = statusList.filter((cs) => !(cs?.closingGroupId === groupId && (!programId || !cs?.programId || cs.programId === programId)));
    const stillClosed = keptStatus.length > 0;
    const latest = stillClosed ? keptStatus[keptStatus.length - 1] : null;
    mb.update(db.collection('members').doc(memberId), stillClosed
      ? { closedStatus: keptStatus, member_closed: true, member_closed_program: latest.programId || null,
          closed_date: latest.closed_date || null, closingGroupId: latest.closingGroupId || null, updated_at: ts }
      : { closedStatus: keptStatus, member_closed: false, member_closed_at: DEL(), member_closed_by: DEL(),
          member_closed_program: DEL(), closed_date: DEL(), closed_note: DEL(), closed_invitation_url: DEL(),
          closingGroupId: DEL(), revertedFromClosing: { closingGroupId: groupId, closingGroupName: groupName, at: new Date().toISOString(), by: by.name, revertId: revertRef.id },
          updated_at: ts });
    const unClosed = X.member_closed === true && !stillClosed ? 1 : 0;
    if (X.agentId && unClosed) bumpAgent(X.agentId, 'closed', 1);

    // ── closing group ────────────────────────────────────────────────────
    if (group) {
      const closedIds = (group.closedMemberIds || group.memberIds || []).filter((id) => id !== memberId);
      const left = plans.filter((p) => !p.empty).length;
      const otherDocs = cpSnap.docs.length - plans.length;
      if (!closedIds.length && !left && !otherDocs) {
        mb.delete(gSnap.ref);
      } else {
        mb.update(gSnap.ref, {
          closedMemberIds: closedIds,
          memberCount: closedIds.length,
          paymentMemberIds,
          paymentBreakdown: breakdown,
          totalAmount: Math.max(0, money(group.totalAmount) - removedAmount),
          totalClosingCount: Math.max(0, num(group.totalClosingCount) - removedKists),
          revertedMembers: admin.firestore.FieldValue.arrayUnion({
            memberId, name: X.displayName || '', regNo: X.registrationNumber || '', at: new Date().toISOString(), by: by.name, revertId: revertRef.id,
          }),
          updatedAt: ts,
          updatedBy: by.uid,
        });
      }
    }

    // ── agents ───────────────────────────────────────────────────────────
    const agentIds = Object.keys(agentD);
    const agentSnaps = agentIds.length ? await db.getAll(...agentIds.map((id) => db.collection('agents').doc(id))) : [];
    for (const s of agentSnaps) {
      if (!s.exists) continue;
      const a = s.data();
      const d = agentD[s.id];
      const ps = (a.programStats || {})[programId] || {};
      const minus = (v, x) => Math.max(0, num(v) - num(x));
      const upd = {
        closing_totalAmount: minus(a.closing_totalAmount, d.total),
        closing_paidAmount: minus(a.closing_paidAmount, d.paid),
        totalClosingCount: minus(a.totalClosingCount, d.count),
        paidClosingCount: minus(a.paidClosingCount, d.paidCount),
        closedCount: minus(a.closedCount, d.closed),
        updated_at: ts,
      };
      upd.closing_pendingAmount = Math.max(0, upd.closing_totalAmount - upd.closing_paidAmount);
      upd.pendingClosingCount = Math.max(0, upd.totalClosingCount - upd.paidClosingCount);
      if (programId) {
        upd[`programStats.${programId}.totalClosingAmount`] = minus(ps.totalClosingAmount, d.total);
        upd[`programStats.${programId}.totalClosingPaidAmount`] = minus(ps.totalClosingPaidAmount, d.paid);
        upd[`programStats.${programId}.totalClosingPendingAmount`] = minus(ps.totalClosingPendingAmount, num(d.total) - num(d.paid));
        upd[`programStats.${programId}.totalClosingCount`] = minus(ps.totalClosingCount, d.count);
        upd[`programStats.${programId}.paidClosingCount`] = minus(ps.paidClosingCount, d.paidCount);
        upd[`programStats.${programId}.pendingClosingCount`] = minus(ps.pendingClosingCount, num(d.count) - num(d.paidCount));
        upd[`programStats.${programId}.closedCount`] = minus(ps.closedCount, d.closed);
        upd[`programStats.${programId}.lastUpdated`] = ts;
      }
      mb.update(s.ref, upd);
    }

    // ── programme + organisation ─────────────────────────────────────────
    const [pSnap, oSnap] = await Promise.all([
      programId ? db.collection('programs').doc(programId).get() : null,
      db.collection('organizationStats').doc('current').get(),
    ]);
    const statsUpd = (d) => ({
      closedCount: Math.max(0, num(d.closedCount) - unClosed),
      totalClosingAmount: Math.max(0, num(d.totalClosingAmount) - removedAmount),
      totalClosingPendingAmount: Math.max(0, num(d.totalClosingPendingAmount) - pendingDelta),
      totalClosingCount: Math.max(0, num(d.totalClosingCount) - removedKists),
      pendingClosingCount: Math.max(0, num(d.pendingClosingCount) - pendingCountDelta),
      updated_at: ts,
    });
    if (pSnap?.exists) mb.set(pSnap.ref, statsUpd(pSnap.data()), { merge: true });
    if (oSnap.exists) mb.set(oSnap.ref, statsUpd(oSnap.data()), { merge: true });

    // ── the revert itself ────────────────────────────────────────────────
    mb.set(revertRef, {
      memberId, memberName: X.displayName || '', memberRegNo: X.registrationNumber || '', agentId: X.agentId || '',
      programId, closingGroupId: groupId, closingGroupName: groupName,
      closedDate: dmy(X.closed_date || lastStatus.closed_date),
      affectedMembers: plans.length, removedKists, removedAmount, releasedPaid, paidHandling,
      payers: preview.rows.slice(0, 300),
      reason, revertedBy: by.uid, revertedByName: by.name, createdAt: ts,
    });

    await mb.commit();

    return NextResponse.json({
      success: true,
      message: `${X.displayName || 'Member'} revert ho gaya — ${plans.length} sadasyon se ${removedKists} kist (₹${removedAmount.toLocaleString('en-IN')}) hatayi`
        + (releasedPaid ? `, jama ₹${releasedPaid.toLocaleString('en-IN')} ${paidHandling === 'advance' ? 'advance mein gaya' : 'hata diya'}` : ''),
      revertId: revertRef.id,
      preview,
    });
  } catch (e) {
    console.error('POST /closing/revert-member', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
