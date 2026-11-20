// app/api/db/kistLog.js
//
// Kist (instalment) removal history.
//
// A kist is one closing charged to a member: one entry in closingDetails of the
// member's closing_payment doc for a closing group. Kists are removed by
//   • Settings → Closing System Check / member "Recheck" with "remove invalid
//     events" on (source 'audit': duplicate, after own closing, before joining)
//   • Closing Forms → "Revert" of one closed member (source 'revert-member':
//     that member's kist is taken off every member of the group)
//
// Every removal writes one doc to `kistRemovalLog`, so it can always be seen
// WHOSE kist was removed, FROM WHICH closing group, which closing it was, the
// amount, what happened to money already paid, why, and by whom.
// Read through GET /api/closing/kist-history (admin SDK — no client rules needed).
import admin from './firebaseAdmin';

const db = admin.firestore();
export const KIST_LOG = 'kistRemovalLog';

const s = (v) => (v == null ? '' : String(v));

/**
 * One log doc. Add it to the same batch as the removal itself, so the record
 * and the change land together.
 *   batch: anything with set(ref, data)
 */
export function addKistLog(batch, e) {
  const ref = db.collection(KIST_LOG).doc();
  batch.set(ref, {
    // whose kist (the paying member)
    memberId:          s(e.memberId),
    memberName:        s(e.memberName),
    memberRegNo:       s(e.memberRegNo),
    agentId:           s(e.agentId),
    programId:         s(e.programId),
    // from which closing group
    closingGroupId:    s(e.closingGroupId),
    closingGroupName:  s(e.closingGroupName),
    // which closing (the closed member the kist was for)
    closedMemberId:    s(e.closedMemberId),
    closedMemberName:  s(e.closedMemberName),
    closedMemberRegNo: s(e.closedMemberRegNo),
    closedDate:        s(e.closedDate),
    // money
    kistCount:         Number(e.kistCount || 1),
    amount:            Math.round(Number(e.amount || 0)),
    paidReverted:      Math.round(Number(e.paidReverted || 0)),   // paid money taken off the group
    paidHandling:      s(e.paidHandling),                          // 'advance' | 'remove' | ''
    // why / who
    reason:            s(e.reason),        // DUP_EVENT | AFTER_CLOSED | BEFORE_JOIN | MEMBER_REVERTED
    source:            s(e.source),        // 'audit' | 'revert-member'
    note:              s(e.note),
    revertId:          s(e.revertId),      // closingRevertLog doc, for a member revert
    removedBy:         s(e.removedBy),
    removedByName:     s(e.removedByName),
    createdAt:         admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export const REASON_LABEL = {
  DUP_EVENT:       'एक ही क्लोजिंग दो बार लगी थी',
  AFTER_CLOSED:    'सदस्य के अपने क्लोज होने के बाद की क्लोजिंग',
  BEFORE_JOIN:     'सदस्य के जुड़ने से पहले की क्लोजिंग',
  MEMBER_REVERTED: 'क्लोज हुआ सदस्य वापस (Revert) किया गया',
};
