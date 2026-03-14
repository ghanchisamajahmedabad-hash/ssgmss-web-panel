import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();

const getMembersGenrateEntry = async (body) => {
  const { programId, ageGroups = [], memberGroups = [], memberClosingList = [] } = body;

  const parseDDMMYYYY = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const [day, month, year] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  try {
    let q = db.collectionGroup("memberPrograms").where("programId", "==", programId);
    if (ageGroups.length) q = q.where("ageGroupId", "in", ageGroups.slice(0, 10));
    if (memberGroups.length) q = q.where("memberGroupId", "in", memberGroups.slice(0, 10));

    const snap = await q.get();
    if (snap.empty) return [];

    const result = {};

    for (const doc of snap.docs) {
      const program = { id: doc.id, ...doc.data() };
      const memberId = program.memberId;
      if (!memberId) continue;

      if (!result[memberId]) {
        const memberDoc = await db.collection("members").doc(memberId).get();
        if (!memberDoc.exists) continue;

        const memberData = memberDoc.data();
        const joinDateObj = parseDDMMYYYY(memberData.dateJoin);
        
        // Member ki apni purani closing date (agar hai toh)
        const memberSelfClosedDate = memberData.closed_date ? new Date(memberData.closed_date) : null;

        // 1️⃣ Filter the closing list
        const allowedClosings = memberClosingList.filter(closing => {
          // Note: Here we don't check closing.memberId !== memberId because this list
          // represents the people getting married NOW, but we use their dates to 
          // calculate entries for ALL members.
          
          const closingDateStr = closing.closed_date || closing.marriageDate;
          if (!closingDateStr) return false;
          const currentClosingDateObj = new Date(closingDateStr);
          
          // ✅ Condition A: Join Date must be on or before this closing date
          const isJoined = joinDateObj.getTime() <= currentClosingDateObj.getTime();

          // ✅ Condition B: If member is already closed, they must have closed 
          // ON or AFTER this specific closing date to be included.
          let isStillActive = true;
          if (memberData.member_closed === true && memberSelfClosedDate) {
             // Agar member pehle hi close ho gaya tha is date se, toh skip
             if (memberSelfClosedDate.getTime() < currentClosingDateObj.getTime()) {
               isStillActive = false;
             }
          }

          return isJoined && isStillActive;
        });

        // 2️⃣ Skip member if no records in the list match their timeline
        if (allowedClosings.length === 0) continue;

        // 3️⃣ Final Calculation
        const calculate_Amout = allowedClosings.length * (memberData.payAmount || 0);

        result[memberId] = {
          id: memberDoc.id,
          ...memberData,
          memberPrograms: [],
          allowedClosings,
          calculate_Amout,
          validClosingsCount: allowedClosings.length
        };
      }
      result[memberId].memberPrograms.push(program);
    }

    return Object.values(result);

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}


export async function POST(req) {
  const authResult = await verifyToken(req);
  if (!authResult.success) {
    return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
  }

  const body = await req.json();
  const { programId, groupId,memberClosingList } = body;

  if (!groupId || !programId) {
    return NextResponse.json({ success: false, message: "groupId and programId are required" }, { status: 400 });
  }

  try {
    const membersList = await getMembersGenrateEntry(body);

    if (!membersList.length) {
      return NextResponse.json({ success: false, message: "No eligible members found" });
    }

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const paymentColRef = db.collection("closing_payment");

    let totalGlobalAmount = 0;
    let totalGlobalClosingCount = 0;
    const agentStatsUpdates = {}; 

    for (const member of membersList) {
      const amount = Number(member.calculate_Amout || 0);
      const closingCount = Number(member.validClosingsCount || 0);
      console.log(amount,"amount")
      console.log(closingCount,"closingCount")

      if (amount <= 0 || closingCount <= 0) continue;

      totalGlobalAmount += amount;
      totalGlobalClosingCount += closingCount;
      console.log(member.allowedClosings," member.allowedClosings")
      // 1. Create Individual Closing Payment Entry
      const entryRef = paymentColRef.doc();
      batch.set(entryRef, {
        memberId: member.id,
        memberName: member.displayName || '',
        agentId: member.agentId || '',
        amount: amount,
        validClosingsCount: closingCount,
        closingMemberIds: member.allowedClosings.map(c => c.closed_memberId || c.memberId || 'unknown'),
        programId: programId,
        closingGroupId: groupId,  
        status: "pending", // Payment is currently pending
        createdAt: timestamp,
        updatedAt: timestamp,
        active_flag: true,
        deleted_flag: false,
        generatedBy: authResult.user.uid
      });

      // 2. Update Member Main Document Counters
      console.log(member.id,'member.id')
      const memberRef = db.collection('members').doc(member.id);
      batch.update(memberRef, {
        // Financials
        closing_totalAmount: admin.firestore.FieldValue.increment(amount),
        closing_pendingAmount: admin.firestore.FieldValue.increment(amount),
        // Counts
        totalClosingCount: admin.firestore.FieldValue.increment(closingCount),
        pendingClosingCount: admin.firestore.FieldValue.increment(closingCount),
        updated_at: timestamp
      });

      // 3. Update Member Sub-collection Program
      const memberProgramRef = memberRef.collection('memberPrograms').doc(programId);
      batch.set(memberProgramRef, {
        closing_totalAmount: admin.firestore.FieldValue.increment(amount),
        closing_pendingAmount: admin.firestore.FieldValue.increment(amount),
        totalClosingCount: admin.firestore.FieldValue.increment(closingCount),
        pendingClosingCount: admin.firestore.FieldValue.increment(closingCount),
        updated_at: timestamp
      }, { merge: true });

      // 4. Track Agent Aggregate Data
      if (member.agentId) {
        if (!agentStatsUpdates[member.agentId]) {
          agentStatsUpdates[member.agentId] = { amount: 0, count: 0 };
        }
        agentStatsUpdates[member.agentId].amount += amount;
        agentStatsUpdates[member.agentId].count += closingCount;
      }
    }

    // 5. Update the Closing Group Summary (groupClosings)
    const groupRef = db.collection('groupClosings').doc(groupId);
    batch.set(groupRef, {
      totalAmount: admin.firestore.FieldValue.increment(totalGlobalAmount),
      totalPendingAmount: admin.firestore.FieldValue.increment(totalGlobalAmount),
      totalPaidAmount: admin.firestore.FieldValue.increment(0),
      totalClosingCount: admin.firestore.FieldValue.increment(totalGlobalClosingCount),
      pendingClosingCount: admin.firestore.FieldValue.increment(totalGlobalClosingCount), // Total members' closings pending in this group
      paidClosingCount: admin.firestore.FieldValue.increment(0),
      totalMembersProcessed: admin.firestore.FieldValue.increment(membersList.length),
      status: 'generated',
      updated_at: timestamp
    }, { merge: true });

    for (const [agentId, stats] of Object.entries(agentStatsUpdates)) {
      const agentRef = db.collection('agents').doc(agentId);
      
      // We use dot notation to update specific fields inside the programStats map
      // This prevents overwriting other programs' data
      const updateData = {
        // Global Agent Stats
        closing_pendingAmount: admin.firestore.FieldValue.increment(stats.amount),
        closing_totalAmount: admin.firestore.FieldValue.increment(stats.amount),
        totalClosingCount: admin.firestore.FieldValue.increment(stats.count),
        closedCount: admin.firestore.FieldValue.increment(memberClosingList.length), // No change in closed count at generation time
        pendingClosingCount: admin.firestore.FieldValue.increment(stats.count),
        updated_at: timestamp,
        // Program-Specific Stats (using dot notation for safety)
        [`programStats.${programId}.totalClosingPendingAmount`]: admin.firestore.FieldValue.increment(stats.amount),
        [`programStats.${programId}.closedCount`]: admin.firestore.FieldValue.increment(memberClosingList.length),
        [`programStats.${programId}.totalClosingAmount`]: admin.firestore.FieldValue.increment(stats.amount),
        [`programStats.${programId}.totalClosingCount`]: admin.firestore.FieldValue.increment(stats.count),
        [`programStats.${programId}.pendingClosingCount`]: admin.firestore.FieldValue.increment(stats.count),
        [`programStats.${programId}.lastUpdated`]: timestamp
      };

      batch.update(agentRef, updateData);
    }
console.log(programId,"programId")
    // 7. Update Global Program & Org Stats
    const globalProgramRef = db.collection('programs').doc(programId);
    batch.set(globalProgramRef, {
        closedCount: admin.firestore.FieldValue.increment(memberClosingList.length), // No change in closed count at generation time
      totalClosingPendingAmount: admin.firestore.FieldValue.increment(totalGlobalAmount),
      totalClosingAmount: admin.firestore.FieldValue.increment(totalGlobalAmount),
      totalClosingCount: admin.firestore.FieldValue.increment(totalGlobalClosingCount),
      pendingClosingCount: admin.firestore.FieldValue.increment(totalGlobalClosingCount),
      updated_at: timestamp
    }, { merge: true });

    // 7. Update Organization Stats
    const orgRef = db.collection('organizationStats').doc('current');
    batch.set(orgRef, {
        closedCount: admin.firestore.FieldValue.increment(memberClosingList.length), // No change in closed count at generation time
          totalClosingPendingAmount: admin.firestore.FieldValue.increment(totalGlobalAmount),
      totalClosingAmount: admin.firestore.FieldValue.increment(totalGlobalAmount),
      totalClosingCount: admin.firestore.FieldValue.increment(totalGlobalClosingCount),
      pendingClosingCount: admin.firestore.FieldValue.increment(totalGlobalClosingCount),
      updated_at: timestamp
    }, { merge: true });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Processed ${membersList.length} members for Group: ${groupId}`,
      summary: { totalGlobalAmount, totalGlobalClosingCount }
    });

  } catch (err) {
    console.error("Critical Processing Error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}