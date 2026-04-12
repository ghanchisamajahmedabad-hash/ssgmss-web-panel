import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── helpers ──────────────────────────────────────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

const parseDate = (d) => {
  if (!d) return null;
  if (typeof d !== "string") return new Date(d);
  if (d.includes("T") || /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d);
  const [day, month, year] = d.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Fetch member docs in parallel batches of 10, return id→data map
const fetchMemberMap = async (ids) => {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const snaps = await Promise.all(
    chunkArr(unique, 10).map((ch) =>
      db.collection("members")
        .where(admin.firestore.FieldPath.documentId(), "in", ch)
        .get()
    )
  );
  const map = {};
  snaps.forEach((s) => s.forEach((d) => { if (d.exists) map[d.id] = { id: d.id, ...d.data() }; }));
  return map;
};

// Multi-batch helper — auto-splits at 490 ops, commits all in parallel
class MultiBatch {
  constructor() { this._batches = [db.batch()]; this._ops = 0; }
  _cur() {
    if (this._ops >= 490) { this._batches.push(db.batch()); this._ops = 0; }
    return this._batches[this._batches.length - 1];
  }
  set(ref, data, opts) { this._cur().set(ref, data, opts || {}); this._ops++; }
  update(ref, data) { this._cur().update(ref, data); this._ops++; }
  delete(ref) { this._cur().delete(ref); this._ops++; }
  commit() { return Promise.all(this._batches.map((b) => b.commit())); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Process closing + distribute payments
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  const body = await req.json();
  const {
    programId,
    groupId,
    memberClosingList = [],
    memberIds = [],
    closedBy,
    closedByName,
    ageGroups = [],
    memberGroups = [],
  } = body;

  if (!programId || !memberIds.length || !memberClosingList.length) {
    return NextResponse.json(
      { success: false, message: "Missing required fields (programId, memberIds, or memberClosingList)" },
      { status: 400 }
    );
  }

  try {
    const groupRef = db.collection("groupClosings").doc(groupId || undefined);
    const closingGroupId = groupRef.id;
    const ts = STS();
    const now = new Date().toISOString();
    const mb = new MultiBatch();

    // ── 1. Fetch all members in this program ──────────────────────────────
    let membersQuery = db.collection("members")
      .where("programId", "==", programId)
      .where("status", "==", "active");

    if (ageGroups.length) membersQuery = membersQuery.where("ageGroupId", "in", ageGroups.slice(0, 10));
    if (memberGroups.length) membersQuery = membersQuery.where("memberGroupId", "in", memberGroups.slice(0, 10));

    const membersSnap = await membersQuery.get();
    const allProgramDocs = {};
    membersSnap.forEach(d => { if (d.exists) allProgramDocs[d.id] = { id: d.id, ...d.data() }; });
    const programMemberIds = Object.keys(allProgramDocs);

    // ── 2. Build lookup: closingMemberId → their closed_date ──────────────
    const closingDateMap = {};
    for (const event of memberClosingList) {
      if (event.closed_memberId) {
        closingDateMap[event.closed_memberId] = parseDate(event.closed_date || event.marriageDate);
      }
    }

    // ── 3. Trackers ───────────────────────────────────────────────────────
    let totalPaymentAmount = 0;
    let totalPaymentCount = 0;
    const agentStats = {};
    const paymentUpdatedIds = [];
    const paymentPerMember = {};
    const closedIds = [];
    const skippedClose = [];

    // ── 4. Main loop ──────────────────────────────────────────────────────
    for (const memberId of programMemberIds) {
      const m = allProgramDocs[memberId];
      if (!m) continue;

      const memberRef = db.collection("members").doc(memberId);
      const isBeingClosedNow = memberIds.includes(memberId);
      const payAmount = Number(m.payAmount || 0);

      // ── JOB 1: Mark as closed (only for selected memberIds) ──────────────
      if (isBeingClosedNow) {
        const alreadyClosed = (m.closedStatus || []).some(cs => cs.programId === programId);

        if (alreadyClosed) {
          skippedClose.push({ memberId, name: m.displayName || m.name, reason: "Already closed" });
        } else {
          const detail = memberClosingList.find(c => c.closed_memberId === memberId) || {};

          // Build the closedStatus entry — DELETE relies on this to find & remove
          const newClosedEntry = {
            programId,
            closingGroupId,
            closed_date: detail.closed_date || null,
            closed_note: detail.closed_note || "",
            closed_invitation_url: detail.closed_invitation_url || null,
            closed_at: now,
            closed_by: closedBy || null,
          };

          mb.update(memberRef, {
            programId,
            closingGroupId,
            member_closed_at: now,
            member_closed_by: closedBy || null,
            closed_date: detail.closed_date || null,
            closed_note: detail.closed_note || "",
            closed_invitation_url: detail.closed_invitation_url || null,
            member_closed: true,
            updated_at: ts,
            // ← push entry into closedStatus array so DELETE can find & remove it
            closedStatus: admin.firestore.FieldValue.arrayUnion(newClosedEntry),
          });

          closedIds.push(memberId);
        }
      }

      // ── JOB 2: Calculate payment ──────────────────────────────────────────
      if (payAmount <= 0) continue;

      const joinDate = parseDate(m.dateJoin);
      if (!joinDate) continue;

      const prevClosedEntry = (m.closedStatus || []).find(cs => cs.programId === programId);
      const prevClosedDate = prevClosedEntry ? parseDate(prevClosedEntry.closed_date) : null;
      const ownClosedDate = isBeingClosedNow
        ? (closingDateMap[memberId] || null)
        : prevClosedDate;

      const matchingClosings = memberClosingList.filter(event => {
        const eventDate = parseDate(event.closed_date || event.marriageDate);
        if (!eventDate) return false;
        if (joinDate > eventDate) return false;
        if (prevClosedDate && eventDate <= prevClosedDate) return false;
        if (ownClosedDate && eventDate > ownClosedDate) return false;
        return true;
      });

      if (matchingClosings.length === 0) continue;

      const memberPayment = matchingClosings.length * payAmount;
      const memberCount = matchingClosings.length;

      totalPaymentAmount += memberPayment;
      totalPaymentCount += memberCount;
      paymentUpdatedIds.push(memberId);
      paymentPerMember[memberId] = { amount: memberPayment, count: memberCount };

      if (m.agentId) {
        agentStats[m.agentId] ??= { amount: 0, count: 0, memberCount: 0 };
        agentStats[m.agentId].amount += memberPayment;
        agentStats[m.agentId].count += memberCount;
        agentStats[m.agentId].memberCount += isBeingClosedNow ? 1 : 0;
      }

      // ── Update member doc (no subcollection) ──────────────────────────────
      mb.update(memberRef, {
        closing_totalAmount: INC(memberPayment),
        closing_pendingAmount: INC(memberPayment),
        totalClosingCount: INC(memberCount),
        pendingClosingCount: INC(memberCount),
        updated_at: ts,
        closingGroupIds: admin.firestore.FieldValue.arrayUnion(closingGroupId),
        [`closingGroupAmounts.${closingGroupId}`]: memberPayment,
        [`closingGroupCounts.${closingGroupId}`]: memberCount,
      });

      // ── JOB 3: Write closing_payment entry for this member ────────────────
      // Doc ID: {memberId}_{closingGroupId} — unique per member per group
      const closingPaymentRef = db.collection("closing_payment").doc(`${memberId}_${closingGroupId}`);

      // Pull the closing-member snapshot that the frontend sent
      const closingMemberDetail = memberClosingList.find(c => c.closed_memberId === memberId) || {};

      // Build per-closing-event details — each event gets full member snapshot too
      const closingDetails = matchingClosings.map(event => {
        const eventDetail = memberClosingList.find(c => c.closed_memberId === event.closed_memberId) || {};
        return {
          closed_memberId: event.closed_memberId || null,
          closed_memberName: eventDetail.closing_Name || event.closed_memberName || event.name || null,
          closed_fatherName: eventDetail.closing_fatherName || null,
          closed_village: eventDetail.closing_village || null,
          closingPhone: eventDetail.closingPhone || null,
          closing_registrationNumber: eventDetail.closing_registrationNumber || null,
          closed_photoURL: eventDetail.closed_photoURL || null,
          closed_date: event.closed_date || event.marriageDate || null,
          closed_note: event.closed_note || null,
          closed_invitation_url: event.closed_invitation_url || null,
          marriageDate: event.marriageDate || null,
        };
      });

      mb.set(closingPaymentRef, {
        // identifiers
        memberId,
        closingGroupId,
        programId,

        // member info snapshot (from Firestore member doc)
        memberName: m.displayName || m.name || null,
        memberCode: m.memberCode || m.code || null,
        agentId: m.agentId || null,
        ageGroupId: m.ageGroupId || null,
        memberGroupId: m.memberGroupId || null,
        dateJoin: m.dateJoin || null,

        // member closing snapshot (sent from frontend)
        closing_Name: closingMemberDetail.closing_Name || m.displayName || m.name || null,
        closing_fatherName: closingMemberDetail.closing_fatherName || m.fatherName || null,
        closing_village: closingMemberDetail.closing_village || m.village || null,
        closingPhone: closingMemberDetail.closingPhone || m.phone || null,
        closing_registrationNumber: closingMemberDetail.closing_registrationNumber || m.registrationNumber || null,
        closed_photoURL: closingMemberDetail.closed_photoURL || m.photoURL || null,

        // payment info
        payAmount,                   // per-closing pay rate
        closingCount: memberCount,   // how many closings triggered payment
        totalAmount: memberPayment,  // payAmount × closingCount

        // closing event details (list of all closings that triggered payment)
        closingDetails,

        // status & audit
        status: "pending",
        createdAt: ts,
        createdBy: closedBy || null,
        createdByName: closedByName || null,
        isReversed: false,
        reversedAt: null,
        reversedBy: null,
        reversedByName: null,
        reversalReason: null,
      });
    }

    // ── 5. Write group doc ────────────────────────────────────────────────
    mb.set(groupRef, {
      id: closingGroupId,
      programId,
      closedMemberIds: closedIds,
      paymentMemberIds: paymentUpdatedIds,
      paymentBreakdown: paymentPerMember,
      totalAmount: totalPaymentAmount,
      totalClosingCount: totalPaymentCount,
      status: "active",
      closedAt: ts,
    });

    // ── 6. Agent / Program / Org stats ────────────────────────────────────
    for (const [agentId, s] of Object.entries(agentStats)) {
      mb.update(db.collection("agents").doc(agentId), {
        closing_pendingAmount: INC(s.amount),
        closing_totalAmount: INC(s.amount),
        totalClosingCount: INC(s.count),
        pendingClosingCount: INC(s.count),
        [`programStats.${programId}.totalClosingAmount`]: INC(s.amount),
        updated_at: ts,
      });
    }

    const globalStats = {
      totalClosingPendingAmount: INC(totalPaymentAmount),
      totalClosingAmount: INC(totalPaymentAmount),
      totalClosingCount: INC(totalPaymentCount),
      pendingClosingCount: INC(totalPaymentCount),
      updated_at: ts,
    };
    mb.set(db.collection("programs").doc(programId), globalStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"), globalStats, { merge: true });

    await mb.commit();

    return NextResponse.json({
      success: true,
      summary: {
        totalPaymentAmount,
        paymentUpdatedCount: paymentUpdatedIds.length,
        closedCount: closedIds.length,
        skippedCount: skippedClose.length,
        skipped: skippedClose,
      },
    });

  } catch (err) {
    console.error("POST Error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Reverse a closing group
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  const { closingGroupId, programId, reason = "Manual reversal", reversedBy, reversedByName } =
    await req.json();

  if (!closingGroupId || !programId)
    return NextResponse.json(
      { success: false, message: "closingGroupId and programId are required" },
      { status: 400 }
    );

  try {
    const groupDoc = await db.collection("groupClosings").doc(closingGroupId).get();
    if (!groupDoc.exists)
      return NextResponse.json({ success: false, message: "Closing group not found" }, { status: 404 });

    const groupData = groupDoc.data();
    if (groupData.status === "reversed")
      return NextResponse.json({ success: false, message: "Already reversed" }, { status: 400 });

    const closedMemberIds = groupData.closedMemberIds || groupData.memberIds || [];
    const paymentMemberIds = groupData.paymentMemberIds || groupData.memberIds || [];
    const storedMemberCount = groupData.closedMemberCount || groupData.memberCount || closedMemberIds.length;
    const paymentBreakdown = groupData.paymentBreakdown || {};

    const ts = STS();
    const mb = new MultiBatch();
    const agentStats = {};
    let totalRevAmount = 0;
    let totalRevCount = 0;

    // ── Step 1: Un-close selected members ────────────────────────────────
    if (closedMemberIds.length) {
      const closedDocs = await fetchMemberMap(closedMemberIds);

      for (const memberId of closedMemberIds) {
        const m = closedDocs[memberId];
        if (!m) continue;

        const closedStatus = m.closedStatus || [];
        const entryIdx = closedStatus.findIndex(
          cs => cs.programId === programId && cs.closingGroupId === closingGroupId
        );

        // Remove this group's entry from closedStatus (if found)
        const updatedStatus = entryIdx !== -1
          ? closedStatus.filter((_, i) => i !== entryIdx)
          : closedStatus;

        const stillClosed = updatedStatus.length > 0;
        const latestEntry = stillClosed ? updatedStatus[updatedStatus.length - 1] : null;

        const memberRef = db.collection("members").doc(memberId);
        const memberUpdate = { closedStatus: updatedStatus, updated_at: ts };

        if (!stillClosed) {
          // No more closing entries — fully un-close the member
          Object.assign(memberUpdate, {
            member_closed: false,
            member_closed_at: DEL(),
            member_closed_by: DEL(),
            member_closed_program: DEL(),
            closed_date: DEL(),
            closed_note: DEL(),
            closed_invitation_url: DEL(),
            closingGroupId: DEL(),
          });
        } else {
          // Still has other closings — restore latest one
          Object.assign(memberUpdate, {
            member_closed: true,
            member_closed_program: latestEntry.programId,
            closed_date: latestEntry.closed_date || null,
            closingGroupId: latestEntry.closingGroupId,
          });
        }

        mb.update(memberRef, memberUpdate);
      }
    }

    // ── Step 2: Reverse payments ──────────────────────────────────────────
    if (paymentMemberIds.length) {
      const paymentDocs = await fetchMemberMap(paymentMemberIds);

      for (const memberId of paymentMemberIds) {
        const m = paymentDocs[memberId];
        if (!m) continue;

        let amount = Number(m[`closingGroupAmounts.${closingGroupId}`] || 0);
        let count = Number(m[`closingGroupCounts.${closingGroupId}`] || 0);

        if (!amount && paymentBreakdown[memberId]) {
          amount = Number(paymentBreakdown[memberId].amount || 0);
          count = Number(paymentBreakdown[memberId].count || 0);
        }

        if (!amount) {
          amount = Number(m.closing_pendingAmount || 0);
          count = Number(m.pendingClosingCount || 0);
          console.warn(`[DELETE] Legacy fallback for member ${memberId}`);
        }

        if (!amount && !count) continue;

        totalRevAmount += amount;
        totalRevCount += count;

        const memberRef = db.collection("members").doc(memberId);

        mb.update(memberRef, {
          closing_totalAmount: INC(-amount),
          closing_pendingAmount: INC(-amount),
          totalClosingCount: INC(-count),
          pendingClosingCount: INC(-count),
          updated_at: ts,
          closingGroupIds: admin.firestore.FieldValue.arrayRemove(closingGroupId),
          [`closingGroupAmounts.${closingGroupId}`]: DEL(),
          [`closingGroupCounts.${closingGroupId}`]: DEL(),
        });

        if (m.agentId) {
          agentStats[m.agentId] ??= { amount: 0, count: 0, memberCount: 0 };
          agentStats[m.agentId].amount += amount;
          agentStats[m.agentId].count += count;
          agentStats[m.agentId].memberCount += 1;
        }

        // ── Hard delete closing_payment entry on reversal ──
        mb.delete(db.collection("closing_payment").doc(`${memberId}_${closingGroupId}`));
      }
    }

    // ── Step 3: Hard delete groupClosings doc ────────────────────────────
    mb.delete(db.collection("groupClosings").doc(closingGroupId));

    // ── Step 4: Agent stats reversal — clamp to 0, never go negative ────────
    if (Object.keys(agentStats).length) {
      const agentDocs = await fetchMemberMap(Object.keys(agentStats)); // reuse helper
      // fetchMemberMap reads "members" collection — agents need separate fetch
      const agentSnaps = await Promise.all(
        Object.keys(agentStats).map(aid => db.collection("agents").doc(aid).get())
      );
      const agentDataMap = {};
      agentSnaps.forEach(snap => { if (snap.exists) agentDataMap[snap.id] = snap.data(); });

      for (const [agentId, s] of Object.entries(agentStats)) {
        const a = agentDataMap[agentId] || {};
        const ps = (a.programStats || {})[programId] || {};

        // Clamp each field — never go below 0
        const newPendingAmt = Math.max(0, Number(a.closing_pendingAmount || 0) - s.amount);
        const newTotalAmt = Math.max(0, Number(a.closing_totalAmount || 0) - s.amount);
        const newTotalCount = Math.max(0, Number(a.totalClosingCount || 0) - s.count);
        const newPendingCount = Math.max(0, Number(a.pendingClosingCount || 0) - s.count);
        const newClosedCount = Math.max(0, Number(a.closedCount || 0) - s.memberCount);

        const newPsTotalAmt = Math.max(0, Number(ps.totalClosingAmount || 0) - s.amount);
        const newPsPendingAmt = Math.max(0, Number(ps.totalClosingPendingAmount || 0) - s.amount);
        const newPsTotalCount = Math.max(0, Number(ps.totalClosingCount || 0) - s.count);
        const newPsPendingCnt = Math.max(0, Number(ps.pendingClosingCount || 0) - s.count);
        const newPsClosedCount = Math.max(0, Number(ps.closedCount || 0) - s.memberCount);

        mb.update(db.collection("agents").doc(agentId), {
          closing_pendingAmount: newPendingAmt,
          closing_totalAmount: newTotalAmt,
          totalClosingCount: newTotalCount,
          pendingClosingCount: newPendingCount,
          closedCount: newClosedCount,
          updated_at: ts,
          [`programStats.${programId}.totalClosingAmount`]: newPsTotalAmt,
          [`programStats.${programId}.totalClosingPendingAmount`]: newPsPendingAmt,
          [`programStats.${programId}.totalClosingCount`]: newPsTotalCount,
          [`programStats.${programId}.pendingClosingCount`]: newPsPendingCnt,
          [`programStats.${programId}.closedCount`]: newPsClosedCount,
          [`programStats.${programId}.lastUpdated`]: ts,
        });
      }
    }

    // ── Step 5 & 6: Program + Org stats reversal — clamp to 0 ──────────────
    const [progSnap, orgSnap] = await Promise.all([
      db.collection("programs").doc(programId).get(),
      db.collection("organizationStats").doc("current").get(),
    ]);
    const pd = progSnap.exists ? progSnap.data() : {};
    const od = orgSnap.exists ? orgSnap.data() : {};

    const progStats = {
      closedCount: Math.max(0, Number(pd.closedCount || 0) - storedMemberCount),
      totalClosingPendingAmount: Math.max(0, Number(pd.totalClosingPendingAmount || 0) - totalRevAmount),
      totalClosingAmount: Math.max(0, Number(pd.totalClosingAmount || 0) - totalRevAmount),
      totalClosingCount: Math.max(0, Number(pd.totalClosingCount || 0) - totalRevCount),
      pendingClosingCount: Math.max(0, Number(pd.pendingClosingCount || 0) - totalRevCount),
      updated_at: ts,
    };
    const orgStats = {
      closedCount: Math.max(0, Number(od.closedCount || 0) - storedMemberCount),
      totalClosingPendingAmount: Math.max(0, Number(od.totalClosingPendingAmount || 0) - totalRevAmount),
      totalClosingAmount: Math.max(0, Number(od.totalClosingAmount || 0) - totalRevAmount),
      totalClosingCount: Math.max(0, Number(od.totalClosingCount || 0) - totalRevCount),
      pendingClosingCount: Math.max(0, Number(od.pendingClosingCount || 0) - totalRevCount),
      updated_at: ts,
    };
    mb.set(db.collection("programs").doc(programId), progStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"), orgStats, { merge: true });

    await mb.commit();

    return NextResponse.json({
      success: true,
      message: `Reversed: ${closedMemberIds.length} members un-closed, ${paymentMemberIds.length} payments reversed`,
      summary: {
        closingGroupId,
        membersUnClosed: closedMemberIds.length,
        paymentReversedFor: paymentMemberIds.length,
        reversedAmount: totalRevAmount,
        reversedCount: totalRevCount,
        reason,
      },
    });

  } catch (err) {
    console.error("DELETE /closing error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}