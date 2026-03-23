// app/api/agents/route.js
import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db   = admin.firestore();
const auth = admin.auth();
const INC  = admin.firestore.FieldValue.increment;
const STS  = admin.firestore.FieldValue.serverTimestamp;

// ─────────────────────────────────────────────────────────────────────────────
// Read single-program financial data DIRECTLY from the member doc.
// No memberPrograms subcollection needed — all fields are flat on the member.
// ─────────────────────────────────────────────────────────────────────────────
const getMemberData = async (memberId) => {
  if (!memberId) return null;
  try {
    const snap = await db.collection('members').doc(memberId).get();
    if (!snap.exists) return null;

    const d = snap.data();

    // Single program — all flat fields
    const programId   = d.programId   || '';
    const programName = d.programName || '';
    const joinFees    = d.joinFees    || 0;
    const paidAmount  = d.paidAmount  || 0;
    const pending     = d.pendingAmount || 0;

    return {
      programId,
      programName,
      joinFees,
      paidAmount,
      pendingAmount: pending,
      agentId:  d.agentId  || null,
      hasData:  true,
    };
  } catch (e) {
    console.error("❌ getMemberData error:", e);
    return null;
  }
};

// ─── Password generator ───────────────────────────────────────────────────────
export const generatePassword = (name, dobDate) => {
  try {
    if (!name || !dobDate) return 'ssgmsss2024';
    const namePart = name.trim().split(' ')[0].substring(0, 5);
    const year     = dobDate.split('-')[2];   // DD-MM-YYYY → YYYY
    return `${namePart}${year}`;
  } catch (e) {
    console.error('generatePassword error:', e);
    return '';
  }
};

