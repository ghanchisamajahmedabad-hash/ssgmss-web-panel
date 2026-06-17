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
      db
        .collection("members")
        .where(admin.firestore.FieldPath.documentId(), "in", ch)
        .get()
    )
  );
  const map = {};
  snaps.forEach((s) =>
    s.forEach((d) => {
      if (d.exists) map[d.id] = { id: d.id, ...d.data() };
    })
  );
  return map;
};

// Multi-batch helper — auto-splits at 490 ops, commits all in parallel
class MultiBatch {
  constructor() {
    this._batches = [db.batch()];
    this._ops = 0;
  }
  _cur() {
    if (this._ops >= 490) {
      this._batches.push(db.batch());
      this._ops = 0;
    }
    return this._batches[this._batches.length - 1];
  }
  set(ref, data, opts) {
    this._cur().set(ref, data, opts || {});
    this._ops++;
  }
  update(ref, data) {
    this._cur().update(ref, data);
    this._ops++;
  }
  delete(ref) {
    this._cur().delete(ref);
    this._ops++;
  }
  commit() {
    return Promise.all(this._batches.map((b) => b.commit()));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Process closing + distribute payments
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: auth.status }
    );

  const body = await req.json();
  const {
    programId,
    groupId,
    groupName,
    memberClosingList = [],
    memberIds = [],        // the newly-selected members being closed NOW
    closedBy,
    closedByName,
    ageGroups = [],
    memberGroups = [],
    closingGroupId,        // present only in add-to-existing mode
  } = body;

  if (!programId || !memberIds.length || !memberClosingList.length) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Missing required fields (programId, memberIds, or memberClosingList)",
      },
      { status: 400 }
    );
  }

  try {
    const isAddMode = !!closingGroupId;

    // In add-mode we reuse the existing group doc; in new-mode we create one.
    const groupRef = isAddMode
      ? db.collection("groupClosings").doc(closingGroupId)
      : db.collection("groupClosings").doc(groupId || db.collection("groupClosings").doc().id);

    const computedGroupId = groupRef.id;
    const ts = STS();
    const now = new Date().toISOString();
    const mb = new MultiBatch();

    // ── Add-mode: validate + load existing group ─────────────────────────
    let existingGroupData = null;
    // FIX: only skip members who are ALREADY CLOSED in this group,
    //      NOT members who already have payment entries — they must be
    //      re-evaluated against the NEW closings being added.
    let existingClosedIds = new Set();   // members already closed in this group

    if (isAddMode) {
      const snap = await groupRef.get();
      if (!snap.exists)
        return NextResponse.json(
          { success: false, message: "Closing group not found" },
          { status: 404 }
        );
      if (snap.data().status === "reversed")
        return NextResponse.json(
          { success: false, message: "Cannot add to a reversed group" },
          { status: 400 }
        );
      existingGroupData = snap.data();
      // Only prevent double-closing — do NOT block payment recalculation
      existingClosedIds = new Set(existingGroupData.closedMemberIds || []);
    }

    const resolvedGroupName = isAddMode
      ? (existingGroupData?.groupName || groupName || '')
      : (groupName || '');

    // ── 1. Fetch all active members in this program ──────────────────────
    let membersQuery = db
      .collection("members")
      .where("programId", "==", programId)
      .where("status", "==", "active");

    const effectiveAgeGroups = isAddMode
      ? (existingGroupData?.ageGroupIds || ageGroups)
      : ageGroups;
    const effectiveMemberGroups = isAddMode
      ? (existingGroupData?.memberGroupIds || memberGroups)
      : memberGroups;

    if (effectiveAgeGroups.length)
      membersQuery = membersQuery.where(
        "ageGroupId",
        "in",
        effectiveAgeGroups.slice(0, 10)
      );
    if (effectiveMemberGroups.length)
      membersQuery = membersQuery.where(
        "memberGroupId",
        "in",
        effectiveMemberGroups.slice(0, 10)
      );

    const membersSnap = await membersQuery.get();
    const allProgramDocs = {};
    membersSnap.forEach((d) => {
      if (d.exists) allProgramDocs[d.id] = { id: d.id, ...d.data() };
    });
    const programMemberIds = Object.keys(allProgramDocs);

    // ── 2. Build lookup: closingMemberId → their closed_date ────────────
    const closingDateMap = {};
    for (const event of memberClosingList) {
      if (event.closed_memberId) {
        closingDateMap[event.closed_memberId] = parseDate(
          event.closed_date || event.marriageDate
        );
      }
    }

    // ── 3. Trackers ──────────────────────────────────────────────────────
    let totalPaymentAmount = 0;
    let totalPaymentCount = 0;
    const agentStats = {};
    const paymentUpdatedIds = [];      // members getting a NEW payment entry this run
    const paymentPerMember = {};
    const closedIds = [];              // members being closed (marked) this run
    const skippedClose = [];

    // In add-mode: load existing closing_payment docs for all program members
    // so we know which events each member has already been paid for.
    // We'll use this to avoid double-counting previously paid events.
    let existingPaymentDocsMap = {};   // memberId → closing_payment doc data
    if (isAddMode && programMemberIds.length) {
      const cpSnaps = await Promise.all(
        chunkArr(programMemberIds, 10).map((chunk) =>
          db
            .collection("closing_payment")
            .where("closingGroupId", "==", computedGroupId)
            .where("memberId", "in", chunk)
            .get()
        )
      );
      cpSnaps.forEach((snap) =>
        snap.forEach((d) => {
          if (d.exists) existingPaymentDocsMap[d.data().memberId] = { id: d.id, ...d.data() };
        })
      );
    }

    // ── 4. Main loop ─────────────────────────────────────────────────────
    for (const memberId of programMemberIds) {
      const m = allProgramDocs[memberId];
      if (!m) continue;

      const memberRef = db.collection("members").doc(memberId);
      const isBeingClosedNow = memberIds.includes(memberId);
      const payAmount = Number(m.payAmount || 0);

      // ── JOB 1: Mark member as closed (only for the selected memberIds) ──
      if (isBeingClosedNow) {
        // Skip if already marked closed in THIS group
        if (existingClosedIds.has(memberId)) {
          skippedClose.push({
            memberId,
            name: m.displayName || m.name,
            reason: "Already closed in this group",
          });
        } else {
          // Also check the member's own closedStatus array for this program
          const alreadyClosed = (m.closedStatus || []).some(
            (cs) => cs.programId === programId && cs.closingGroupId === computedGroupId
          );

          if (alreadyClosed) {
            skippedClose.push({
              memberId,
              name: m.displayName || m.name,
              reason: "Already closed",
            });
          } else {
            const detail =
              memberClosingList.find((c) => c.closed_memberId === memberId) || {};

            const newClosedEntry = {
              programId,
              closingGroupId: computedGroupId,
              closed_date: detail.closed_date || null,
              closed_note: detail.closed_note || "",
              closed_invitation_url: detail.closed_invitation_url || null,
              closed_at: now,
              closed_by: closedBy || null,
            };

            mb.update(memberRef, {
              programId,
              closingGroupId: computedGroupId,
              member_closed_at: now,
              member_closed_by: closedBy || null,
              member_closed_program: programId,
              closed_date: detail.closed_date || null,
              closed_note: detail.closed_note || "",
              closed_invitation_url: detail.closed_invitation_url || null,
              member_closed: true,
              updated_at: ts,
              closedStatus: admin.firestore.FieldValue.arrayUnion(newClosedEntry),
            });

            closedIds.push(memberId);
          }
        }
      }

      // ── JOB 2: Calculate payment for this member ─────────────────────────
      // Skip members with no payAmount
      if (payAmount <= 0) continue;

      const joinDate = parseDate(m.dateJoin);
      if (!joinDate) continue;

      // Determine this member's own closing date (if they are being closed now,
      // or were already closed before in another group for this program)
      const prevClosedEntry = (m.closedStatus || []).find(
        (cs) => cs.programId === programId
      );
      const prevClosedDate = prevClosedEntry
        ? parseDate(prevClosedEntry.closed_date)
        : null;

      const ownClosedDate = isBeingClosedNow
        ? closingDateMap[memberId] || null
        : prevClosedDate;

      // In add-mode: find which closing events this member has ALREADY been paid for
      // We track this via the closingDetails array on their existing closing_payment doc.
      const existingPaidEventIds = new Set();
      if (isAddMode && existingPaymentDocsMap[memberId]) {
        const existingDoc = existingPaymentDocsMap[memberId];
        (existingDoc.closingDetails || []).forEach((cd) => {
          if (cd.closed_memberId) existingPaidEventIds.add(cd.closed_memberId);
        });
      }

      // Filter closing events that should trigger payment for this member:
      // 1. Event date must be after member join date
      // 2. Event date must be on or before member's own closing date (if closed)
      // 3. Event must NOT have been previously paid for (in add-mode)
      // 4. Event date must be AFTER any previously paid events (no double-count)
      const matchingClosings = memberClosingList.filter((event) => {
        const eventDate = parseDate(event.closed_date || event.marriageDate);
        if (!eventDate) return false;
        // Must join before or on event date
        if (joinDate > eventDate) return false;
        // If member has their own closing date, don't pay for events after it
        if (ownClosedDate && eventDate > ownClosedDate) return false;
        // In add-mode: skip events already paid for this member in this group
        if (isAddMode && existingPaidEventIds.has(event.closed_memberId)) return false;
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

      // ── Update member doc counters ────────────────────────────────────────
      mb.update(memberRef, {
        closing_totalAmount: INC(memberPayment),
        closing_pendingAmount: INC(memberPayment),
        totalClosingCount: INC(memberCount),
        pendingClosingCount: INC(memberCount),
        updated_at: ts,
        closingGroupIds: admin.firestore.FieldValue.arrayUnion(computedGroupId),
        [`closingGroupAmounts.${computedGroupId}`]: INC(memberPayment),
        [`closingGroupCounts.${computedGroupId}`]: INC(memberCount),
      });

      // ── JOB 3: Write / merge closing_payment entry for this member ────────
      const closingPaymentRef = db
        .collection("closing_payment")
        .doc(`${memberId}_${computedGroupId}`);

      const closingMemberDetail =
        memberClosingList.find((c) => c.closed_memberId === memberId) || {};

      const closingDetails = matchingClosings.map((event) => {
        const eventDetail =
          memberClosingList.find((c) => c.closed_memberId === event.closed_memberId) || {};
        return {
          closed_memberId:              event.closed_memberId || null,
          closed_memberName:            eventDetail.closing_Name || event.closed_memberName || event.name || null,
          closed_fatherName:            eventDetail.closing_fatherName || null,
          closed_village:               eventDetail.closing_village || null,
          closingPhone:                 eventDetail.closingPhone || m.phone || null,
          closing_registrationNumber:   eventDetail.closing_registrationNumber || m.registrationNumber || null,
          closed_photoURL:              eventDetail.closed_photoURL || null,
          closed_date:                  event.closed_date || event.marriageDate || null,
          closed_note:                  event.closed_note || null,
          closed_invitation_url:        event.closed_invitation_url || null,
          marriageDate:                 event.marriageDate || null,
        };
      });

      if (isAddMode && existingPaymentDocsMap[memberId]) {
        // ── Add-mode: MERGE into the existing closing_payment doc ────────────
        // Append new closingDetails, increment amounts/counts
        mb.update(closingPaymentRef, {
          closingCount:   INC(memberCount),
          totalAmount:    INC(memberPayment),
          closingDetails: admin.firestore.FieldValue.arrayUnion(...closingDetails),
          updatedAt:      ts,
          updatedBy:      closedBy || null,
          updatedByName:  closedByName || null,
        });
      } else {
        // ── New-mode (or first-time entry in add-mode): CREATE the doc ───────
        mb.set(closingPaymentRef, {
          // identifiers
          memberId,
          closingGroupId: computedGroupId,
          closingGroupName: resolvedGroupName,
          programId,

          // member info snapshot
          memberName:       m.displayName || m.name || null,
          memberCode:       m.memberCode || m.code || null,
          agentId:          m.agentId || null,
          ageGroupId:       m.ageGroupId || null,
          memberGroupId:    m.memberGroupId || null,
          dateJoin:         m.dateJoin || null,

          // closing member snapshot (from frontend)
          closing_Name:                 closingMemberDetail.closing_Name || m.displayName || m.name || null,
          closing_fatherName:           closingMemberDetail.closing_fatherName || m.fatherName || null,
          closing_village:              closingMemberDetail.closing_village || m.village || null,
          closingPhone:                 closingMemberDetail.closingPhone || m.phone || null,
          closing_registrationNumber:   closingMemberDetail.closing_registrationNumber || m.registrationNumber || null,
          closed_photoURL:              closingMemberDetail.closed_photoURL || m.photoURL || null,

          // payment info
          payAmount,
          closingCount:  memberCount,
          totalAmount:   memberPayment,

          // per-event details
          closingDetails,

          // status & audit
          status:          "pending",
          createdAt:       ts,
          createdBy:       closedBy || null,
          createdByName:   closedByName || null,
          isReversed:      false,
          reversedAt:      null,
          reversedBy:      null,
          reversedByName:  null,
          reversalReason:  null,
        });
      }
    }

    // ── 5. Write / update group doc ──────────────────────────────────────
    if (isAddMode) {
      // Re-fetch the latest group doc to avoid stale merge
      const freshSnap = await groupRef.get();
      const freshData = freshSnap.data() || {};

      const existingClosedArr   = freshData.closedMemberIds   || [];
      const existingPaymentArr  = freshData.paymentMemberIds  || [];
      const existingBreakdown   = freshData.paymentBreakdown  || {};

      // Merge sets so we never duplicate IDs
      const mergedClosedArr   = [...new Set([...existingClosedArr, ...closedIds])];
      const mergedPaymentArr  = [...new Set([...existingPaymentArr, ...paymentUpdatedIds])];

      // Merge paymentBreakdown — add incremental amounts for existing members
      const mergedBreakdown = { ...existingBreakdown };
      for (const [mid, info] of Object.entries(paymentPerMember)) {
        if (mergedBreakdown[mid]) {
          mergedBreakdown[mid] = {
            amount: (mergedBreakdown[mid].amount || 0) + info.amount,
            count:  (mergedBreakdown[mid].count  || 0) + info.count,
          };
        } else {
          mergedBreakdown[mid] = info;
        }
      }

      mb.set(
        groupRef,
        {
          closedMemberIds:   mergedClosedArr,
          paymentMemberIds:  mergedPaymentArr,
          paymentBreakdown:  mergedBreakdown,
          memberCount:       mergedClosedArr.length,
          totalAmount:       (freshData.totalAmount       || 0) + totalPaymentAmount,
          totalClosingCount: (freshData.totalClosingCount || 0) + totalPaymentCount,
          ...(groupName ? { groupName } : {}),
          ageGroupIds:       existingGroupData?.ageGroupIds ?? (ageGroups.length ? ageGroups : []),
          memberGroupIds:    existingGroupData?.memberGroupIds ?? (memberGroups.length ? memberGroups : []),
          status:    "active",
          updatedAt: ts,
          updatedBy: closedBy || null,
        },
        { merge: true }
      );
    } else {
      // New group
      mb.set(groupRef, {
        id:                computedGroupId,
        programId,
        ...(groupName ? { groupName } : {}),
        ageGroupIds:       ageGroups.length ? ageGroups : [],
        memberGroupIds:    memberGroups.length ? memberGroups : [],
        closedMemberIds:   closedIds,
        paymentMemberIds:  paymentUpdatedIds,
        paymentBreakdown:  paymentPerMember,
        totalAmount:       totalPaymentAmount,
        totalClosingCount: totalPaymentCount,
        memberCount:       closedIds.length,
        status:            "active",
        closedAt:          ts,
        closedBy:          closedBy || null,
        closedByName:      closedByName || null,
      });
    }

    // ── 6. Agent / Program / Org stats ───────────────────────────────────
    for (const [agentId, s] of Object.entries(agentStats)) {
      mb.update(db.collection("agents").doc(agentId), {
        closing_pendingAmount:  INC(s.amount),
        closing_totalAmount:    INC(s.amount),
        totalClosingCount:      INC(s.count),
        pendingClosingCount:    INC(s.count),
        [`programStats.${programId}.totalClosingAmount`]: INC(s.amount),
        updated_at: ts,
      });
    }

    const globalStats = {
      totalClosingPendingAmount: INC(totalPaymentAmount),
      totalClosingAmount:        INC(totalPaymentAmount),
      totalClosingCount:         INC(totalPaymentCount),
      pendingClosingCount:       INC(totalPaymentCount),
      updated_at:                ts,
    };
    mb.set(db.collection("programs").doc(programId),              globalStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"),     globalStats, { merge: true });

    await mb.commit();

    return NextResponse.json({
      success: true,
      summary: {
        totalPaymentAmount,
        paymentUpdatedCount: paymentUpdatedIds.length,
        closedCount:         closedIds.length,
        skippedCount:        skippedClose.length,
        skipped:             skippedClose,
      },
    });
  } catch (err) {
    console.error("POST Error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Reverse a closing group
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: auth.status }
    );

  const {
    closingGroupId,
    programId,
    reason = "Manual reversal",
    reversedBy,
    reversedByName,
  } = await req.json();

  if (!closingGroupId || !programId)
    return NextResponse.json(
      { success: false, message: "closingGroupId and programId are required" },
      { status: 400 }
    );

  try {
    const groupDoc = await db
      .collection("groupClosings")
      .doc(closingGroupId)
      .get();
    if (!groupDoc.exists)
      return NextResponse.json(
        { success: false, message: "Closing group not found" },
        { status: 404 }
      );

    const groupData = groupDoc.data();
    if (groupData.status === "reversed")
      return NextResponse.json(
        { success: false, message: "Already reversed" },
        { status: 400 }
      );

    const closedMemberIds  = groupData.closedMemberIds  || groupData.memberIds || [];
    const paymentMemberIds = groupData.paymentMemberIds || groupData.memberIds || [];
    const storedMemberCount =
      groupData.closedMemberCount || groupData.memberCount || closedMemberIds.length;
    const paymentBreakdown = groupData.paymentBreakdown || {};

    const ts = STS();
    const mb = new MultiBatch();
    const agentStats = {};
    let totalRevAmount = 0;
    let totalRevCount  = 0;

    // ── Step 1: Un-close selected members ────────────────────────────────
    if (closedMemberIds.length) {
      const closedDocs = await fetchMemberMap(closedMemberIds);

      for (const memberId of closedMemberIds) {
        const m = closedDocs[memberId];
        if (!m) continue;

        const closedStatus = m.closedStatus || [];
        const entryIdx = closedStatus.findIndex(
          (cs) =>
            cs.programId === programId &&
            cs.closingGroupId === closingGroupId
        );

        const updatedStatus =
          entryIdx !== -1
            ? closedStatus.filter((_, i) => i !== entryIdx)
            : closedStatus;

        const stillClosed  = updatedStatus.length > 0;
        const latestEntry  = stillClosed
          ? updatedStatus[updatedStatus.length - 1]
          : null;

        const memberRef = db.collection("members").doc(memberId);
        const memberUpdate = { closedStatus: updatedStatus, updated_at: ts };

        if (!stillClosed) {
          Object.assign(memberUpdate, {
            member_closed:         false,
            member_closed_at:      DEL(),
            member_closed_by:      DEL(),
            member_closed_program: DEL(),
            closed_date:           DEL(),
            closed_note:           DEL(),
            closed_invitation_url: DEL(),
            closingGroupId:        DEL(),
          });
        } else {
          Object.assign(memberUpdate, {
            member_closed:         true,
            member_closed_program: latestEntry.programId,
            closed_date:           latestEntry.closed_date || null,
            closingGroupId:        latestEntry.closingGroupId,
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

        // Prefer stored breakdown, fall back to member doc fields
        let amount = 0;
        let count  = 0;

        if (paymentBreakdown[memberId]) {
          amount = Number(paymentBreakdown[memberId].amount || 0);
          count  = Number(paymentBreakdown[memberId].count  || 0);
        }

        if (!amount) {
          // Try to read from the closing_payment doc
          try {
            const cpSnap = await db
              .collection("closing_payment")
              .doc(`${memberId}_${closingGroupId}`)
              .get();
            if (cpSnap.exists) {
              const cpData = cpSnap.data();
              amount = Number(cpData.totalAmount   || 0);
              count  = Number(cpData.closingCount  || 0);
            }
          } catch (_) {}
        }

        if (!amount && !count) continue;

        totalRevAmount += amount;
        totalRevCount  += count;

        const memberRef = db.collection("members").doc(memberId);

        // How much has already been paid out for this group?
        let paidForThisGroup    = 0;
        let countForThisGroup   = count;
        try {
          const cpSnap = await db
            .collection("closing_payment")
            .doc(`${memberId}_${closingGroupId}`)
            .get();
          if (cpSnap.exists) {
            const cpData = cpSnap.data();
            paidForThisGroup  = Number(cpData.paidAmount    || 0);
            countForThisGroup = Number(cpData.closingCount  || count);
          }
        } catch (_) {}

        const pendingForThisGroup = Math.max(0, amount - paidForThisGroup);

        mb.update(memberRef, {
          closing_totalAmount:   INC(-amount),
          closing_paidAmount:    INC(-Math.min(paidForThisGroup, m.closing_paidAmount   || 0)),
          closing_pendingAmount: INC(-Math.min(pendingForThisGroup, m.closing_pendingAmount || 0)),
          totalClosingCount:     INC(-count),
          paidClosingCount:      INC(-Math.min(countForThisGroup, m.paidClosingCount    || 0)),
          pendingClosingCount:   INC(-Math.min(countForThisGroup, m.pendingClosingCount || 0)),
          updated_at:            ts,
          closingGroupIds:       admin.firestore.FieldValue.arrayRemove(closingGroupId),
          [`closingGroupAmounts.${closingGroupId}`]: DEL(),
          [`closingGroupCounts.${closingGroupId}`]:  DEL(),
        });

        if (m.agentId) {
          agentStats[m.agentId] ??= { amount: 0, count: 0, memberCount: 0 };
          agentStats[m.agentId].amount      += amount;
          agentStats[m.agentId].count       += count;
          agentStats[m.agentId].memberCount += 1;
        }

        // Hard-delete the closing_payment doc on reversal
        mb.delete(
          db.collection("closing_payment").doc(`${memberId}_${closingGroupId}`)
        );
      }
    }

    // ── Step 3: Hard-delete groupClosings doc ─────────────────────────────
    mb.delete(db.collection("groupClosings").doc(closingGroupId));

    // ── Step 4: Agent stats reversal (clamp to 0) ─────────────────────────
    if (Object.keys(agentStats).length) {
      const agentSnaps = await Promise.all(
        Object.keys(agentStats).map((aid) =>
          db.collection("agents").doc(aid).get()
        )
      );
      const agentDataMap = {};
      agentSnaps.forEach((snap) => {
        if (snap.exists) agentDataMap[snap.id] = snap.data();
      });

      for (const [agentId, s] of Object.entries(agentStats)) {
        const a  = agentDataMap[agentId] || {};
        const ps = (a.programStats || {})[programId] || {};

        mb.update(db.collection("agents").doc(agentId), {
          closing_pendingAmount: Math.max(0, Number(a.closing_pendingAmount || 0) - s.amount),
          closing_totalAmount:   Math.max(0, Number(a.closing_totalAmount   || 0) - s.amount),
          totalClosingCount:     Math.max(0, Number(a.totalClosingCount     || 0) - s.count),
          pendingClosingCount:   Math.max(0, Number(a.pendingClosingCount   || 0) - s.count),
          closedCount:           Math.max(0, Number(a.closedCount           || 0) - s.memberCount),
          updated_at:            ts,
          [`programStats.${programId}.totalClosingAmount`]:        Math.max(0, Number(ps.totalClosingAmount        || 0) - s.amount),
          [`programStats.${programId}.totalClosingPendingAmount`]: Math.max(0, Number(ps.totalClosingPendingAmount || 0) - s.amount),
          [`programStats.${programId}.totalClosingCount`]:         Math.max(0, Number(ps.totalClosingCount         || 0) - s.count),
          [`programStats.${programId}.pendingClosingCount`]:       Math.max(0, Number(ps.pendingClosingCount       || 0) - s.count),
          [`programStats.${programId}.closedCount`]:               Math.max(0, Number(ps.closedCount               || 0) - s.memberCount),
          [`programStats.${programId}.lastUpdated`]:               ts,
        });
      }
    }

    // ── Step 5 & 6: Program + Org stats reversal ─────────────────────────
    const [progSnap, orgSnap] = await Promise.all([
      db.collection("programs").doc(programId).get(),
      db.collection("organizationStats").doc("current").get(),
    ]);
    const pd = progSnap.exists ? progSnap.data() : {};
    const od = orgSnap.exists  ? orgSnap.data()  : {};

    const progStats = {
      closedCount:               Math.max(0, Number(pd.closedCount               || 0) - storedMemberCount),
      totalClosingPendingAmount: Math.max(0, Number(pd.totalClosingPendingAmount || 0) - totalRevAmount),
      totalClosingAmount:        Math.max(0, Number(pd.totalClosingAmount        || 0) - totalRevAmount),
      totalClosingCount:         Math.max(0, Number(pd.totalClosingCount         || 0) - totalRevCount),
      pendingClosingCount:       Math.max(0, Number(pd.pendingClosingCount       || 0) - totalRevCount),
      updated_at:                ts,
    };
    const orgStats = {
      closedCount:               Math.max(0, Number(od.closedCount               || 0) - storedMemberCount),
      totalClosingPendingAmount: Math.max(0, Number(od.totalClosingPendingAmount || 0) - totalRevAmount),
      totalClosingAmount:        Math.max(0, Number(od.totalClosingAmount        || 0) - totalRevAmount),
      totalClosingCount:         Math.max(0, Number(od.totalClosingCount         || 0) - totalRevCount),
      pendingClosingCount:       Math.max(0, Number(od.pendingClosingCount       || 0) - totalRevCount),
      updated_at:                ts,
    };
    mb.set(db.collection("programs").doc(programId),          progStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"), orgStats,  { merge: true });

    await mb.commit();

    return NextResponse.json({
      success: true,
      message: `Reversed: ${closedMemberIds.length} members un-closed, ${paymentMemberIds.length} payments reversed`,
      summary: {
        closingGroupId,
        membersUnClosed:      closedMemberIds.length,
        paymentReversedFor:   paymentMemberIds.length,
        reversedAmount:       totalRevAmount,
        reversedCount:        totalRevCount,
        reason,
      },
    });
  } catch (err) {
    console.error("DELETE /closing error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}