// app/api/migrate-member-data/route.js
//
// Migrates legacy MEMBER DATA (app_forms.json + app_forms_yojana.json) into
// the Firestore 'members' collection — with all old ids mapped to the new
// system through the `legacyId` fields already stored on:
//
//   states / districts / cities / castes / relations  → doc.legacyId
//   programs (yojnas)                                 → doc.legacyId
//   agents                                            → doc.legacyId
//                                                        (fallback: phone match
//                                                         via app_users.json)
//
// One legacy enrollment (app_forms_yojana row) = one new member doc, because
// the new system is single-program-per-member. Personal data comes from the
// joined app_forms row (form_id).
//
// Field mapping (legacy → member doc):
//   first_name→displayName, father_name→fatherName, gotra→surname,
//   gender 1/2→male/female, dob→dobDate, aadhar_number→aadhaarNo,
//   mobile_number→phone, amobile_number→phoneAlt, address→village+currentAddress,
//   varisdar→guardian, relation_type→guardianRelation (legacyId),
//   cast_id→caste (legacyId), state_id→state (legacyId), distric_id→district
//   (legacyId), city_name→city (matched by name), selAgent→agentId,
//   application_no→registrationNumber, joining_date→dateJoin,
//   yojana_id→programId (legacyId), enrollment status 2→member_closed.
//
// Amounts come from the OLD system: fees → joinFees AND fixedJoinFees (same
// value), kist → payAmount. ALL migrated members are marked fully PAID on the
// member doc (paid = joinFees, pending = 0). Only the age group / period /
// member group are resolved from the NEW program config (DOB at join date +
// join date). NO transaction records are created and NO amounts are added to
// agent/program/org stats — only member counts.
//
// Also per migrated member:
//   • assigns srNo (organizationStats.totalMembersAdded transaction)
//   • resolves ageGroup + period + memberGroup from the new program config
//   • creates a memberJoinFees transaction record if payFees > 0
//   • increments agent / program / org aggregate stats (count + amounts)
//   • NO commission is credited (old payments must not inflate agent wallets)
//   • login account IS created (same as normal member add): uid = memberId,
//     email = {regNo}@ssgmsss.com, password = first5(name)+birthYear,
//     custom claims { role: member, programId } — reverted on migration revert
//   • photos & documents are migrated INLINE with the member (uploaded to
//     Storage and linked on the doc in the same pass) — Step 2 (media) is
//     only needed for anything that failed or was skipped here
//
// Idempotent & resumable:
//   • progress logged per enrollment in 'memberMigrationLog/{enrollmentId}'
//   • skips enrollments already migrated, and members that already exist
//     (same aadhaar + same program)
//
// GET    → status summary
// POST   → { limit=10, startAfterId=0, dryRun=false }
// DELETE → { limit=10 } — REVERT: deletes migrated members, reverses all
//          aggregate stats, removes their transactions/media/logs. Call
//          repeatedly until hasMore=false (the UI Revert button loops).
//
// Run THIS first, then run Media Migration (it matches by aadhaar).

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { migrateMediaForLegacyForm } from "../migrate-member-media/route";

const db   = admin.firestore();
const auth = admin.auth();
const STS  = admin.firestore.FieldValue.serverTimestamp;
const INC  = admin.firestore.FieldValue.increment;

// Same password rule as the normal member-creation flow (members/route.js):
// first 5 letters of the first name + birth year (DD-MM-YYYY → YYYY)
const generateMemberPassword = (name, dobDDMMYYYY) => {
  try {
    if (!name || !dobDDMMYYYY) return "Member@123";
    const namePart = name.trim().split(" ")[0].substring(0, 5);
    const year = String(dobDDMMYYYY).split("-")[2];
    return year ? `${namePart}${year}` : "Member@123";
  } catch {
    return "Member@123";
  }
};

// Create the Firebase Auth login account for a migrated member —
// mirrors createMemberAccount in /api/members:
//   uid = memberId, email = {regNo}@ssgmsss.com, custom claims role=member
const createMemberAuthAccount = async ({ memberId, displayName, regNo, password, programId }) => {
  try {
    await auth.getUser(memberId);
    return { created: false, existed: true };
  } catch {
    // doesn't exist → create
  }
  await auth.createUser({
    uid: memberId,
    email: `${regNo}@ssgmsss.com`.toLowerCase(),
    emailVerified: true,
    displayName,
    password: password || "Member@123",
  });
  await auth.setCustomUserClaims(memberId, { role: "member", programId: programId || "" });
  return { created: true, existed: false };
};

const MIGRATION_BASE = path.join(process.cwd(), "src", "app", "api", "migrationData");

// Legacy yojna id remap — old yojna 3 and 4 are the SAME yojna in the new
// system, so members with legacy yojana_id 3 are migrated into yojna 4.
const YOJANA_ID_REMAP = { "3": "4" };

// ─── Load legacy tables (cached per server instance) ──────────────────────────
let _legacy = null;
const loadLegacy = () => {
  if (_legacy) return _legacy;
  const read = (f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(MIGRATION_BASE, f), "utf8"));
    return (raw.find((x) => x.type === "table")?.data) || [];
  };
  const forms = {};
  read("app_forms.json").forEach((r) => { forms[String(r.id)] = r; });
  const users = {};
  read("app_users.json").forEach((r) => { users[String(r.id)] = r; });
  const enrollments = read("app_forms_yojana.json")
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id));
  _legacy = { forms, users, enrollments };
  return _legacy;
};

