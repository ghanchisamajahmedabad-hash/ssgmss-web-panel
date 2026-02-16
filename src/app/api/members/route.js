// app/api/agents/route.js
import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();
const auth = admin.auth();

// Common function to get memberPrograms data
const getMemberProgramsData = async (memberId) => {
  if (!memberId) return null;
  
  try {
    const memberProgramsRef = db
      .collection('members')
      .doc(memberId)
      .collection('memberPrograms');
    
    const memberProgramsSnap = await memberProgramsRef.get();
    
    if (memberProgramsSnap.empty) {
      return null;
    }
    
    // Aggregate all program data
    const programAggregates = {};
    let totalJoinFees = 0;
    let totalPaid = 0;
    let totalPending = 0;
    const allProgramData = [];
    
    memberProgramsSnap.forEach(doc => {
      const programData = doc.data();
      allProgramData.push(programData);
      
      const programId = programData.programId;
      
      if (programId) {
        if (!programAggregates[programId]) {
          programAggregates[programId] = {
            programName: programData.programName || programId,
            joinFees: programData.joinFees || 0,
            paidAmount: programData.paidAmount || 0,
            pendingAmount: programData.pendingAmount || 0,
            memberCount: 1
          };
        } else {
          programAggregates[programId].joinFees += programData.joinFees || 0;
          programAggregates[programId].paidAmount += programData.paidAmount || 0;
          programAggregates[programId].pendingAmount += programData.pendingAmount || 0;
          programAggregates[programId].memberCount += 1;
        }
      }
      
      totalJoinFees += programData.joinFees || 0;
      totalPaid += programData.paidAmount || 0;
      totalPending += programData.pendingAmount || 0;
    });
    
    return {
      programAggregates,
      totalJoinFees,
      totalPaid,
      totalPending,
      allProgramData,
      hasData: true
    };
  } catch (error) {
    console.error("❌ Error fetching memberPrograms data:", error);
    return null;
  }
};

