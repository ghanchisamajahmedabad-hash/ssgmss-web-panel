/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SSGMS — Data Migration Script
 * Old MySQL/PHP app  →  New Firestore system
 *
 * Usage:
 *   node --env-file=../.env.local migration/migrate.js           # full run (all phases)
 *   node --env-file=../.env.local migration/migrate.js --dry-run # preview only (no writes)
 *
 *   Individual phases:
 *   node --env-file=../.env.local migration/migrate.js --phase=master    # states/districts/cities/castes/relations
 *   node --env-file=../.env.local migration/migrate.js --phase=programs  # yojana programs
 *   node --env-file=../.env.local migration/migrate.js --phase=agents    # agents & users
 *   node --env-file=../.env.local migration/migrate.js --phase=members   # members (auto-loads maps from Firestore)
 *   node --env-file=../.env.local migration/migrate.js --phase=stats     # recompute all stats
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const admin   = require('firebase-admin');
const fs      = require('fs');
const path    = require('path');

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const phaseArg = (args.find(a => a.startsWith('--phase=')) || '').replace('--phase=', '') || 'all';

console.log(`\n${'='.repeat(60)}`);
console.log('  SSGMS DATA MIGRATION');
console.log(`  Mode : ${DRY_RUN ? '🟡 DRY RUN (no writes)' : '🔴 LIVE (writing to Firestore)'}`);
console.log(`  Phase: ${phaseArg}`);
console.log(`${'='.repeat(60)}\n`);

// ─── Firebase init ────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}
const db  = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'src', 'app', 'api', 'migrationData');

function loadTable(filename) {
  const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
  const arr = JSON.parse(raw);
  for (const item of arr) {
    if (item?.type === 'table') return item.data || [];
  }
  return [];
}

function num(v) { return parseFloat(v) || 0; }
function str(v) { return (v == null || v === 'null') ? '' : String(v).trim(); }

function tsFromDate(dateStr) {
  if (!dateStr) return null;
  try { return admin.firestore.Timestamp.fromDate(new Date(dateStr)); } catch { return null; }
}

// Commit a Firestore batch, splitting into 400-doc chunks automatically
async function commitBatches(ops) {
  if (DRY_RUN) {
    console.log(`  [dry-run] Would write ${ops.length} documents`);
    return;
  }
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach(({ ref, data, merge }) => {
      if (merge) batch.set(ref, data, { merge: true });
      else       batch.set(ref, data);
    });
    await batch.commit();
    process.stdout.write(`  ✓ committed ${Math.min(i + CHUNK, ops.length)}/${ops.length}\r`);
  }
  console.log();
}

// ─── Load all source data ─────────────────────────────────────────────────────
console.log('📂 Loading source JSON files…');
const USERS    = loadTable('app_users.json');
const FORMS    = loadTable('app_forms.json');
const YOJANAS  = loadTable('app_forms_yojana.json');
const YOJANA_M = loadTable('app_master_yojana.json');
const CASTS    = loadTable('app_master_cast.json');
const CITIES   = loadTable('app_master_city.json');
const DISTRICTS= loadTable('app_master_district.json');
const RELATIONS= loadTable('app_master_relation.json');
const STATES   = loadTable('app_master_state.json');

console.log(`  users: ${USERS.length}, forms: ${FORMS.length}, enrollments: ${YOJANAS.length}`);
console.log(`  yojanas: ${YOJANA_M.length}, agents: ${USERS.filter(u=>u.user_type==='2').length}\n`);

// ─── JSON-based name lookup maps (oldId → name string) ───────────────────────
const castMap     = Object.fromEntries(CASTS.map(r => [r.id, str(r.title)]));
const cityMap     = Object.fromEntries(CITIES.map(r => [r.id, str(r.title)]));
const districtMap = Object.fromEntries(DISTRICTS.map(r => [r.id, str(r.title)]));
const relationMap = Object.fromEntries(RELATIONS.map(r => [r.id, str(r.title)]));
const stateMap    = Object.fromEntries(STATES.map(r => [r.id, str(r.title)]));

