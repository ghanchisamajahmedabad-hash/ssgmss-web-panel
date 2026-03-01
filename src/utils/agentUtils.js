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

    const totalJoinFees = programs.reduce((s, p) => s + (p.totalJoinFees || 0), 0);
    const totalPaid = programs.reduce((s, p) => s + (p.totalJoinFeesPaid || 0), 0);
    const totalPending = programs.reduce((s, p) => s + (p.totalJoinFeesPending || 0), 0);
    const totalMembers = programs.reduce((s, p) => s + (p.memberCount || 0), 0);

    return {
      ...agent,
      totalJoinFees: totalJoinFees || agent.totalJoinFees || 0,
      totalJoinFeesPaid: totalPaid || agent.totalJoinFeesPaid || 0,
      totalJoinFeesPending: totalPending || agent.totalJoinFeesPending || 0,
      totalMembers,
      programs,
    };
  });
};