// ─── Load new-system lookup maps (per request) ────────────────────────────────
const buildLookups = async () => {
  const load = async (col) => {
    const snap = await db.collection(col).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };
  const [states, districts, cities, castes, relations, programs, agents] =
    await Promise.all([
      load("states"), load("districts"), load("cities"),
      load("castes"), load("relations"), load("programs"), load("agents"),
    ]);

  const byLegacy = (arr) =>
     {
    const m = {};
    arr.forEach((d) => { if (d.legacyId) m[String(d.legacyId).trim()] = d; });
    return m;
  };
  // Agents store the old system id as `legacyUserId` (NOT `legacyId` like the
  // master collections) — support both, just in case.
  const agentsByLegacy = {};
  agents.forEach((a) => {
    const lid = a.legacyUserId ?? a.legacyId;
    if (lid !== undefined && lid !== null && String(lid).trim() !== "") {
      agentsByLegacy[String(lid).trim()] = a;
    }
  });
  const agentsByPhone = {};
  agents.forEach((a) => { if (a.phone1) agentsByPhone[String(a.phone1).trim()] = a; });
  const citiesByName = {};
  cities.forEach((c) => { if (c.name) citiesByName[String(c.name).trim().toLowerCase()] = c; });

  return {
    states: byLegacy(states), districts: byLegacy(districts),
    cities: byLegacy(cities), citiesByName,
    castes: byLegacy(castes), relations: byLegacy(relations),
    programs: byLegacy(programs), agents: agentsByLegacy, agentsByPhone,
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toDDMMYYYY = (iso) => {
  if (!iso) return "";
  const s = String(iso).split(" ")[0];
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}-${m}-${y}` : "";
};
const parseISO = (iso) => {
  if (!iso) return null;
  const d = new Date(String(iso).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
};
const ageAt = (dobIso, atIso) => {
  const dob = parseISO(dobIso), at = parseISO(atIso) || new Date();
  if (!dob) return 0;
  let a = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) a--;
  return Math.max(0, a);
};
const parseDDMMYYYY = (s) => {
  if (!s) return null;
  const [d, m, y] = String(s).split("-").map(Number);
  return d && m && y ? new Date(y, m - 1, d) : null;
};

// Same search index logic as the client (firebaseUtils createSearchIndex)
const createSearchIndex = (data) => {
  const set = new Set();
  const addPrefixes = (text) => {
    const str = String(text).toLowerCase().trim();
    if (!str) return;
    set.add(str);
    str.split(/\s+/).forEach((word) => {
      if (word.length > 1) {
        set.add(word);
        let p = "";
        for (const ch of word) { p += ch; if (p.length > 1) set.add(p); }
      }
    });
  };
  Object.values(data).forEach((v) => { if (v !== null && v !== undefined && v !== "") addPrefixes(v); });
  return Array.from(set).filter(Boolean);
};

// Generate a NEW-system registration number — same format/logic as the panel
// (firebaseUtils generateRegistrationNumber): {prefix}5{YY}{M}{NNNN} with the
// program's regNoPrefix and a per-program sequence. A per-request counter
// cache avoids recounting members for every record in the batch.
const generateNewRegNo = async (program, counters) => {
  const prefix =
    (String(program.regNoPrefix || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")) || "MEM";
  if (counters[program.id] === undefined) {
    const c = await db.collection("members")
      .where("programId", "==", program.id)
      .where("active_flag", "==", true)
      .count().get();
    counters[program.id] = c.data().count;
  }
  counters[program.id] += 1;
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const m  = String(now.getMonth() + 1);
  return `${prefix}5${yy}${m}${String(counters[program.id]).padStart(4, "0")}`;
};

const getNextSrNo = () =>
  db.runTransaction(async (txn) => {
    const ref = db.collection("organizationStats").doc("current");
    const snap = await txn.get(ref);
    const next = (snap.exists ? snap.data().totalMembersAdded || 0 : 0) + 1;
    txn.set(ref, { totalMembersAdded: next }, { merge: true });
    return next;
  });

// Resolve ageGroup / period / memberGroup from the NEW program config
const resolveProgramDetail = (program, age, joinDateIso) => {
  const ageGroup = (program.ageGroups || []).find(
    (ag) => age >= Number(ag.startAge) && age <= Number(ag.endAge)
  ) || null;
  const join = parseISO(joinDateIso);
  const period = ageGroup && join
    ? (ageGroup.periods || []).find((p) => {
        const s = parseDDMMYYYY(p.startDate), e = parseDDMMYYYY(p.endDate);
        return s && e && join >= s && join <= e;
      }) || null
    : null;
  const mg = (program.memberGroups || [])[0] || {};
  return {
    ageGroupId:      ageGroup?.id || "",
    ageGroupName:    ageGroup?.ageGroupName || "",
    periodStartDate: period?.startDate || "",
    periodEndDate:   period?.endDate || "",
    // Fees come from the NEW program config (same as member approval flow):
    // period fees first, program default as fallback.
    joinFees:        Number(period?.joinFees ?? program.joinFees ?? 0),
    payAmount:       Number(period?.payAmount || 0),
    fixedJoinFees:   Number(period?.fixedJoinFees || 0),
    memberGroupId:   mg.id || "",
    memberGroupName: mg.groupName || "",
    memberGroupCode: mg.code || "",
  };
};

// Increment agent / program / org aggregates for one migrated member.
// ONLY member counts are updated — join fee amounts (total/paid/pending) are
// NOT added to agent / program / organization stats for migrated members.
const addStatsForMember = async (member) => {
  const { agentId, programId, programName } = member;

  if (agentId) {
    const agentRef = db.collection("agents").doc(agentId);
    const snap = await agentRef.get();
    if (snap.exists) {
      await agentRef.update({
        memberCount: INC(1),
        [`programStats.${programId}.programName`]: programName,
        [`programStats.${programId}.memberCount`]: INC(1),
        [`programStats.${programId}.lastUpdated`]: STS(),
        updated_at: STS(),
      });
    }
  }
  if (programId) {
    await db.collection("programs").doc(programId).set({
      memberCount: INC(1),
      updated_at:  STS(),
    }, { merge: true });
  }
  await db.collection("organizationStats").doc("current").set({
    totalMembers: INC(1),
    updated_at:   STS(),
  }, { merge: true });
};

// Reverse agent / program / org aggregates for one member being un-migrated.
// Mirrors addStatsForMember: only member counts are reversed for join fees
// (no amounts were added at migration time). Closing amounts/counts ARE
// reversed from the member's CURRENT values, because any closing entries
// created after migration did add to the aggregates.
const removeStatsForMember = async (m) => {
  const agentId   = m.agentId || null;
  const programId = m.programId || null;
  const cTotal    = Number(m.closing_totalAmount || 0);
  const cPaid     = Number(m.closing_paidAmount || 0);
  const cPend     = Number(m.closing_pendingAmount || 0);
  const cCnt      = Number(m.totalClosingCount || 0);
  const cCntPaid  = Number(m.paidClosingCount || 0);
  const cCntPend  = Number(m.pendingClosingCount || 0);

  if (agentId) {
    const agentRef = db.collection("agents").doc(agentId);
    const snap = await agentRef.get();
    if (snap.exists) {
      await agentRef.update({
        memberCount:           INC(-1),
        closing_totalAmount:   INC(-cTotal),
        closing_paidAmount:    INC(-cPaid),
        closing_pendingAmount: INC(-cPend),
        totalClosingCount:     INC(-cCnt),
        paidClosingCount:      INC(-cCntPaid),
        pendingClosingCount:   INC(-cCntPend),
        [`programStats.${programId}.memberCount`]: INC(-1),
        [`programStats.${programId}.lastUpdated`]: STS(),
        updated_at: STS(),
      });
    }
  }
  if (programId) {
    await db.collection("programs").doc(programId).set({
      memberCount:               INC(-1),
      totalClosingAmount:        INC(-cTotal),
      totalClosingPaidAmount:    INC(-cPaid),
      totalClosingPendingAmount: INC(-cPend),
      totalClosingCount:         INC(-cCnt),
      paidClosingCount:          INC(-cCntPaid),
      pendingClosingCount:       INC(-cCntPend),
      updated_at: STS(),
    }, { merge: true });
  }
  await db.collection("organizationStats").doc("current").set({
    totalMembers:              INC(-1),
    totalClosingAmount:        INC(-cTotal),
    totalClosingPaidAmount:    INC(-cPaid),
    totalClosingPendingAmount: INC(-cPend),
    totalClosingCount:         INC(-cCnt),
    paidClosingCount:          INC(-cCntPaid),
    pendingClosingCount:       INC(-cCntPend),
    updated_at: STS(),
  }, { merge: true });
};

// Reverse any commissions credited for this member after migration
// (idempotent — marks credit txs reversed, same pattern as member delete)
const reverseCommissionsForMember = async (memberId) => {
  const snap = await db.collection("commissionTransactions")
    .where("sourceId", "==", memberId)
    .where("type", "==", "credit")
    .get();
  const active = snap.docs.filter((d) => d.data().reversed !== true);
  if (!active.length) return;

  const perAgent = {};
  active.forEach((d) => {
    const t = d.data();
    if (!perAgent[t.agentId]) perAgent[t.agentId] = { total: 0, refs: [], sample: t };
    perAgent[t.agentId].total += Number(t.amount || 0);
    perAgent[t.agentId].refs.push(d.ref);
  });

  for (const [agId, g] of Object.entries(perAgent)) {
    const amount = Math.round(g.total * 100) / 100;
    if (amount <= 0) continue;
    const agentRef = db.collection("agents").doc(agId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) continue;
    const wallet = agentSnap.data().walletBalance || 0;
    const batch = db.batch();
    batch.update(agentRef, {
      walletBalance: INC(-amount), totalCommissionEarned: INC(-amount), updated_at: STS(),
    });
    g.refs.forEach((r) => batch.update(r, { reversed: true, reversedAt: STS() }));
    batch.set(db.collection("commissionTransactions").doc(), {
      agentId: agId, agentName: g.sample.agentName || "", type: "reversal",
      amount, source: g.sample.source || "", sourceId: memberId,
      reversalReason: "migration_reverted",
      description: "Commission Reversed — Migration Reverted",
      balanceBefore: wallet, balanceAfter: wallet - amount, createdAt: STS(),
    });
    await batch.commit();
  }
};

const deleteDocsByQuery = async (col, field, value) => {
  const snap = await db.collection(col).where(field, "==", value).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
};

// ─── GET — status ─────────────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Only superadmin can run migration" }, { status: 403 });

    const { forms, enrollments } = loadLegacy();

    // ── ?view=skipped → full list of members that did NOT migrate ────────────
    const { searchParams } = new URL(req.url);
    if (searchParams.get("view") === "skipped") {
      const logsSnap = await db.collection("memberMigrationLog").get();
      const logMap = {};
      logsSnap.forEach((d) => { logMap[d.id] = d.data(); });

      const skipped = [];
      let unprocessed = 0;
      for (const enr of enrollments) {
        const log = logMap[String(enr.id)];
        if (!log) { unprocessed++; continue; }               // not reached yet
        if (log.status === "done") continue;                  // migrated fine
        const form = forms[String(enr.form_id)] || {};
        skipped.push({
          legacyId: String(enr.id),
          formId: String(enr.form_id),
          name: form.first_name || log.name || "",
          fatherName: form.father_name || "",
          aadhaar: form.aadhar_number || "",
          phone: form.mobile_number || "",
          yojanaId: String(enr.yojana_id),
          applicationNo: enr.application_no || "",
          status: log.status,
          reason: log.error || log.status,
          memberId: log.memberId || "",
        });
      }

      return NextResponse.json({
        success: true,
        skipped,
        counts: {
          skippedTotal: skipped.length,
          unprocessed,
          retryable: skipped.filter((s) => ["error", "no-program", "skipped-status", "no-match"].includes(s.status)).length,
        },
      });
    }

    const countFor = async (status) => {
      const s = await db.collection("memberMigrationLog").where("status", "==", status).count().get();
      return s.data().count;
    };
    const [done, exists, skipped, noProgram, errors] = await Promise.all([
      countFor("done"), countFor("already-exists"), countFor("skipped-status"),
      countFor("no-program"), countFor("error"),
    ]);
    const processed = done + exists + skipped + noProgram + errors;

    // Resume pointer — the last legacy id processed by a real (non-dry) run
    const stateSnap = await db.collection("migrationState").doc("member-data").get();
    const resumeFrom = stateSnap.exists ? Number(stateSnap.data().lastId || 0) : 0;

    return NextResponse.json({
      success: true,
      status: {
        totalLegacyRecords: enrollments.length,
        done,
        noMatch: exists + noProgram,   // shown as "needs review" in UI
        errors: errors + skipped,
        remaining: Math.max(0, enrollments.length - processed),
        resumeFrom,
        detail: { alreadyExists: exists, skippedStatus: skipped, noProgram, errors },
      },
    });
  } catch (e) {
    console.error("GET migrate-member-data error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── POST — process next batch ────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Only superadmin can run migration" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit        = Math.min(Math.max(Number(body.limit) || 10, 1), 30);
    const startAfterId = Number(body.startAfterId) || 0;
    const dryRun       = body.dryRun === true;
    const retrySkipped = body.retrySkipped === true;

    const { forms, users, enrollments } = loadLegacy();

    let batch;
    if (retrySkipped) {
      // RETRY MODE — reprocess only records that previously failed/were skipped
      // (error / no-program / skipped-status / no-match). 'done' and
      // 'already-exists' are never retried.
      const logsSnap = await db.collection("memberMigrationLog").get();
      const retryable = new Set();
      logsSnap.forEach((d) => {
        if (["error", "no-program", "skipped-status", "no-match"].includes(d.data().status)) {
          retryable.add(d.id);
        }
      });
      batch = enrollments
        .filter((r) => retryable.has(String(r.id)) && Number(r.id) > startAfterId)
        .slice(0, limit);
      // Clear old failure logs for this batch so processRecord re-runs them
      if (batch.length && !dryRun) {
        const b = db.batch();
        batch.forEach((enr) => b.delete(db.collection("memberMigrationLog").doc(String(enr.id))));
        await b.commit();
      }
    } else {
      batch = enrollments.filter((r) => Number(r.id) > startAfterId).slice(0, limit);
    }

    if (!batch.length) {
      return NextResponse.json({
        success: true,
        message: retrySkipped ? "No skipped records left to retry" : "All records processed",
        hasMore: false,
        summary: { processed: 0 }, nextStartAfterId: startAfterId,
      });
    }

    const lk = await buildLookups();
    const regNoCounters = {};   // per-program reg-no sequence cache (this request)
    const results = [];
    let doneCount = 0, existsCount = 0, skippedCount = 0, errorCount = 0;
    let accountsCreated = 0, filesUploaded = 0, filesMissing = 0;

    console.log(`\n🚀 [MIGRATION] Batch start — ${batch.length} record(s), startAfterId=${startAfterId}, dryRun=${dryRun}`);

    // ── SPEED: prefetch all idempotency logs in ONE read ─────────────────────
    const logRefs = batch.map((enr) => db.collection("memberMigrationLog").doc(String(enr.id)));
    const logSnapsArr = await db.getAll(...logRefs);
    const logSnapMap = {};
    logSnapsArr.forEach((s) => { logSnapMap[s.id] = s; });

    // ── SPEED: pre-warm per-program reg-no counters so parallel workers never
    //    race on the initial member-count query ────────────────────────────────
    for (const p of Object.values(lk.programs)) {
      if (p?.id && regNoCounters[p.id] === undefined) {
        const c = await db.collection("members")
          .where("programId", "==", p.id)
          .where("active_flag", "==", true)
          .count().get();
        regNoCounters[p.id] = c.data().count;
      }
    }

    // In-batch duplicate guard — same aadhaar + same yojna appearing twice in
    // the same batch (e.g. old yojna 3 + 4 remapped together): skip the second.
    const seenInBatch = new Set();

    const processRecord = async (enr) => {
      const enrollmentId = String(enr.id);
      const logRef = db.collection("memberMigrationLog").doc(enrollmentId);

      try {
        // Idempotency (prefetched — no extra read)
        const logSnap = logSnapMap[enrollmentId];
        if (logSnap?.exists && ["done", "already-exists"].includes(logSnap.data().status)) {
          existsCount++;
          results.push({ legacyId: enrollmentId, status: "already-done" });
          return;
        }

        const form = forms[String(enr.form_id)];
        if (!form) {
          skippedCount++;
          if (!dryRun) await logRef.set({ status: "error", error: "form not found", updatedAt: STS() }, { merge: true });
          results.push({ legacyId: enrollmentId, status: "error", error: `form ${enr.form_id} not found` });
          return;
        }

        // Skip rejected/deleted legacy rows (form status must be 1; enrollment 1 or 2)
        if (String(form.status) !== "1" || !["1", "2"].includes(String(enr.status))) {
          skippedCount++;
          if (!dryRun) await logRef.set({
            status: "skipped-status", formStatus: form.status, enrollmentStatus: enr.status,
            name: form.first_name || "", updatedAt: STS(),
          }, { merge: true });
          results.push({ legacyId: enrollmentId, name: form.first_name, status: "skipped-status" });
          return;
        }

        // ── Resolve program (required) — apply yojna id remap (3 → 4) ────────
        const legacyYojanaId = YOJANA_ID_REMAP[String(enr.yojana_id)] || String(enr.yojana_id);
        const program = lk.programs[legacyYojanaId];
        if (!program) {
          skippedCount++;
          if (!dryRun) await logRef.set({
            status: "no-program", yojanaId: enr.yojana_id, name: form.first_name || "", updatedAt: STS(),
          }, { merge: true });
          results.push({ legacyId: enrollmentId, name: form.first_name, status: "no-program", yojanaId: enr.yojana_id });
          return;
        }

        const aadhaar = (form.aadhar_number || "").trim();

        // ── Duplicate guard 1: same aadhaar + same yojna INSIDE this batch ────
        // (synchronous check — race-safe even with parallel workers)
        if (aadhaar) {
          const dupKey = `${aadhaar}|${program.id}`;
          if (seenInBatch.has(dupKey)) {
            existsCount++;
            if (!dryRun) {
              await logRef.set({
                status: "already-exists", duplicateInBatch: true,
                name: form.first_name || "", updatedAt: STS(),
              }, { merge: true });
            }
            console.log(`  ⏭️ [MIGRATION] #${enrollmentId} ${form.first_name}: duplicate in batch (same aadhaar + yojna) — skipped`);
            results.push({ legacyId: enrollmentId, name: form.first_name, status: "already-exists" });
            return;
          }
          seenInBatch.add(dupKey);
        }

        // ── Duplicate guard 2: same aadhaar + same program already in Firestore ─
        if (aadhaar) {
          const dup = await db.collection("members")
            .where("aadhaarNo", "==", aadhaar)
            .where("programId", "==", program.id)
            .limit(1).get();
          if (!dup.empty) {
            existsCount++;
            if (!dryRun) {
              await logRef.set({
                status: "already-exists", memberId: dup.docs[0].id,
                name: form.first_name || "", updatedAt: STS(),
              }, { merge: true });
              // Tag the existing doc with legacy ids (helps media migration/audit)
              await dup.docs[0].ref.update({
                legacyFormId: String(form.id), legacyEnrollmentId: enrollmentId,
              }).catch(() => {});
            }
            results.push({ legacyId: enrollmentId, name: form.first_name, status: "already-exists" });
            return;
          }
        }

        // ── Resolve masters via legacyId ──────────────────────────────────────
        const state    = lk.states[String(form.state_id || "").trim()]    || null;
        const district = lk.districts[String(form.distric_id || "").trim()] || null;
        const caste    = lk.castes[String(form.cast_id || "").trim()]     || null;
        const relation = lk.relations[String(form.relation_type || "").trim()] || null;
        const city     = lk.citiesByName[String(form.city_name || "").trim().toLowerCase()] || null;

        // ── Resolve agent: agents.legacyId, fallback legacy user phone ───────
        const legacyAgentId = String(enr.agentId || form.selAgent || "").trim();
        let agent = legacyAgentId ? lk.agents[legacyAgentId] : null;
        if (!agent && legacyAgentId && users[legacyAgentId]?.mobile_number) {
          agent = lk.agentsByPhone[String(users[legacyAgentId].mobile_number).trim()] || null;
        }

        // ── Program detail from NEW config: ONLY the age group / period /
        //    member group are resolved (by DOB at join date + join date) ──────
        const joinIso  = enr.joining_date || (enr.created_at || "").split(" ")[0];
        const age      = ageAt(form.dob, joinIso);
        const detail   = resolveProgramDetail(program, age, joinIso);
        const joinDate = parseISO(joinIso) || new Date();

        // ── Amounts from the OLD system:
        //    fees → joinFees AND fixedJoinFees (same value), kist → payAmount.
        //    ALL migrated members are marked fully PAID (pending = 0). ────────
        const joinFees      = Number(enr.fees || 0);
        const paidAmount    = joinFees;
        const pendingAmount = 0;
        const payAmount     = Number(enr.kist || 0);
        const pct           = 100;
        const paymentStatus = "paid";

        const gender   = String(form.gender) === "1" ? "male" : "female";
        const isClosed = String(enr.status) === "2";

        // NEW registration number (new system format — used for login email);
        // the OLD application number is kept + searchable.
        const oldApplicationNo = (enr.application_no || "").trim();
        let regNo;
        try {
          regNo = await generateNewRegNo(program, regNoCounters);
        } catch {
          regNo = `MIG-${enrollmentId}`;
        }

        const searchIndex = createSearchIndex({
          name: form.first_name, fatherName: form.father_name, surname: form.gotra,
          phone: form.mobile_number, aadhaarNo: aadhaar, registrationNumber: regNo,
          oldApplicationNo,   // old number stays searchable
          village: form.address, city: city?.name || form.city_name,
          district: district?.name, state: state?.name, caste: caste?.name,
          guardian: form.varisdar, programName: program.name, ageGroupName: detail.ageGroupName,
        });

        const memberData = {
          uid: "",
          displayName: form.first_name || "",
          fatherName:  form.father_name || "",
          surname:     form.gotra || "",
          gender,
          caste: caste?.name || "", casteId: caste?.id || "",
          phone: (form.mobile_number || "").trim(),
          phoneAlt: (form.amobile_number || "").trim(),
          dateJoin: toDDMMYYYY(joinIso),
          dobDate:  toDDMMYYYY(form.dob),
          age,
          currentAddress: form.address || "",
          state: state?.name || "",       stateId: state?.id || "",
          district: district?.name || "", districtId: district?.id || "",
          city: city?.name || form.city_name || "", cityId: city?.id || "",
          pinCode: "", village: form.address || "",
          aadhaarNo: aadhaar,
          registrationNumber: regNo,
          search_registrationNumber: regNo,
          guardian: form.varisdar || (enr.varisdarName || ""),
          guardianRelation: relation?.name || "", guardianRelationId: relation?.id || "",

          addedBy: agent ? "agent" : "admin",
          agentId: agent?.id || null,
          adminId: agent ? null : (authResult.user.uid || null),
          addedByName: agent?.name || "Migration",
          photoURL: "", guardianPhotoURL: "",
          documentFrontURL: "", documentBackURL: "", guardianDocumentURL: "",

          delete_flag: false, active_flag: true, isBlocked: false,
          marriage_flag: false, payment_flag: false,
          role: "member", status: "active",

          programId: program.id,
          programName: program.name || "",
          ageGroupId: detail.ageGroupId, ageGroupName: detail.ageGroupName,
          periodStartDate: detail.periodStartDate, periodEndDate: detail.periodEndDate,
          memberGroupId: detail.memberGroupId, memberGroupName: detail.memberGroupName,
          memberGroupCode: detail.memberGroupCode,
          programJoinDate: toDDMMYYYY(joinIso),
          programStatus: "active",

          payAmount,
          joinFees,
          fixedJoinFees: joinFees,   // same as joinFees (old system 'fees')
          joinFeesDone: true,
          paymentMode: "cash",
          paidAmount, pendingAmount,
          paymentPercentage: pct, paymentStatus,
          joinFeesTxtId: "", transactionDate: null,
          hasPendingPayments: pendingAmount > 0,

          search_keywords: searchIndex,
          search_programName: (program.name || "").toLowerCase(),
          search_ageGroupName: (detail.ageGroupName || "").toLowerCase(),
          search_paymentStatus: paymentStatus,

          joinYear: joinDate.getFullYear(),
          joinMonth: joinDate.getMonth() + 1,
          joinYearMonth: `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, "0")}`,
          ageGroup: age < 18 ? "minor" : age < 60 ? "adult" : "senior",
          hasDocuments: false,
          isActive: true,

          // closing fields start clean
          closing_totalAmount: 0, closing_paidAmount: 0, closing_pendingAmount: 0,
          totalClosingCount: 0, paidClosingCount: 0, pendingClosingCount: 0,

          // Closed in old system — only the flag + closed date (completed_date)
          ...(isClosed ? {
            member_closed: true,
            closed_date: enr.completed_date ? toDDMMYYYY(enr.completed_date) : null,
          } : {}),

          // migration audit trail
          migratedData: true,
          legacyFormId: String(form.id),
          legacyEnrollmentId: enrollmentId,
          legacyApplicationNo: enr.application_no || "",
          legacyStatus: String(enr.status),
          legacyAgentId: legacyAgentId || "",
          legacyCreatedAt: form.created_at || "",
          // old amounts kept for reference only (NOT used in the new system)
          legacyFees:    Number(enr.fees || 0),
          legacyPayFees: Number(enr.payFees || 0),
          legacyDueFees: Number(enr.dueFees || 0),
          legacyKist:    Number(enr.kist || 0),

          createdAt: parseISO(enr.created_at) || STS(),
          createdBy: authResult.user.uid,
          updated_at: STS(),
        };

        if (dryRun) {
          // Preview which media files exist for this member too
          const mediaPreview = await migrateMediaForLegacyForm(form, "dry-run", { dryRun: true })
            .catch(() => ({ uploaded: [], missing: [] }));
          doneCount++;
          results.push({
            legacyId: enrollmentId, status: "dry-run-ok", name: form.first_name,
            program: program.name, agent: agent?.name || "(no agent match)",
            regNo, oldApplicationNo, joinFees, paidAmount, pendingAmount,
            uploaded: mediaPreview.uploaded, missing: mediaPreview.missing,
            resolved: {
              state: !!state, district: !!district, city: !!city,
              caste: !!caste, relation: !!relation, agent: !!agent,
              ageGroup: !!detail.ageGroupId, period: !!detail.periodStartDate,
            },
          });
          return;
        }

        // ── Migrate photos & documents TOGETHER with the member data ─────────
        const memberRef = db.collection("members").doc();
        let media = { urls: {}, uploaded: [], missing: [] };
        try {
          media = await migrateMediaForLegacyForm(form, memberRef.id);
          filesUploaded += media.uploaded.length;
          filesMissing  += media.missing.length;
          console.log(`  📎 [MIGRATION] #${enrollmentId} ${form.first_name}: media → ${media.uploaded.length} uploaded${media.missing.length ? `, ${media.missing.length} MISSING (${media.missing.join(", ")})` : ""}`);
        } catch (mediaErr) {
          console.error(`  ❌ [MIGRATION] #${enrollmentId} media failed for form ${form.id}:`, mediaErr.message);
        }
        if (media.urls.photoURL)            memberData.photoURL            = media.urls.photoURL;
        if (media.urls.guardianPhotoURL)    memberData.guardianPhotoURL    = media.urls.guardianPhotoURL;
        if (media.urls.documentFrontURL)    memberData.documentFrontURL    = media.urls.documentFrontURL;
        if (media.urls.documentBackURL)     memberData.documentBackURL     = media.urls.documentBackURL;
        if (media.urls.guardianDocumentURL) memberData.guardianDocumentURL = media.urls.guardianDocumentURL;
        memberData.hasDocuments = !!(memberData.photoURL && memberData.documentFrontURL);
        if (media.uploaded.length) {
          memberData.migratedMedia   = true;
          memberData.migratedMediaAt = STS();
        }

        // ── Write member ──────────────────────────────────────────────────────
        memberData.srNo = await getNextSrNo();
        await memberRef.set(memberData);

        // ── Create the member's login account (same as normal member add) ────
        let accountCreated = false;
        try {
          const password = generateMemberPassword(memberData.displayName, memberData.dobDate);
          const acc = await createMemberAuthAccount({
            memberId: memberRef.id,
            displayName: memberData.displayName,
            regNo,
            password,
            programId: program.id,
          });
          accountCreated = acc.created || acc.existed;
          if (accountCreated) {
            await memberRef.update({ uid: memberRef.id, account_flag: true, password });
            if (acc.created) accountsCreated++;
            console.log(`  🔑 [MIGRATION] #${enrollmentId} ${form.first_name}: login account ${acc.created ? "CREATED" : "already existed"} → ${regNo.toLowerCase()}@ssgmsss.com`);
          }
        } catch (accErr) {
          // Non-blocking — member data stays; account can be created later
          console.error(`  ❌ [MIGRATION] #${enrollmentId} auth account failed (${regNo}):`, accErr.message);
        }

        // Log media as done so the standalone Media step (Step 2) skips this
        // form, and so revert can clean it up by memberId.
        if (media.uploaded.length || media.missing.length) {
          await db.collection("mediaMigrationLog").doc(String(form.id)).set({
            legacyId: String(form.id), status: "done", memberId: memberRef.id,
            memberName: memberData.displayName,
            uploadedFields: media.uploaded, missingFiles: media.missing,
            skippedFields: [], via: "data-migration", updatedAt: STS(),
          }, { merge: true });
        }

        // NOTE: no join-fee transaction record is created for migrated members —
        // the member doc alone shows joinFees / fixedJoinFees marked as paid.

        // ── Aggregate stats: MEMBER COUNT ONLY ────────────────────────────────
        await addStatsForMember({
          agentId: agent?.id || null,
          programId: program.id,
          programName: program.name || "",
        });

        await logRef.set({
          status: "done", memberId: memberRef.id,
          name: memberData.displayName, regNo,
          agentMatched: !!agent, updatedAt: STS(),
        }, { merge: true });

        console.log(`  ✅ [MIGRATION] #${enrollmentId} ${form.first_name} → member ${memberRef.id} | regNo ${regNo} (old: ${oldApplicationNo}) | yojna: ${program.name} | agent: ${agent?.name || "none"}`);
        doneCount++;
        results.push({
          legacyId: enrollmentId, status: "done", name: form.first_name,
          memberId: memberRef.id, regNo, oldApplicationNo, program: program.name,
          agent: agent?.name || "(no agent match)",
          uploaded: [...media.uploaded, ...(accountCreated ? ["loginAccount"] : [])],
          missing:  [...media.missing,  ...(accountCreated ? [] : ["loginAccount"])],
        });
      } catch (recErr) {
        console.error(`Member migration error for enrollment ${enrollmentId}:`, recErr);
        errorCount++;
        if (!dryRun) {
          await logRef.set({ status: "error", error: recErr.message, updatedAt: STS() }, { merge: true }).catch(() => {});
        }
        results.push({ legacyId: enrollmentId, status: "error", error: recErr.message });
      }
    };

    // ── SPEED: process the batch with 5 PARALLEL workers ──────────────────────
    // (media uploads inside each record also run in parallel)
    const queue = [...batch];
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length) {
        const enr = queue.shift();
        if (enr) await processRecord(enr);
      }
    });
    await Promise.all(workers);

    const lastId  = Number(batch[batch.length - 1].id);
    const hasMore = enrollments.some((r) => Number(r.id) > lastId);

    console.log(
      `🏁 [MIGRATION] Batch done — members: ${doneCount}, accounts created: ${accountsCreated}, ` +
      `files uploaded: ${filesUploaded}, files missing: ${filesMissing}, ` +
      `already/skipped: ${existsCount + skippedCount}, errors: ${errorCount}, lastId: ${lastId}, hasMore: ${hasMore}\n`
    );

    // Save the resume pointer (real, non-retry runs only) so a stopped
    // migration can continue from this record instead of rescanning.
    if (!dryRun && !retrySkipped) {
      await db.collection("migrationState").doc("member-data")
        .set({ lastId, updatedAt: STS() }, { merge: true }).catch(() => {});
    }

    return NextResponse.json({
      success: true, dryRun,
      summary: {
        processed: batch.length, done: doneCount, alreadyDone: existsCount,
        noMatch: skippedCount, filesUploaded, filesMissing: filesMissing + errorCount,
        accountsCreated,
      },
      nextStartAfterId: lastId, hasMore, results,
    });
  } catch (e) {
    console.error("POST migrate-member-data error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── DELETE — REVERT the member data migration ────────────────────────────────
// For every 'done' migration log:
//   1. reverses agent/program/org stats (using CURRENT member values)
//   2. reverses any commissions credited for the member (idempotent)
//   3. deletes memberJoinFees + memberClosingFees for the member
//   4. deletes migrated media files (Storage: members/migrated/{id}/) + media logs
//   5. deletes the member doc and the migration log
// When no 'done' logs remain, it clears the remaining status logs
// (already-exists / no-program / skipped / error) so a fresh run rescans everything.
// Members are only deleted if they carry the migratedData flag — manually
// created members can never be touched by this.
export async function DELETE(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Only superadmin can revert migration" }, { status: 403 });

    const body  = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 30);

    const bucket = admin.storage().bucket();
    const logsSnap = await db.collection("memberMigrationLog")
      .where("status", "==", "done").limit(limit).get();

    // Phase 2: no migrated members left — clean up the remaining logs so a
    // future migration run starts fresh.
    if (logsSnap.empty) {
      const restSnap = await db.collection("memberMigrationLog").limit(300).get();
      if (restSnap.empty) {
        // Reset the resume pointer — next migration starts from the beginning
        await db.collection("migrationState").doc("member-data").delete().catch(() => {});
        return NextResponse.json({
          success: true, message: "Revert complete — nothing left to revert",
          summary: { reverted: 0, logsCleared: 0 }, hasMore: false,
        });
      }
      const batch = db.batch();
      restSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({
        success: true,
        summary: { reverted: 0, logsCleared: restSnap.size },
        hasMore: true,
        results: [{ legacyId: "-", status: "logs-cleared", name: `${restSnap.size} status logs removed` }],
      });
    }

    const results = [];
    let reverted = 0;

    for (const logDoc of logsSnap.docs) {
      const log = logDoc.data();
      const memberId = log.memberId;

      try {
        if (!memberId) { await logDoc.ref.delete(); continue; }

        const memberSnap = await db.collection("members").doc(memberId).get();

        if (memberSnap.exists) {
          const m = memberSnap.data();

          // Safety: never delete a member that wasn't created by migration
          if (m.migratedData !== true) {
            await logDoc.ref.delete();
            results.push({ legacyId: logDoc.id, name: m.displayName, status: "skipped-not-migrated" });
            continue;
          }

          // 1. Reverse aggregate stats (current values → covers later payments too)
          await removeStatsForMember(m);

          // 2. Reverse any commissions credited for this member
          await reverseCommissionsForMember(memberId);

          // 3. Delete transactions belonging to this member
          await deleteDocsByQuery("memberJoinFees",    "memberId", memberId);
          await deleteDocsByQuery("memberClosingFees", "memberId", memberId);

          // 4. Delete migrated media files + media migration logs
          await bucket.deleteFiles({ prefix: `members/migrated/${memberId}/` }).catch(() => {});
          await deleteDocsByQuery("mediaMigrationLog", "memberId", memberId);

          // 5. Delete the member's login account + the member doc
          await auth.deleteUser(memberId).catch(() => {});
          await memberSnap.ref.delete();
        }

        await logDoc.ref.delete();
        reverted++;
        console.log(`  🗑️ [MIGRATION-REVERT] #${logDoc.id} ${log.name || ""} → member ${memberId} deleted (doc + account + files + stats reversed)`);
        results.push({ legacyId: logDoc.id, name: log.name || "", status: "reverted", memberId });
      } catch (recErr) {
        console.error(`Revert error for enrollment ${logDoc.id}:`, recErr);
        results.push({ legacyId: logDoc.id, name: log.name || "", status: "error", error: recErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      summary: { reverted },
      hasMore: true,   // keep looping — next call finds the next batch or cleans logs
      results,
    });
  } catch (e) {
    console.error("DELETE migrate-member-data error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