// ─── Firestore master ID maps (oldId → Firestore doc ID) ─────────────────────
// Populated by loadMasterMapsFromFirestore() when legacyId fields are set
const fsCastMap     = {}; // old cast_id  → Firestore castes doc ID
const fsCityMap     = {}; // old city id  → Firestore cities doc ID
const fsDistrictMap = {}; // old dist id  → Firestore districts doc ID
const fsRelationMap = {}; // old rel id   → Firestore relations doc ID
const fsStateMap    = {}; // old state id → Firestore states doc ID

// enrollment lookup: form_id → array of enrollments
const enrollmentsByForm = {};
for (const y of YOJANAS) {
  if (!enrollmentsByForm[y.form_id]) enrollmentsByForm[y.form_id] = [];
  enrollmentsByForm[y.form_id].push(y);
}

// Maps filled during migration: oldId → new Firestore ID
const programIdMap = {}; // old yojana id → Firestore doc ID
const agentIdMap   = {}; // old user id   → Firestore doc ID

// ─── Load existing maps from Firestore (used when running --phase=members alone) ─
async function loadMapsFromFirestore() {
  // Programs
  console.log('  🔍 Loading programs from Firestore…');
  const progSnap = await db.collection('programs').get();
  for (const doc of progSnap.docs) {
    const d = doc.data();
    if (d.legacyId) programIdMap[d.legacyId] = doc.id;
  }
  console.log(`  → ${Object.keys(programIdMap).length} programs mapped`);

  // Agents
  console.log('  🔍 Loading agents from Firestore…');
  const agentSnap = await db.collection('agents').get();
  for (const doc of agentSnap.docs) {
    const d = doc.data();
    if (d.legacyUserId) agentIdMap[d.legacyUserId] = doc.id;
  }
  console.log(`  → ${Object.keys(agentIdMap).length} agents mapped`);

  // Master collections (states, districts, cities, castes, relations)
  // These use legacyId set via the master edit forms
  const masterLoads = [
    { col: 'states',    map: fsStateMap,    label: 'states' },
    { col: 'districts', map: fsDistrictMap, label: 'districts' },
    { col: 'cities',    map: fsCityMap,     label: 'cities' },
    { col: 'castes',    map: fsCastMap,     label: 'castes' },
    { col: 'relations', map: fsRelationMap, label: 'relations' },
  ];
  for (const { col, map, label } of masterLoads) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.legacyId) map[String(d.legacyId)] = doc.id;
    }
    console.log(`  → ${Object.keys(map).length} ${label} mapped`);
  }
}

// ─── PHASE 1 — Programs ───────────────────────────────────────────────────────
async function migratePrograms() {
  console.log('\n📋 PHASE 1 — Programs');
  const ops = [];

  for (const y of YOJANA_M) {
    const ref = db.collection('programs').doc(); // auto-ID
    programIdMap[y.id] = ref.id;

    const data = {
      name:              str(y.title),
      regNoPrefix:       str(y.prifix),
      registrationStart: str(y.application_no),
      rules:             str(y.rules),
      status:            y.status === '1' ? 'active' : 'inactive',
      memberCount:       0,
      totalJoinFees:     0,
      totalJoinFeesPaid: 0,
      totalJoinFeesPending: 0,
      legacyId:          str(y.id),
      created_at:        tsFromDate(y.created_at) || STS(),
      updated_at:        STS(),
    };
    ops.push({ ref, data });
    console.log(`  → Program "${data.name}"  prefix=${data.regNoPrefix}  id=${ref.id}`);
  }

  await commitBatches(ops);
  console.log(`  ✅ ${ops.length} programs migrated`);
}

