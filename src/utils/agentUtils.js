export const processAgentStats = (agentList, programList) => {
  return agentList.map((agent) => {
    const programStats = agent.programStats || {};
    const programs = Object.entries(programStats).map(([programId, prog]) => ({
      ...prog,
      programId,
      programName: programList.find(p => p.id === programId)?.name || 'Unknown Program',
      paymentProgress: prog.totalJoinFees
        ? (prog.totalJoinFeesPaid / prog.totalJoinFees) * 100
        : 0,
    }));

    const totalJoinFeesFromStats   = programs.reduce((s, p) => s + (p.totalJoinFees        || 0), 0);
    const totalPaidFromStats       = programs.reduce((s, p) => s + (p.totalJoinFeesPaid    || 0), 0);
    const totalPendingFromStats    = programs.reduce((s, p) => s + (p.totalJoinFeesPending || 0), 0);
    const totalMembers             = programs.reduce((s, p) => s + (p.memberCount          || 0), 0);

    // Top-level agent fields (totalJoinFeesPaid, totalJoinFeesPending) are updated by
    // MORE code paths (join-fees-add, adjust-stats, addMemberStats) and are reliable.
    // programStats.{pid} fields may be stale (older payments skipped updating them).
    // Use ?? so that a legitimate 0 doesn't fall through to the programStats sum.
    return {
      ...agent,
      totalJoinFees:        agent.totalJoinFees        ?? totalJoinFeesFromStats,
      totalJoinFeesPaid:    agent.totalJoinFeesPaid    ?? totalPaidFromStats,
      totalJoinFeesPending: agent.totalJoinFeesPending ?? totalPendingFromStats,
      totalMembers:         totalMembers || (agent.memberCount || 0),
      programs,
    };
  });
};