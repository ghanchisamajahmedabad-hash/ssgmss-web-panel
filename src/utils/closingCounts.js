// utils/closingCounts.js
//
// ONE rule for "how many closings (events) of a member are paid", used by the
// payment API, the reverts, the closing audit / Recheck, closing creation and
// the member details screen.
//
// A closing_payment doc is one closing GROUP of a member; it holds
// `closingCount` closings at `payAmount` each. Payments are recorded on the
// doc as a total (`paidAmount`), so paid closings are counted from the money:
//
//     fully paid doc   → all of its closings
//     part-paid doc    → floor(paidAmount / payAmount) closings
//
// e.g. ₹800 paid on a ₹400-per-closing member = 2 closings paid, whether that
// ₹800 cleared one 2-closing group or two 1-closing groups. This is the same
// oldest-first rule the "समय पर / समय बाकी" (45-day) view already used, so
// "Events charged", the table's "x/y" and the lateness view now agree.
//
// Previously the count only moved when a whole group became 'paid', and was
// kept as a running +1/−1 counter — which drifted (member showing 1/5 while
// ₹800 = 2 closings was paid).

export const closingsInDoc = (cp) => Number(cp?.closingCount || 0);

export const paidClosingsInDoc = (cp) => {
  const count = closingsInDoc(cp);
  if (count <= 0) return 0;
  if (cp?.status === 'paid') return count;
  const paid = Number(cp?.paidAmount || 0);
  if (paid <= 0) return 0;
  const payAmount = Number(cp?.payAmount || 0);
  if (payAmount > 0) return Math.min(count, Math.floor(paid / payAmount));
  const total = Number(cp?.totalAmount || 0);
  return total > 0 ? Math.min(count, Math.floor((count * paid) / total)) : 0;
};

/** Totals over a member's closing_payment docs (reversed docs ignored). */
export const countClosings = (docs) => {
  let total = 0, paid = 0;
  for (const cp of docs || []) {
    if (!cp || cp.isReversed === true) continue;
    total += closingsInDoc(cp);
    paid  += paidClosingsInDoc(cp);
  }
  paid = Math.min(paid, total);
  return { totalClosingCount: total, paidClosingCount: paid, pendingClosingCount: Math.max(0, total - paid) };
};