// ─── PHASE 2 — Agents / Users ─────────────────────────────────────────────────
async function migrateAgents() {
  console.log('\n👤 PHASE 2 — Agents & Users');
  const ops = [];

  // user_type: 0=superadmin, 1=admin, 2=agent, 3=staff
  const roleMap = { '0': 'superadmin', '1': 'admin', '2': 'agent', '3': 'staff' };

  for (const u of USERS) {
    if (!['0', '1', '2', '3'].includes(u.user_type)) continue;

    const ref = db.collection('agents').doc();
    agentIdMap[u.id] = ref.id;

    const data = {
      name:         str(u.name),
      phone1:       str(u.mobile_number),
      gender:       u.gender === '1' ? 'male' : 'female',
      fatherName:   str(u.father_name),
      email:        str(u.email),
      address:      str(u.address),
      state:        stateMap[u.state_id] || '',
      district:     districtMap[u.district_id] || '',
      city:         str(u.city_name) || cityMap[u.city_id] || '',
      aadhaarNumber:str(u.aadhar_no),
      agentCode:    str(u.code),
      referralCode: str(u.referral_code),

      // Commission rates (stored as decimals: 10% → 0.10)
      commissionRate:  num(u.fees_per) / 100,
      donationRate:    num(u.donation_per) / 100,

      role:   roleMap[u.user_type] || 'agent',
      status: u.status === '1' ? 'active' : 'inactive',

      // Wallet — start at 0, will be recalculated from history if needed
      walletBalance:        0,
      totalCommissionEarned:0,
      totalCommissionWithdrawn: 0,
      advanceBalance:       0,
      totalAdvancePaid:     0,

      // Stats — computed in Phase 4
      memberCount:          0,
      totalJoinFees:        0,
      totalJoinFeesPaid:    0,
      totalJoinFeesPending: 0,
      programStats:         {},

      // Legacy
      legacyUserId:        str(u.id),
      legacyPhotoPath:     str(u.profile_img),
      legacyAadharFront:   str(u.aadhar_front),
      legacyAadharBack:    str(u.aadhar_back),

      created_at: tsFromDate(u.created_at) || STS(),
      updated_at: STS(),
    };

    ops.push({ ref, data });
  }

  await commitBatches(ops);
  console.log(`  ✅ ${ops.length} agents/users migrated`);
  console.log(`  Agent ID map: ${Object.keys(agentIdMap).length} entries`);
}

