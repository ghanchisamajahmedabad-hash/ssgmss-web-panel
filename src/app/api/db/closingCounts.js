// app/api/db/closingCounts.js — server side of utils/closingCounts.js
import admin from './firebaseAdmin';
import { countClosings } from '../../../utils/closingCounts';

const db = admin.firestore();

/**
 * A member's closing counts, recomputed from their closing_payment docs.
 * @param overrides  { [closingPaymentDocId]: { paidAmount, status, ... } } —
 *                   changes made in the current (not yet committed) batch.
 * @returns counts, or null when the member has no closing_payment docs at all
 *          (legacy data — caller should then leave the stored counts alone).
 */
export async function recomputeMemberClosingCounts(memberId, overrides = {}) {
  const snap = await db.collection('closing_payment').where('memberId', '==', memberId).get();
  if (snap.empty) return null;
  const docs = snap.docs.map((d) => ({ ...d.data(), ...(overrides[d.id] || {}) }));
  return countClosings(docs);
}