// REVERSE COUNT: Decrease counts when member is deleted/updated
const reverseAgentProgramStats = async (agentId, memberProgramsData) => {
  if (!agentId || !memberProgramsData || !memberProgramsData.hasData) return;
  
  try {
    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    
    if (!agentDoc.exists) return;
    
    const currentAgentData = agentDoc.data();
    const programStats = currentAgentData.programStats || {};
    const { programAggregates, totalJoinFees, totalPaid, totalPending } = memberProgramsData;
    
    // Reverse each program's stats for this agent
    for (const [programId, stats] of Object.entries(programAggregates)) {
      if (programStats[programId]) {
        const currentStats = programStats[programId];
        
        // Calculate new values (don't go below 0)
        const newMemberCount = Math.max(0, (currentStats.memberCount || 0) - stats.memberCount);
        const newTotalJoinFees = Math.max(0, (currentStats.totalJoinFees || 0) - stats.joinFees);
        const newTotalJoinFeesPaid = Math.max(0, (currentStats.totalJoinFeesPaid || 0) - stats.paidAmount);
        const newTotalJoinFeesPending = Math.max(0, (currentStats.totalJoinFeesPending || 0) - stats.pendingAmount);
        
        if (newMemberCount <= 0) {
          // Remove the program from stats if no members left
          delete programStats[programId];
        } else {
          // Update with reduced values
          programStats[programId] = {
            ...currentStats,
            memberCount: newMemberCount,
            totalJoinFees: newTotalJoinFees,
            totalJoinFeesPaid: newTotalJoinFeesPaid,
            totalJoinFeesPending: newTotalJoinFeesPending,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          };
        }
      }
    }
    
    // Calculate new overall counts (don't go below 0)
    const newMemberCount = Math.max(0, (currentAgentData.memberCount || 0) - 1);
    const newTotalJoinFees = Math.max(0, (currentAgentData.totalJoinFees || 0) - totalJoinFees);
    const newTotalJoinFeesPaid = Math.max(0, (currentAgentData.totalJoinFeesPaid || 0) - totalPaid);
    const newTotalJoinFeesPending = Math.max(0, (currentAgentData.totalJoinFeesPending || 0) - totalPending);
    
    const updateData = {
      memberCount: newMemberCount,
      totalJoinFees: newTotalJoinFees,
      totalJoinFeesPaid: newTotalJoinFeesPaid,
      totalJoinFeesPending: newTotalJoinFeesPending,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Only include programStats if it has entries
    if (Object.keys(programStats).length > 0) {
      updateData.programStats = programStats;
    }
    
    await agentRef.update(updateData);
    
    console.log(`✅ Agent ${agentId} program-wise stats reversed (decreased)`);
    
    return { totalJoinFees, totalPaid, totalPending };
  } catch (error) {
    console.error("❌ Error reversing agent program stats:", error);
    throw error;
  }
};

// REVERSE COUNT: Decrease program counts
const reverseProgramCounts = async (memberProgramsData) => {
  if (!memberProgramsData || !memberProgramsData.allProgramData) return;
  
  try {
    const batch = db.batch();
    const allProgramData = memberProgramsData.allProgramData;
    
    for (const programData of allProgramData) {
      const programId = programData.programId;
      
      if (programId) {
        const programRef = db.collection('programs').doc(programId);
        const programDoc = await programRef.get();
        
        if (programDoc.exists) {
          const currentData = programDoc.data();
          
          // Calculate new values (don't go below 0)
          const newMemberCount = Math.max(0, (currentData.memberCount || 0) - 1);
          const newTotalJoinFees = Math.max(0, (currentData.totalJoinFees || 0) - (programData.joinFees || 0));
          const newTotalJoinFeesPaid = Math.max(0, (currentData.totalJoinFeesPaid || 0) - (programData.paidAmount || 0));
          const newTotalJoinFeesPending = Math.max(0, (currentData.totalJoinFeesPending || 0) - (programData.pendingAmount || 0));
          
          batch.update(programRef, {
            memberCount: newMemberCount,
            totalJoinFees: newTotalJoinFees,
            totalJoinFeesPaid: newTotalJoinFeesPaid,
            totalJoinFeesPending: newTotalJoinFeesPending,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
    
    await batch.commit();
    console.log(`✅ ${allProgramData.length} program counts reversed (decreased)`);
  } catch (error) {
    console.error("❌ Error reversing program counts:", error);
  }
};

// REVERSE COUNT: Decrease organization count
const reverseOrganizationCount = async (memberProgramsData) => {
  try {
    const orgRef = db.collection('organizationStats').doc('current');
    const orgDoc = await orgRef.get();
    
    if (!orgDoc.exists) return;
    
    const currentOrgData = orgDoc.data();
    
    let totalJoinFees = 0;
    let totalPaid = 0;
    let totalPending = 0;
    
    if (memberProgramsData && memberProgramsData.hasData) {
      // Use memberPrograms data if available
      totalJoinFees = memberProgramsData.totalJoinFees;
      totalPaid = memberProgramsData.totalPaid;
      totalPending = memberProgramsData.totalPending;
    }
    
    // Calculate new values (don't go below 0)
    const newTotalMembers = Math.max(0, (currentOrgData.totalMembers || 0) - 1);
    const newTotalJoinFees = Math.max(0, (currentOrgData.totalJoinFees || 0) - totalJoinFees);
    const newTotalJoinFeesPaid = Math.max(0, (currentOrgData.totalJoinFeesPaid || 0) - totalPaid);
    const newTotalJoinFeesPending = Math.max(0, (currentOrgData.totalJoinFeesPending || 0) - totalPending);
    
    await orgRef.update({
      totalMembers: newTotalMembers,
      totalJoinFees: newTotalJoinFees,
      totalJoinFeesPaid: newTotalJoinFeesPaid,
      totalJoinFeesPending: newTotalJoinFeesPending,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log("✅ Organization count reversed (decreased)");
  } catch (error) {
    console.error("❌ Error reversing organization count:", error);
  }
};

// Helper function: Update agent's program-wise stats (ADD)
const updateAgentProgramStats = async (agentId, memberProgramsData) => {
  if (!agentId || !memberProgramsData || !memberProgramsData.hasData) return;
  
  try {
    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    
    if (!agentDoc.exists) return;
    
    const currentAgentData = agentDoc.data();
    const programStats = currentAgentData.programStats || {};
    const { programAggregates, totalJoinFees, totalPaid, totalPending } = memberProgramsData;
    
    // Update each program's stats for this agent
    for (const [programId, stats] of Object.entries(programAggregates)) {
      if (!programStats[programId]) {
        // Initialize if first member in this program
        programStats[programId] = {
          programName: stats.programName,
          memberCount: stats.memberCount,
          totalJoinFees: stats.joinFees,
          totalJoinFeesPaid: stats.paidAmount,
          totalJoinFeesPending: stats.pendingAmount,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
      } else {
        // Update existing program stats
        programStats[programId] = {
          ...programStats[programId],
          programName: stats.programName || programStats[programId].programName,
          memberCount: (programStats[programId].memberCount || 0) + stats.memberCount,
          totalJoinFees: (programStats[programId].totalJoinFees || 0) + stats.joinFees,
          totalJoinFeesPaid: (programStats[programId].totalJoinFeesPaid || 0) + stats.paidAmount,
          totalJoinFeesPending: (programStats[programId].totalJoinFeesPending || 0) + stats.pendingAmount,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
      }
    }
    
    // Update overall agent counts
    await agentRef.update({
      memberCount: admin.firestore.FieldValue.increment(1),
      totalJoinFees: admin.firestore.FieldValue.increment(totalJoinFees),
      totalJoinFeesPaid: admin.firestore.FieldValue.increment(totalPaid),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(totalPending),
      programStats: programStats,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Agent ${agentId} program-wise stats updated (increased)`);
    
    return { totalJoinFees, totalPaid, totalPending };
  } catch (error) {
    console.error("❌ Error updating agent program stats:", error);
    throw error;
  }
};

// Update program counts based on memberPrograms data (ADD)
const updateProgramCounts = async (memberProgramsData) => {
  if (!memberProgramsData || !memberProgramsData.allProgramData) return;
  
  try {
    const batch = db.batch();
    const allProgramData = memberProgramsData.allProgramData;
    
    for (const programData of allProgramData) {
      const programId = programData.programId;
      
      if (programId) {
        const programRef = db.collection('programs').doc(programId);
        
        // Update each program with individual amounts
        batch.update(programRef, {
          memberCount: admin.firestore.FieldValue.increment(1),
          totalJoinFees: admin.firestore.FieldValue.increment(programData.joinFees || 0),
          totalJoinFeesPaid: admin.firestore.FieldValue.increment(programData.paidAmount || 0),
          totalJoinFeesPending: admin.firestore.FieldValue.increment(programData.pendingAmount || 0),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    await batch.commit();
    console.log(`✅ ${allProgramData.length} program counts updated (increased)`);
  } catch (error) {
    console.error("❌ Error updating program counts:", error);
  }
};

// Update organization count (ADD)
const updateOrganizationCount = async (memberProgramsData) => {
  try {
    const orgRef = db.collection('organizationStats').doc('current');
    
    let totalJoinFees = 0;
    let totalPaid = 0;
    let totalPending = 0;
    
    if (memberProgramsData && memberProgramsData.hasData) {
      // Use memberPrograms data if available
      totalJoinFees = memberProgramsData.totalJoinFees;
      totalPaid = memberProgramsData.totalPaid;
      totalPending = memberProgramsData.totalPending;
    }
    
    const orgDoc = await orgRef.get();
    
    if (!orgDoc.exists) {
      await orgRef.set({
        totalMembers: 1,
        totalJoinFees: totalJoinFees,
        totalJoinFeesPaid: totalPaid,
        totalJoinFeesPending: totalPending,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const currentOrgData = orgDoc.data();
      
      await orgRef.update({
        totalMembers: admin.firestore.FieldValue.increment(1),
        totalJoinFees: admin.firestore.FieldValue.increment(totalJoinFees),
        totalJoinFeesPaid: admin.firestore.FieldValue.increment(totalPaid),
        totalJoinFeesPending: admin.firestore.FieldValue.increment(totalPending),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log("✅ Organization count updated (increased)");
  } catch (error) {
    console.error("❌ Error updating organization count:", error);
  }
};

// Create member account
const createMemberAccount = async ({
  memberId,
  displayName,
  photoURL,
  password,
  programIds,
  registrationNumber
}) => {
  try {
    // Check if auth user already exists
    try {
      await auth.getUser(memberId);
      console.log("Auth already exists:", memberId);
    } catch {
      const email = `${registrationNumber}@ssgmsss.com`;

      await auth.createUser({
        uid: memberId,
        email,
        emailVerified: true,
        displayName: displayName,
        photoURL: photoURL || null,
        password: password || "Member@123"
      });

      await auth.setCustomUserClaims(memberId, {
        role: "member",
        programIds: programIds || []
      });

      const memberDoc = await db.collection('members').doc(memberId).get();
      if (memberDoc.exists) {
        await memberDoc.ref.update({
          uid: memberId,
          account_flag: true,
        });
      }
    }
  } catch (error) {
    console.error("❌ Error creating member account:", error);
    throw error;
  }
};

// Main handler for adding/removing counts
const handleMemberCountUpdate = async (operation, memberData, memberId, agentId) => {
  const agentIdToUpdate = agentId || memberData.agentId;
  const actualMemberId = memberId || memberData.uid;
  
  // 1. Get memberPrograms data ONCE
  const memberProgramsData = await getMemberProgramsData(actualMemberId);
  
  if (!memberProgramsData) {
    console.log("No memberPrograms data found");
    return;
  }
  
  // 2. Update agent counts with program-wise stats
  if (agentIdToUpdate) {
    if (operation === 'add') {
      await updateAgentProgramStats(agentIdToUpdate, memberProgramsData);
    } else if (operation === 'remove') {
      await reverseAgentProgramStats(agentIdToUpdate, memberProgramsData);
    }
  }
  
  // 3. Update program counts
  if (operation === 'add') {
    await updateProgramCounts(memberProgramsData);
  } else if (operation === 'remove') {
    await reverseProgramCounts(memberProgramsData);
  }
  
  // 4. Update organization count
  if (operation === 'add') {
    await updateOrganizationCount(memberProgramsData);
  } else if (operation === 'remove') {
    await reverseOrganizationCount(memberProgramsData);
  }
  
  console.log(`✅ All counts ${operation === 'add' ? 'increased' : 'decreased'} successfully`);
};
export const generatePassword = (name, dobDate) => {
  try {
    if (!name || !dobDate) return 'ssgmsss2024';

    // Get first word from name (before space)
    const firstName = name.trim().split(' ')[0];

    // Take first 5 letters (if less than 5, use full)
    const namePart = firstName.substring(0, 5);

    // Extract year from DD-MM-YYYY
    const year = dobDate.split('-')[2];

    return `${namePart}${year}`;

  } catch (error) {
    console.error('Error generating password:', error);
    return '';
  }
};
export async function POST(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }
    
    const currentUser = authResult.user;
    
    // Check permission
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to create members' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { 
      isOnlyAccountCreate = false, 
      memberData, 
      memberId, 
      agentId,
      operation = 'add' // 'add' or 'remove'
    } = body;
    
    // If not just account creation, update all counts
    if (!isOnlyAccountCreate && memberData) {
      await handleMemberCountUpdate(operation, memberData, memberId, agentId);
    }
     await createMemberAccount({
        memberId: memberData.id,
        displayName: memberData.fullName,
        photoURL: memberData.photoURL,
        password: memberData.password || generatePassword(memberData.fullName, memberData.bobDate),
        programIds: memberData.programIds,
        registrationNumber: memberData.registrationNumber
     })
    return NextResponse.json(
      { 
        success: true, 
        message: operation === 'add' 
          ? "Member counts increased successfully" 
          : "Member counts decreased successfully" 
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("❌ Error in POST /api/agents:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error", error: error.message },
      { status: 500 }
    );
  }
}

// New PATCH endpoint for updating member status
export async function PATCH(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }
    
    const currentUser = authResult.user;
    
    // Check permission
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to update members' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { 
      memberId,
      agentId,
      operation, // 'add' or 'remove'
      updateData // Optional: if you want to update member document too
    } = body;
    
    if (!memberId || !agentId || !operation) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Get member data first
    const memberDoc = await db.collection('members').doc(memberId).get();
    if (!memberDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'Member not found' },
        { status: 404 }
      );
    }
    
    const memberData = memberDoc.data();
    
    // Handle count update
    await handleMemberCountUpdate(operation, memberData, memberId, agentId);
    
    // Update member document if needed
    if (updateData) {
      await db.collection('members').doc(memberId).update({
        ...updateData,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    return NextResponse.json(
      { 
        success: true, 
        message: `Member ${operation === 'remove' ? 'deleted' : 'updated'} successfully` 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("❌ Error in PATCH /api/agents:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error", error: error.message },
      { status: 500 }
    );
  }
}