// ─── PHASE 3 — Members ────────────────────────────────────────────────────────
async function migrateMembers() {
  console.log('\n👥 PHASE 3 — Members');

  // If running standalone (--phase=members), load maps from Firestore
  if (Object.keys(programIdMap).length === 0 || Object.keys(agentIdMap).length === 0) {
    console.log('  Maps empty — loading from Firestore…');
    if (!DRY_RUN) await loadMapsFromFirestore();
    else console.log('  [dry-run] Skipping Firestore map load');
  }

  let total = 0, skipped = 0;
  const ops = [];

  // enrollment status: 1=active, 2=completed/closed, 3=cancelled, 4=?
  const enrollStatusActive = (s) => s === '1';

  for (const form of FORMS) {
    const enrollments = enrollmentsByForm[form.id] || [];

    if (enrollments.length === 0) {
      // Member with no program enrollment — create without program
      enrollments.push(null);
    }

    for (const enroll of enrollments) {
      const ref = db.collection('members').doc();
      total++;

      const yojanaId   = enroll?.yojana_id || null;
      const progFsId   = programIdMap[yojanaId] || null;
      const progName   = YOJANA_M.find(y => y.id === yojanaId)?.title || '';

      const oldAgentId = str(enroll?.agentId || form.selAgent || '');
      const agentFsId  = agentIdMap[oldAgentId] || null;

      const joinDateStr = str(enroll?.joining_date || form.created_at?.split(' ')[0]);
      const joinDate    = tsFromDate(joinDateStr);
      const joinYear    = joinDateStr ? parseInt(joinDateStr.split('-')[0]) : null;
      const joinMonth   = joinDateStr ? parseInt(joinDateStr.split('-')[1]) : null;

      const joinFees    = num(enroll?.fees);
      const paidAmount  = num(enroll?.payFees);
      const pendingAmt  = num(enroll?.dueFees);
      const installment = num(enroll?.kist);

      const isActive = enroll
        ? enrollStatusActive(enroll.status)
        : form.status === '1';

      const data = {
        // Personal
        displayName:     str(form.first_name),
        fatherName:      str(form.father_name),
        fatherType:      form.fathertype === '1' ? 'father' : form.fathertype === '2' ? 'husband' : 'father',
        gender:          form.gender === '1' ? 'male' : 'female',
        phone:           str(form.mobile_number),
        alternatePhone:  str(form.amobile_number),
        dob:             str(form.dob),
        aadhaarNumber:   str(form.aadhar_number),
        caste:           castMap[form.cast_id] || '',
        casteId:         fsCastMap[str(form.cast_id)] || '',
        gotra:           str(form.gotra),
        address:         str(form.address),
        state:           stateMap[form.state_id] || '',
        stateId:         fsStateMap[str(form.state_id)] || '',
        district:        districtMap[form.distric_id] || '',
        districtId:      fsDistrictMap[str(form.distric_id)] || '',
        city:            str(form.city_name),
        cityId:          fsCityMap[str(form.city_name)] || '', // city identified by name in old system

        // Nominee / Varisdar
        nomineeName:     str(form.varisdar),
        nomineeRelation: relationMap[form.relation_type] || '',
        nomineeRelationId: fsRelationMap[str(form.relation_type)] || '',

        // Program enrollment
        programId:             progFsId || '',
        programName:           progName,
        registrationNumber:    str(enroll?.application_no || ''),
        joinDate:              joinDate,
        joinYear:              joinYear,
        joinMonth:             joinMonth,
        joinFees:              joinFees,
        paidAmount:            paidAmount,
        pendingAmount:         pendingAmt,
        installmentAmount:     installment,
        paymentMode:           'cash', // old system: payment_mode=1 = cash

        // Closing (not in old data)
        closing_totalAmount:   0,
        closing_paidAmount:    0,
        closing_pendingAmount: 0,
        totalClosingCount:     0,
        paidClosingCount:      0,
        pendingClosingCount:   0,

        // Agent
        agentId:    agentFsId || '',
        agentOldId: oldAgentId,

        // Status
        active_flag: isActive,
        delete_flag: false,
        account_flag:false,

        // Legacy image paths (can't migrate files without source server)
        legacyMemberPhoto:   str(form.upload_img),
        legacyGuardianPhoto: str(form.upload_father),
        legacyDocFront:      str(form.aadhar_front),
        legacyDocBack:       str(form.aadhar_back),
        legacyGuardianDoc:   str(form.aadhar_varisdar),

        // Legacy references
        legacyFormId:       str(form.id),
        legacyEnrollId:     str(enroll?.id || ''),

        createdAt:  tsFromDate(form.created_at) || STS(),
        updated_at: STS(),
      };

      ops.push({ ref, data });

      if (ops.length % 500 === 0) {
        process.stdout.write(`  Queued ${ops.length} members…\r`);
      }
    }
  }

  console.log(`  Total member docs to write: ${total} (${FORMS.length} forms × enrollments)`);
  await commitBatches(ops);
  console.log(`  ✅ ${total} member docs migrated  (${skipped} skipped)`);

  return ops.map(o => o.data); // return for stats computation
}

