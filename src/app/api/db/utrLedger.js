// app/api/db/utrLedger.js
//
// One bank transfer (one UTR) can pay for many things: closing payments of
// several agents, join fees, an agent advance. The old rule — "a UTR may
// appear only once in paymentGroups" — rejected all of those after the first.
//
// New rule: the UTR's real bank amount is recorded once in `utrRegistry`.
// Every payment that cites the UTR consumes part of it, and a payment is
// refused only when it would take the UTR past that amount.
//
// "Used" is computed live from the payment records themselves (paymentGroups
// + agent advance deposits), so a revert — which deletes or shrinks the
// paymentGroup — frees the amount automatically, with no separate counter to
// keep in sync.
import admin from './firebaseAdmin';

const db = admin.firestore();

export const normalizeUtr = (utr) =>
  String(utr || '').trim().replace(/\s+/g, '').toUpperCase();

// Existing records stored the UTR exactly as typed (trimmed, original case),
// so look up both spellings.
const utrVariants = (utr) => {
  const trimmed = String(utr || '').trim();
  return [...new Set([trimmed, normalizeUtr(trimmed)].filter(Boolean))];
};

const toDateStr = (v) => {
  if (!v) return '';
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN');
};

// Amount of one paymentGroup that came out of the bank transfer:
// what was applied to dues + what was parked in member advance.
const groupUtrAmount = (g) =>
  Number(g.totalAmount || 0) + Number(g.advanceCredited || 0);

/**
 * Current state of a UTR.
 * @returns {{ utr, totalAmount: number|null, used, remaining: number|null, entries: [] }}
 */
export async function getUtrUsage(utr) {
  const key = normalizeUtr(utr);
  if (!key) return { utr: '', totalAmount: null, used: 0, remaining: null, entries: [] };

  const variants = utrVariants(utr);
  const [regSnap, groupsSnap, advSnap] = await Promise.all([
    db.collection('utrRegistry').doc(key).get(),
    db.collection('paymentGroups').where('transactionId', 'in', variants).get(),
    db.collection('agentAdvancePayments').where('utrId', 'in', variants).get(),
  ]);

  const entries = [];
  groupsSnap.forEach((d) => {
    const g = d.data();
    if (g.reverted) return;
    entries.push({
      id: d.id,
      source: 'paymentGroup',
      paymentType: g.paymentType || '',
      agentId: g.agentId || '',
      amount: groupUtrAmount(g),
      date: toDateStr(g.paymentDate || g.createdAt),
    });
  });
  advSnap.forEach((d) => {
    const a = d.data();
    if (a.type !== 'deposit') return;
    entries.push({
      id: d.id,
      source: 'agentAdvance',
      paymentType: 'agentAdvance',
      agentId: a.agentId || '',
      amount: Number(a.amount || 0),
      date: toDateStr(a.createdAt),
    });
  });

  const used = entries.reduce((s, e) => s + e.amount, 0);
  const totalAmount = regSnap.exists ? Number(regSnap.data().totalAmount || 0) : null;

  return {
    utr: key,
    totalAmount,
    used,
    remaining: totalAmount == null ? null : totalAmount - used,
    entries,
  };
}

const typeLabel = (t) =>
  t === 'joinFees' ? 'Join Fees' : t === 'agentAdvance' ? 'Agent Advance' : 'Closing';

/**
 * Decide whether `amount` more can be charged to this UTR.
 *
 * @param utrTotalAmount  the bank amount the user entered — only used the
 *                        first time a UTR is seen; afterwards the saved total wins.
 * @returns {{ ok: true, total, used, registryWrite: {ref, data}|null }}
 *        | {{ ok: false, message }}
 */
export async function checkUtrCapacity({ utr, amount, utrTotalAmount, createdBy }) {
  const usage = await getUtrUsage(utr);
  const want  = Number(amount || 0);
  let total   = usage.totalAmount;
  let registryWrite = null;

  if (total == null) {
    const entered = Number(utrTotalAmount || 0);
    if (entered > 0) {
      total = entered;
    } else if (usage.entries.length > 0) {
      // Old-style reuse with no bank amount given — we can't tell whether
      // this is a split of one transfer or a genuine duplicate.
      const first = usage.entries[0];
      return {
        ok: false,
        message:
          `Duplicate transaction: UTR "${usage.utr}" was already used in a ${typeLabel(first.paymentType)} ` +
          `payment${first.date ? ` on ${first.date}` : ''} (₹${usage.used.toLocaleString('en-IN')}). ` +
          `If this one transfer pays for more members, enter the UTR's total bank amount and try again.`,
      };
    } else {
      // Brand-new UTR, no total given — it covers exactly this payment.
      total = want;
    }
    registryWrite = {
      ref: db.collection('utrRegistry').doc(usage.utr),
      data: {
        utr: usage.utr,
        totalAmount: total,
        createdBy: createdBy || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
  }

  if (usage.used + want > total + 0.001) {
    const left = Math.max(0, total - usage.used);
    return {
      ok: false,
      message:
        `Duplicate transaction: UTR "${usage.utr}" total is ₹${total.toLocaleString('en-IN')}, ` +
        `₹${usage.used.toLocaleString('en-IN')} already used in ${usage.entries.length} payment(s). ` +
        `Only ₹${left.toLocaleString('en-IN')} is left, but this payment needs ₹${want.toLocaleString('en-IN')}.`,
    };
  }

  return { ok: true, total, used: usage.used, registryWrite };
}
