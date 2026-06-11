import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const url = new URL(req.url);
    const period = url.searchParams.get('period') || 'monthly';
    const metric = url.searchParams.get('metric') || 'overall';

    // ── Calculate date range ────────────────────────────────────────────
    const now = admin.firestore.Timestamp.now();
    const nowDate = now.toDate();
    let startDate;

    switch (period) {
      case 'daily':
        startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
        break;
      case 'weekly':
        const dayOfWeek = nowDate.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - diff);
        break;
      case 'monthly':
        startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(nowDate.getFullYear(), 0, 1);
        break;
      case 'all':
        startDate = new Date(2000, 0, 1);
        break;
      default:
        startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
    }

    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);

    // ── Fetch all active agents ─────────────────────────────────────────
    const agentsSnap = await db.collection('agents')
      .where('active_flag', '==', true)
      .where('delete_flag', '==', false)
      .get();

    const agents = [];
    agentsSnap.forEach(d => {
      const a = d.data();
      agents.push({
        id: d.id,
        name: a.name || '',
        fatherName: a.fatherName || '',
        phone1: a.phone1 || '',
        village: a.village || '',
        district: a.district || '',
        photoUrl: a.photoUrl || '',
        // Lifetime cumulative stats
        lifetimeMembers: a.memberCount || 0,
        lifetimeJoinFeesPaid: a.totalJoinFeesPaid || 0,
        lifetimeJoinFeesPending: a.totalJoinFeesPending || 0,
        lifetimeClosingPaid: a.closing_paidAmount || 0,
        lifetimeClosingPending: a.closing_pendingAmount || 0,
        lifetimeCommissionEarned: a.totalCommissionEarned || 0,
        lifetimeWalletBalance: a.walletBalance || 0,
      });
    });

    if (agents.length === 0) {
      return NextResponse.json({ success: true, agents: [], period, metric });
    }

    // ── Build agentId → name map for fast lookup ────────────────────────
    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    // ── 1. Count new members joined in period ───────────────────────────
    const newMembersSnap = await db.collection('members')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', now)
      .where('agentId', '!=', '')
      .get();

    const periodNewMembers = {};
    newMembersSnap.forEach(d => {
      const data = d.data();
      const aid = data.agentId;
      if (aid && agentMap[aid]) {
        periodNewMembers[aid] = (periodNewMembers[aid] || 0) + 1;
      }
    });

    // ── 2. Query join fee transactions in period ────────────────────────
    const joinFeesSnap = await db.collection('memberJoinFees')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', now)
      .get();

    const periodJoinFees = {};
    const processedMembers = {}; // cache memberId → agentId lookups
    const memberLookups = [];

    joinFeesSnap.forEach(d => {
      const data = d.data();
      let aid = data.agentId;
      if (aid && agentMap[aid]) {
        periodJoinFees[aid] = (periodJoinFees[aid] || 0) + (data.amount || 0);
      } else if (data.memberId) {
        // Fallback: resolve agentId from member doc
        if (!processedMembers[data.memberId]) {
          processedMembers[data.memberId] = null;
          memberLookups.push(data.memberId);
        }
      }
    });

    // Resolve memberId → agentId for transactions without agentId
    if (memberLookups.length > 0) {
      const CHUNK = 30;
      for (let i = 0; i < memberLookups.length; i += CHUNK) {
        const chunk = memberLookups.slice(i, i + CHUNK);
        const membersSnap = await db.collection('members')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        membersSnap.forEach(d => {
          processedMembers[d.id] = d.data().agentId || null;
        });
      }
      joinFeesSnap.forEach(d => {
        const data = d.data();
        const aid = processedMembers[data.memberId];
        if (aid && agentMap[aid]) {
          periodJoinFees[aid] = (periodJoinFees[aid] || 0) + (data.amount || 0);
        }
      });
    }

    // ── 3. Query closing fee transactions in period ─────────────────────
    const closingSnap = await db.collection('memberClosingFees')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', now)
      .get();

    const periodClosing = {};
    const closingMemberLookups = [];

    closingSnap.forEach(d => {
      const data = d.data();
      let aid = data.agentId;
      if (aid && agentMap[aid]) {
        periodClosing[aid] = (periodClosing[aid] || 0) + (data.amount || 0);
      } else if (data.memberId) {
        if (!processedMembers[data.memberId]) {
          processedMembers[data.memberId] = null;
          closingMemberLookups.push(data.memberId);
        }
      }
    });

    if (closingMemberLookups.length > 0) {
      const remaining = closingMemberLookups.filter(mid => processedMembers[mid] === null);
      const CHUNK = 30;
      for (let i = 0; i < remaining.length; i += CHUNK) {
        const chunk = remaining.slice(i, i + CHUNK);
        const membersSnap = await db.collection('members')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        membersSnap.forEach(d => {
          processedMembers[d.id] = d.data().agentId || null;
        });
      }
      closingSnap.forEach(d => {
        const data = d.data();
        const aid = processedMembers[data.memberId];
        if (aid && agentMap[aid]) {
          periodClosing[aid] = (periodClosing[aid] || 0) + (data.amount || 0);
        }
      });
    }

    // ── 4. Query commission transactions in period ──────────────────────
    const commissionSnap = await db.collection('commissionTransactions')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', now)
      .where('type', '==', 'credit')
      .get();

    const periodCommission = {};
    commissionSnap.forEach(d => {
      const data = d.data();
      const aid = data.agentId;
      if (aid && agentMap[aid]) {
        periodCommission[aid] = (periodCommission[aid] || 0) + (data.amount || 0);
      }
    });

    // ── Compute scores and build results ────────────────────────────────
    const results = agents.map(agent => {
      const nM = periodNewMembers[agent.id] || 0;
      const jF = periodJoinFees[agent.id] || 0;
      const cF = periodClosing[agent.id] || 0;
      const cE = periodCommission[agent.id] || 0;

      // Collection efficiency: total paid / total collected
      const totalCollected = agent.lifetimeJoinFeesPaid + agent.lifetimeClosingPaid;
      const totalExpected = agent.lifetimeJoinFeesPaid + agent.lifetimeJoinFeesPending
                         + agent.lifetimeClosingPaid + agent.lifetimeClosingPending;
      const efficiency = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

      // Composite overall score (weighted)
      // Score is computed below after all results are collected

      return {
        id: agent.id,
        name: agent.name,
        fatherName: agent.fatherName,
        phone1: agent.phone1,
        village: agent.village,
        district: agent.district,
        photoUrl: agent.photoUrl,
        periodNewMembers: nM,
        periodJoinFees: jF,
        periodClosing: cF,
        periodCommission: cE,
        efficiency: Math.round(efficiency * 100) / 100,
        lifetimeMembers: agent.lifetimeMembers,
        lifetimeJoinFeesPaid: agent.lifetimeJoinFeesPaid,
        lifetimeClosingPaid: agent.lifetimeClosingPaid,
        lifetimeCommissionEarned: agent.lifetimeCommissionEarned,
        lifetimeWalletBalance: agent.lifetimeWalletBalance,
      };
    });

    // Calculate scores (needs full results array)
    const maxMembers = Math.max(1, ...results.map(r => r.periodNewMembers));
    const maxJoinFees = Math.max(1, ...results.map(r => r.periodJoinFees));
    const maxClosing = Math.max(1, ...results.map(r => r.periodClosing));
    const maxCommission = Math.max(1, ...results.map(r => r.periodCommission));
    const maxEfficiency = Math.max(1, ...results.map(r => r.efficiency));

    results.forEach(r => {
      // Score out of 100: weighted composite
      const memberScore = maxMembers > 0 ? (r.periodNewMembers / maxMembers) * 25 : 0;
      const joinFeesScore = maxJoinFees > 0 ? (r.periodJoinFees / maxJoinFees) * 30 : 0;
      const closingScore = maxClosing > 0 ? (r.periodClosing / maxClosing) * 25 : 0;
      const commissionScore = maxCommission > 0 ? (r.periodCommission / maxCommission) * 10 : 0;
      const efficiencyScore = maxEfficiency > 0 ? (r.efficiency / maxEfficiency) * 10 : 0;
      r.score = Math.round((memberScore + joinFeesScore + closingScore + commissionScore + efficiencyScore) * 100) / 100;
    });

    // Sort by selected metric
    const sortKey = metric === 'members' ? 'periodNewMembers'
                  : metric === 'joinFees' ? 'periodJoinFees'
                  : metric === 'closing' ? 'periodClosing'
                  : metric === 'commission' ? 'periodCommission'
                  : metric === 'efficiency' ? 'efficiency'
                  : 'score';

    results.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

    return NextResponse.json({
      success: true,
      agents: results,
      period,
      metric,
      dateRange: { start: startDate.toISOString(), end: nowDate.toISOString() },
    });

  } catch (error) {
    console.error("Agent performance error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