// ─── PHASE 4 — Compute & update stats ────────────────────────────────────────
async function computeStats() {
  console.log('\n📊 PHASE 4 — Recomputing Stats');

  // If running standalone, ensure agent map is loaded (needed for update refs)
  if (Object.keys(agentIdMap).length === 0 && !DRY_RUN) {
    await loadMapsFromFirestore();
  }

  // Read all members back from Firestore to compute real stats
  console.log('  Reading all members from Firestore…');
  const membersSnap = DRY_RUN
    ? { docs: [] }
    : await db.collection('members').get();

  const agentStats   = {}; // agentFsId → { memberCount, joinFees, paid, pending, programs:{} }
  const programStats = {}; // programFsId → { memberCount, joinFees, paid, pending }
  let orgTotal = 0, orgFees = 0, orgPaid = 0, orgPending = 0;

  for (const doc of membersSnap.docs) {
    const d = doc.data();
    if (!d.active_flag || d.delete_flag) continue;

    const aid = d.agentId;
    const pid = d.programId;

    // Org
    orgTotal++;
    orgFees    += d.joinFees   || 0;
    orgPaid    += d.paidAmount || 0;
    orgPending += d.pendingAmount || 0;

    // Program
    if (pid) {
      if (!programStats[pid]) programStats[pid] = { memberCount: 0, totalJoinFees: 0, totalJoinFeesPaid: 0, totalJoinFeesPending: 0 };
      programStats[pid].memberCount++;
      programStats[pid].totalJoinFees       += d.joinFees || 0;
      programStats[pid].totalJoinFeesPaid   += d.paidAmount || 0;
      programStats[pid].totalJoinFeesPending+= d.pendingAmount || 0;
    }

    // Agent
    if (aid) {
      if (!agentStats[aid]) agentStats[aid] = { memberCount: 0, totalJoinFees: 0, totalJoinFeesPaid: 0, totalJoinFeesPending: 0, programs: {} };
      agentStats[aid].memberCount++;
      agentStats[aid].totalJoinFees       += d.joinFees || 0;
      agentStats[aid].totalJoinFeesPaid   += d.paidAmount || 0;
      agentStats[aid].totalJoinFeesPending+= d.pendingAmount || 0;
      if (pid) {
        const pn = d.programName || '';
        if (!agentStats[aid].programs[pid]) agentStats[aid].programs[pid] = { programName: pn, memberCount: 0, totalJoinFees: 0, totalJoinFeesPaid: 0, totalJoinFeesPending: 0 };
        agentStats[aid].programs[pid].memberCount++;
        agentStats[aid].programs[pid].totalJoinFees       += d.joinFees || 0;
        agentStats[aid].programs[pid].totalJoinFeesPaid   += d.paidAmount || 0;
        agentStats[aid].programs[pid].totalJoinFeesPending+= d.pendingAmount || 0;
      }
    }
  }

  if (DRY_RUN) {
    console.log('  [dry-run] Skipping stat writes');
    return;
  }

  // Write agent stats
  const agentOps = [];
  for (const [aid, s] of Object.entries(agentStats)) {
    const programStatsMap = {};
    for (const [pid, ps] of Object.entries(s.programs)) {
      programStatsMap[`programStats.${pid}.programName`]          = ps.programName;
      programStatsMap[`programStats.${pid}.memberCount`]          = ps.memberCount;
      programStatsMap[`programStats.${pid}.totalJoinFees`]        = ps.totalJoinFees;
      programStatsMap[`programStats.${pid}.totalJoinFeesPaid`]    = ps.totalJoinFeesPaid;
      programStatsMap[`programStats.${pid}.totalJoinFeesPending`] = ps.totalJoinFeesPending;
    }
    agentOps.push({ ref: db.collection('agents').doc(aid), data: {
      memberCount:          s.memberCount,
      totalJoinFees:        s.totalJoinFees,
      totalJoinFeesPaid:    s.totalJoinFeesPaid,
      totalJoinFeesPending: s.totalJoinFeesPending,
      ...programStatsMap,
      updated_at: STS(),
    }, merge: true });
  }
  await commitBatches(agentOps);
  console.log(`  ✅ ${agentOps.length} agent stat docs updated`);

  // Write program stats
  const progOps = [];
  for (const [pid, s] of Object.entries(programStats)) {
    progOps.push({ ref: db.collection('programs').doc(pid), data: {
      memberCount:          s.memberCount,
      totalJoinFees:        s.totalJoinFees,
      totalJoinFeesPaid:    s.totalJoinFeesPaid,
      totalJoinFeesPending: s.totalJoinFeesPending,
      updated_at:           STS(),
    }, merge: true });
  }
  await commitBatches(progOps);
  console.log(`  ✅ ${progOps.length} program stat docs updated`);

  // Organization stats
  await db.collection('organizationStats').doc('current').set({
    totalMembers:         orgTotal,
    totalJoinFees:        orgFees,
    totalJoinFeesPaid:    orgPaid,
    totalJoinFeesPending: orgPending,
    updated_at:           STS(),
  }, { merge: true });
  console.log(`  ✅ Organization stats: ${orgTotal} members, ₹${orgFees} fees`);
}