// ─── Create Firebase Auth account for member ──────────────────────────────────
const createMemberAccount = async ({ memberId, displayName, photoURL, password, programId, registrationNumber }) => {
  try {
    try {
      await auth.getUser(memberId);
      console.log("Auth already exists:", memberId);
    } catch {
      const email = `${registrationNumber}@ssgmsss.com`;
      await auth.createUser({
        uid: memberId, email, emailVerified: true,
        displayName, photoURL: photoURL || null,
        password: password || "Member@123"
      });
      // Set custom claims — single programId (string, not array)
      await auth.setCustomUserClaims(memberId, { role: "member", programId: programId || '' });

      const memberDoc = await db.collection('members').doc(memberId).get();
      if (memberDoc.exists) {
        await memberDoc.ref.update({ uid: memberId, account_flag: true });
      }
    }
  } catch (e) {
    console.error("❌ createMemberAccount error:", e);
    throw e;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD stats — increment agent, program, org counts using flat member fields
// ─────────────────────────────────────────────────────────────────────────────
const addMemberStats = async (memberInfo) => {
  const { agentId, programId, programName, joinFees, paidAmount, pendingAmount } = memberInfo;
  const batch = db.batch();

  // ── Agent ──────────────────────────────────────────────────────────────────
  if (agentId) {
    const agentRef  = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    if (agentSnap.exists) {
      const existing = agentSnap.data().programStats || {};

      // Build updated programStats for this single program
      const programStats = { ...existing };
      if (!programStats[programId]) {
        programStats[programId] = {
          programName, memberCount: 1,
          totalJoinFees: joinFees, totalJoinFeesPaid: paidAmount, totalJoinFeesPending: pendingAmount,
          lastUpdated: STS()
        };
      } else {
        programStats[programId] = {
          ...programStats[programId],
          programName: programName || programStats[programId].programName,
          memberCount:           (programStats[programId].memberCount           || 0) + 1,
          totalJoinFees:         (programStats[programId].totalJoinFees         || 0) + joinFees,
          totalJoinFeesPaid:     (programStats[programId].totalJoinFeesPaid     || 0) + paidAmount,
          totalJoinFeesPending:  (programStats[programId].totalJoinFeesPending  || 0) + pendingAmount,
          lastUpdated: STS()
        };
      }

      batch.update(agentRef, {
        memberCount:           INC(1),
        totalJoinFees:         INC(joinFees),
        totalJoinFeesPaid:     INC(paidAmount),
        totalJoinFeesPending:  INC(pendingAmount),
        programStats,
        updated_at: STS()
      });
    }
  }

  // ── Program ────────────────────────────────────────────────────────────────
  if (programId) {
    batch.update(db.collection('programs').doc(programId), {
      memberCount:          INC(1),
      totalJoinFees:        INC(joinFees),
      totalJoinFeesPaid:    INC(paidAmount),
      totalJoinFeesPending: INC(pendingAmount),
      updated_at:           STS()
    });
  }

  // ── Organization ──────────────────────────────────────────────────────────
  const orgRef  = db.collection('organizationStats').doc('current');
  const orgSnap = await orgRef.get();
  if (orgSnap.exists) {
    batch.update(orgRef, {
      totalMembers:         INC(1),
      totalJoinFees:        INC(joinFees),
      totalJoinFeesPaid:    INC(paidAmount),
      totalJoinFeesPending: INC(pendingAmount),
      updated_at:           STS()
    });
  } else {
    batch.set(orgRef, {
      totalMembers: 1,
      totalJoinFees: joinFees, totalJoinFeesPaid: paidAmount, totalJoinFeesPending: pendingAmount,
      createdAt: STS(), updated_at: STS()
    });
  }

  await batch.commit();
  console.log(`✅ Stats ADDED — program: ${programId}, agent: ${agentId}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE stats — decrement (reverse) agent, program, org counts
// ─────────────────────────────────────────────────────────────────────────────
const removeMemberStats = async (memberInfo) => {
  const { agentId, programId, joinFees, paidAmount, pendingAmount } = memberInfo;
  const batch = db.batch();

  // ── Agent ──────────────────────────────────────────────────────────────────
  if (agentId) {
    const agentRef  = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    if (agentSnap.exists) {
      const agentData    = agentSnap.data();
      const programStats = { ...(agentData.programStats || {}) };

      if (programStats[programId]) {
        const ps           = programStats[programId];
        const newMemberCnt = Math.max(0, (ps.memberCount || 0) - 1);

        if (newMemberCnt <= 0) {
          delete programStats[programId];
        } else {
          programStats[programId] = {
            ...ps,
            memberCount:          newMemberCnt,
            totalJoinFees:        Math.max(0, (ps.totalJoinFees        || 0) - joinFees),
            totalJoinFeesPaid:    Math.max(0, (ps.totalJoinFeesPaid    || 0) - paidAmount),
            totalJoinFeesPending: Math.max(0, (ps.totalJoinFeesPending || 0) - pendingAmount),
            lastUpdated: STS()
          };
        }
      }

      batch.update(agentRef, {
        memberCount:          Math.max(0, (agentData.memberCount          || 0) - 1),
        totalJoinFees:        Math.max(0, (agentData.totalJoinFees        || 0) - joinFees),
        totalJoinFeesPaid:    Math.max(0, (agentData.totalJoinFeesPaid    || 0) - paidAmount),
        totalJoinFeesPending: Math.max(0, (agentData.totalJoinFeesPending || 0) - pendingAmount),
        programStats,
        updated_at: STS()
      });
    }
  }

  // ── Program ────────────────────────────────────────────────────────────────
  if (programId) {
    const progSnap = await db.collection('programs').doc(programId).get();
    if (progSnap.exists) {
      const pd = progSnap.data();
      batch.update(db.collection('programs').doc(programId), {
        memberCount:          Math.max(0, (pd.memberCount          || 0) - 1),
        totalJoinFees:        Math.max(0, (pd.totalJoinFees        || 0) - joinFees),
        totalJoinFeesPaid:    Math.max(0, (pd.totalJoinFeesPaid    || 0) - paidAmount),
        totalJoinFeesPending: Math.max(0, (pd.totalJoinFeesPending || 0) - pendingAmount),
        updated_at:           STS()
      });
    }
  }

  // ── Organization ──────────────────────────────────────────────────────────
  const orgSnap = await db.collection('organizationStats').doc('current').get();
  if (orgSnap.exists) {
    const od = orgSnap.data();
    batch.update(db.collection('organizationStats').doc('current'), {
      totalMembers:         Math.max(0, (od.totalMembers         || 0) - 1),
      totalJoinFees:        Math.max(0, (od.totalJoinFees        || 0) - joinFees),
      totalJoinFeesPaid:    Math.max(0, (od.totalJoinFeesPaid    || 0) - paidAmount),
      totalJoinFeesPending: Math.max(0, (od.totalJoinFeesPending || 0) - pendingAmount),
      updated_at:           STS()
    });
  }

  await batch.commit();
  console.log(`✅ Stats REMOVED — program: ${programId}, agent: ${agentId}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────
const handleMemberCountUpdate = async (operation, memberId, agentId) => {
  // Read all data from the flat member doc — no subcollection
  const memberInfo = await getMemberData(memberId);
  if (!memberInfo) { console.log("No member data found for", memberId); return; }

  // Override agentId if provided explicitly
  if (agentId) memberInfo.agentId = agentId;

  if (operation === 'add')    await addMemberStats(memberInfo);
  if (operation === 'remove') await removeMemberStats(memberInfo);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST — create account + update counts
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const { isOnlyAccountCreate = false, memberData, memberId, agentId, operation = 'add' } = body;

    // Update counts (reads from member doc directly)
    if (!isOnlyAccountCreate && memberId) {
      await handleMemberCountUpdate(operation, memberId, agentId);
    }

    // Create Firebase Auth account
    await createMemberAccount({
      memberId:           memberData?.id || memberId,
      displayName:        memberData?.displayName || memberData?.fullName,
      photoURL:           memberData?.photoURL,
      password:           memberData?.password || generatePassword(memberData?.displayName || memberData?.fullName, memberData?.dobDate || memberData?.bobDate),
      programId:          memberData?.programId  || '',    // ← single flat field
      registrationNumber: memberData?.registrationNumber
    });

    return NextResponse.json(
      { success: true, message: operation === 'add' ? "Member counts increased" : "Member counts decreased" },
      { status: 201 }
    );

  } catch (e) {
    console.error("❌ POST /api/agents error:", e);
    return NextResponse.json({ success: false, message: "Internal Server Error", error: e.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — update member status / counts
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const { memberId, agentId, operation, updateData } = body;

    if (!memberId || !operation)
      return NextResponse.json({ success: false, message: 'Missing required fields: memberId, operation' }, { status: 400 });

    const memberDoc = await db.collection('members').doc(memberId).get();
    if (!memberDoc.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    // Update counts using flat member doc
    await handleMemberCountUpdate(operation, memberId, agentId);

    // Optionally update the member document itself
    if (updateData) {
      await db.collection('members').doc(memberId).update({
        ...updateData,
        updated_at: STS()
      });
    }

    return NextResponse.json(
      { success: true, message: `Member ${operation === 'remove' ? 'removed' : 'updated'} successfully` },
      { status: 200 }
    );

  } catch (e) {
    console.error("❌ PATCH /api/agents error:", e);
    return NextResponse.json({ success: false, message: "Internal Server Error", error: e.message }, { status: 500 });
  }
}