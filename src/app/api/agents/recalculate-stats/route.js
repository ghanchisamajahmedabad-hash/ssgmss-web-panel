import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/recalculate-stats
// Body: { agentId }  — or omit to recalculate ALL agents
//
// Reads the ACTUAL member documents for each agent and rebuilds:
//   • agent.totalJoinFees / totalJoinFeesPaid / totalJoinFeesPending
//   • agent.memberCount
//   • agent.programStats.{pid}.totalJoinFees/Paid/Pending/memberCount
//   • agent.closing_totalAmount / closing_paidAmount / closing_pendingAmount
//   • agent.programStats.{pid}.totalClosingAmount/PaidAmount/PendingAmount
//
// Call this once after deploying the adjust-stats fix to repair stale data.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can recalculate stats' }, { status: 403 });

    const { agentId } = await req.json().catch(() => ({}));

    // ── Fetch agents to recalculate ───────────────────────────────────────────
    let agentDocs = [];
    if (agentId) {
      const snap = await db.collection('agents').doc(agentId).get();
      if (!snap.exists) return NextResponse.json({ success: false, message: 'Agent not found' }, { status: 404 });
      agentDocs = [{ id: snap.id, ...snap.data() }];
    } else {
      const snap = await db.collection('agents').where('delete_flag', '!=', true).get();
      agentDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const results = [];

    for (const agent of agentDocs) {
      try {
        // ── Fetch all non-deleted members for this agent ──────────────────────
        const membersSnap = await db.collection('members')
          .where('agentId', '==', agent.id)
          .where('delete_flag', '==', false)
          .get();

        // ── Accumulate stats per program ──────────────────────────────────────
        const programTotals = {}; // { [programId]: { ... } }
        let totalJoinFees = 0, totalJoinFeesPaid = 0, totalJoinFeesPending = 0;
        let closingTotal = 0, closingPaid = 0, closingPending = 0;
        let memberCount = 0;

        membersSnap.forEach(doc => {
          const m = doc.data();
          const pid = m.programId || '__none__';

          if (!programTotals[pid]) {
            programTotals[pid] = {
              programName:              m.programName || '',
              memberCount:              0,
              totalJoinFees:            0,
              totalJoinFeesPaid:        0,
              totalJoinFeesPending:     0,
              totalClosingAmount:       0,
              totalClosingPaidAmount:   0,
              totalClosingPendingAmount:0,
            };
          }

          const jf      = Number(m.joinFees       || 0);
          const jfPaid  = Number(m.paidAmount      || 0);
          const jfPend  = Number(m.pendingAmount    || 0);
          const cTotal  = Number(m.closing_totalAmount   || 0);
          const cPaid   = Number(m.closing_paidAmount    || 0);
          const cPend   = Number(m.closing_pendingAmount || 0);

          programTotals[pid].memberCount              += 1;
          programTotals[pid].totalJoinFees            += jf;
          programTotals[pid].totalJoinFeesPaid        += jfPaid;
          programTotals[pid].totalJoinFeesPending     += jfPend;
          programTotals[pid].totalClosingAmount       += cTotal;
          programTotals[pid].totalClosingPaidAmount   += cPaid;
          programTotals[pid].totalClosingPendingAmount+= cPend;

          totalJoinFees        += jf;
          totalJoinFeesPaid    += jfPaid;
          totalJoinFeesPending += jfPend;
          closingTotal         += cTotal;
          closingPaid          += cPaid;
          closingPending       += cPend;
          memberCount          += 1;
        });

        // ── Build the agent update ────────────────────────────────────────────
        const agentUpdate = {
          memberCount,
          totalJoinFees,
          totalJoinFeesPaid,
          totalJoinFeesPending,
          closing_totalAmount:    closingTotal,
          closing_paidAmount:     closingPaid,
          closing_pendingAmount:  closingPending,
          stats_recalculated_at:  STS(),
          updated_at:             STS(),
        };

        // Rebuild entire programStats map
        const programStatsUpdate = {};
        for (const [pid, stats] of Object.entries(programTotals)) {
          if (pid === '__none__') continue;
          programStatsUpdate[`programStats.${pid}.programName`]               = stats.programName;
          programStatsUpdate[`programStats.${pid}.memberCount`]               = stats.memberCount;
          programStatsUpdate[`programStats.${pid}.totalJoinFees`]             = stats.totalJoinFees;
          programStatsUpdate[`programStats.${pid}.totalJoinFeesPaid`]         = stats.totalJoinFeesPaid;
          programStatsUpdate[`programStats.${pid}.totalJoinFeesPending`]      = stats.totalJoinFeesPending;
          programStatsUpdate[`programStats.${pid}.totalClosingAmount`]        = stats.totalClosingAmount;
          programStatsUpdate[`programStats.${pid}.totalClosingPaidAmount`]    = stats.totalClosingPaidAmount;
          programStatsUpdate[`programStats.${pid}.totalClosingPendingAmount`] = stats.totalClosingPendingAmount;
          programStatsUpdate[`programStats.${pid}.lastUpdated`]               = STS();
        }

        await db.collection('agents').doc(agent.id).set(
          { ...agentUpdate, ...programStatsUpdate },
          { merge: true }
        );

        results.push({
          agentId:      agent.id,
          agentName:    agent.name || agent.id,
          memberCount,
          totalJoinFees,
          totalJoinFeesPaid,
          totalJoinFeesPending,
          status: 'ok',
        });

        console.log(`✅ Recalculated stats for agent ${agent.id} (${agent.name}): members=${memberCount}, paid=${totalJoinFeesPaid}, pending=${totalJoinFeesPending}`);
      } catch (agentErr) {
        console.error(`❌ Failed for agent ${agent.id}:`, agentErr);
        results.push({ agentId: agent.id, status: 'error', error: agentErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recalculated stats for ${results.length} agent(s)`,
      results,
    });

  } catch (error) {
    console.error('recalculate-stats error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