// ─── PHASE 0 — Master data (states, districts, cities, castes, relations) ─────
async function migrateMaster() {
  console.log('\n🗂️  PHASE 0 — Master Data');

  // ── States ──────────────────────────────────────────────────────────────────
  console.log('\n  → States');
  const stateOldToNew = {}; // old id → new Firestore doc ID (for district/city linking)
  const stateOps = [];
  for (const s of STATES) {
    const ref = db.collection('states').doc();
    stateOldToNew[s.id] = ref.id;
    stateOps.push({ ref, data: {
      name:       str(s.title),
      hindiName:  str(s.title), // old data has no Hindi — fill manually later if needed
      status:     'active',
      legacyId:   str(s.id),
      created_at: STS(), updated_at: STS(),
    }});
    console.log(`    ${s.id} → "${s.title}"`);
  }
  await commitBatches(stateOps);
  console.log(`  ✅ ${stateOps.length} states`);

  // ── Districts ────────────────────────────────────────────────────────────────
  console.log('\n  → Districts');
  const districtOldToNew = {};
  const districtOps = [];
  for (const d of DISTRICTS) {
    const ref          = db.collection('districts').doc();
    const fsStateId    = stateOldToNew[d.state_id] || '';
    const stateName    = stateMap[d.state_id] || '';
    districtOldToNew[d.id] = ref.id;
    districtOps.push({ ref, data: {
      name:           str(d.title),
      hindiName:      str(d.title),
      stateId:        fsStateId,
      stateName:      stateName,
      stateHindiName: stateName,
      status:         'active',
      legacyId:       str(d.id),
      created_at:     STS(), updated_at: STS(),
    }});
    console.log(`    ${d.id} → "${d.title}" (state: ${stateName})`);
  }
  await commitBatches(districtOps);
  console.log(`  ✅ ${districtOps.length} districts`);

  // ── Cities ───────────────────────────────────────────────────────────────────
  console.log('\n  → Cities');
  const cityOps = [];
  for (const c of CITIES) {
    const ref            = db.collection('cities').doc();
    const fsDistrictId   = districtOldToNew[c.district_id] || '';
    const districtName   = districtMap[c.district_id] || '';
    const fsStateId      = stateOldToNew[c.state_id] || '';
    const stateName      = stateMap[c.state_id] || '';
    cityOps.push({ ref, data: {
      name:              str(c.title),
      hindiName:         str(c.title),
      districtId:        fsDistrictId,
      districtName:      districtName,
      districtHindiName: districtName,
      stateId:           fsStateId,
      stateName:         stateName,
      stateHindiName:    stateName,
      status:            'active',
      legacyId:          str(c.id),
      created_at:        STS(), updated_at: STS(),
    }});
  }
  await commitBatches(cityOps);
  console.log(`  ✅ ${cityOps.length} cities`);

  // ── Castes ───────────────────────────────────────────────────────────────────
  console.log('\n  → Castes');
  const casteOps = [];
  for (const c of CASTS) {
    const ref = db.collection('castes').doc();
    casteOps.push({ ref, data: {
      name:       str(c.title),
      hindiName:  str(c.title),
      description:'',
      status:     'active',
      legacyId:   str(c.id),
      created_at: STS(), updated_at: STS(),
    }});
    console.log(`    ${c.id} → "${c.title}"`);
  }
  await commitBatches(casteOps);
  console.log(`  ✅ ${casteOps.length} castes`);

  // ── Relations ────────────────────────────────────────────────────────────────
  console.log('\n  → Relations');
  const relationOps = [];
  for (const r of RELATIONS) {
    const ref = db.collection('relations').doc();
    relationOps.push({ ref, data: {
      name:       str(r.title),
      hindiName:  str(r.title),
      status:     'active',
      legacyId:   str(r.id),
      created_at: STS(), updated_at: STS(),
    }});
    console.log(`    ${r.id} → "${r.title}"`);
  }
  await commitBatches(relationOps);
  console.log(`  ✅ ${relationOps.length} relations`);

  console.log('\n  🏁 Master data migration complete');
  console.log('  ⚠️  Hindi names were copied from English — update them manually in Master pages if needed.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  try {
    const runPhase = (name) => phaseArg === 'all' || phaseArg === name;

    if (runPhase('master'))   await migrateMaster();
    if (runPhase('programs')) await migratePrograms();
    if (runPhase('agents'))   await migrateAgents();
    if (runPhase('members'))  await migrateMembers();
    if (runPhase('stats'))    await computeStats();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ MIGRATION COMPLETE in ${elapsed}s`);
    if (DRY_RUN) console.log('   (DRY RUN — nothing was written to Firestore)');
    console.log(`${'='.repeat(60)}\n`);
  } catch (err) {
    console.error('\n❌ MIGRATION FAILED:', err);
    process.exit(1);
  }
  process.exit(0);
}

main();
