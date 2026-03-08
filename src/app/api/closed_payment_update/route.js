import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success) return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const currentUser = authResult.user;
    
    // Check permission
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to create payment entry' },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { 
      memberPayments, paymentDate, paymentMethod, paymentNote, 
      totalAmount, transactionId, fileUrl, agentId, programId 
    } = body;

    const batch = db.batch();
    const numTotalAmount = Number(totalAmount);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) throw new Error("Agent not found");
    
    let updatedProgramStats = { ...(agentDoc.data().programStats || {}) };

    const paymentGroupRef = db.collection('paymentGroups').doc();
    batch.set(paymentGroupRef, {
      agentId,
      totalAmount: numTotalAmount,
      paymentMethod,
      transactionId,
      paymentDate: new Date(paymentDate),
      createdBy: authResult.user.uid,
      paymentNote,
      fileUrl: fileUrl || '',
      paymentType: 'closingPayment',
      createdAt: timestamp
    });

    // Track payment allocations for each member
    const memberAllocations = {};

    for (const payment of memberPayments) {
      const { memberId, memberName, amount, programIds } = payment;
      let remainingAmount = Number(amount);

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) continue;

      // --- WATERFALL PROGRAM SELECTION ---
      let sortedPrograms = [...programIds];
      if (programId && programId !== 'all') {
        sortedPrograms = [programId, ...programIds.filter(id => id !== programId)];
      }

      // Track allocations for this member
      memberAllocations[memberId] = {
        totalPaid: Number(amount),
        programAllocations: {},
        closingEntryAllocations: []
      };

      for (const pId of sortedPrograms) {
        if (remainingAmount <= 0) break;

        const memberProgramRef = memberRef.collection('memberPrograms').doc(pId);
        const mpDoc = await memberProgramRef.get();
        
        if (!mpDoc.exists) continue;
        const mpData = mpDoc.data();
        
        // Get ALL pending closing payments for this member and program, ordered by createdAt (oldest first)
        const pendingClosingPaymentsSnapshot = await db.collection('closing_payment')
          .where('memberId', '==', memberId)
          .where('programId', '==', pId)
          .where('status', '==', 'pending')
          .orderBy('createdAt', 'asc') // FIFO: oldest first
          .get();

        if (pendingClosingPaymentsSnapshot.empty) continue;

        let amountAllocatedForProgram = 0;
        let countAllocatedForProgram = 0;
        const allocations = [];

        // Process each pending closing payment in order
        for (const closingDoc of pendingClosingPaymentsSnapshot.docs) {
          if (remainingAmount <= 0) break;

          const closingData = closingDoc.data();
          const closingAmount = closingData.amount || 0;
          const closingRef = closingDoc.ref;

          // Calculate how much to pay from this closing entry
          const paymentForThisClosing = Math.min(remainingAmount, closingAmount);
          
          if (paymentForThisClosing > 0) {
            // Determine if this closing entry is fully paid or partially paid
            const newStatus = paymentForThisClosing >= closingAmount ? 'paid' : 'pending';
            const remainingClosingAmount = closingAmount - paymentForThisClosing;

            // Update the closing payment entry
            batch.update(closingRef, {
              status: newStatus,
              paidAmount: admin.firestore.FieldValue.increment(paymentForThisClosing),
              ...(newStatus === 'paid' ? { paidAt: timestamp } : {}),
              paymentGroupId: paymentGroupRef.id,
              updated_at: timestamp
            });

            // Track allocation for summary
            allocations.push({
              closingId: closingDoc.id,
              originalAmount: closingAmount,
              paidAmount: paymentForThisClosing,
              remainingAmount: remainingClosingAmount,
              status: newStatus
            });

            amountAllocatedForProgram += paymentForThisClosing;
            countAllocatedForProgram += 1; // Count each closing entry paid (even if partial)
            remainingAmount -= paymentForThisClosing;
          }
        }

        if (amountAllocatedForProgram > 0) {
          // Update Member Sub-collection Program
          batch.set(memberProgramRef, {
            closing_paidAmount: admin.firestore.FieldValue.increment(amountAllocatedForProgram),
            closing_pendingAmount: admin.firestore.FieldValue.increment(-amountAllocatedForProgram),
            paidClosingCount: admin.firestore.FieldValue.increment(countAllocatedForProgram),
            pendingClosingCount: admin.firestore.FieldValue.increment(-countAllocatedForProgram),
            updated_at: timestamp
          }, { merge: true });

          // Update Global Program Stats
          const globalProgramRef = db.collection('programs').doc(pId);
          batch.set(globalProgramRef, {
            
            totalClosingPaidAmount: admin.firestore.FieldValue.increment(amountAllocatedForProgram),
            totalClosingPendingAmount: admin.firestore.FieldValue.increment(-amountAllocatedForProgram),
            paidClosingCount: admin.firestore.FieldValue.increment(countAllocatedForProgram),
            pendingClosingCount: admin.firestore.FieldValue.increment(-countAllocatedForProgram),
            updated_at: timestamp
          }, { merge: true });

          // Update Agent local stats
          if (!updatedProgramStats[pId]) {
            updatedProgramStats[pId] = { 
              totalClosingPaidAmount: 0, 
              totalClosingPendingAmount: 0,
              paidClosingCount: 0,
              pendingClosingCount: 0
            };
          }
          updatedProgramStats[pId].totalClosingPaidAmount = (updatedProgramStats[pId].totalClosingPaidAmount || 0) + amountAllocatedForProgram;
          updatedProgramStats[pId].totalClosingPendingAmount = (updatedProgramStats[pId].totalClosingPendingAmount || 0) - amountAllocatedForProgram;
          updatedProgramStats[pId].paidClosingCount = (updatedProgramStats[pId].paidClosingCount || 0) + countAllocatedForProgram;
          updatedProgramStats[pId].pendingClosingCount = (updatedProgramStats[pId].pendingClosingCount || 0) - countAllocatedForProgram;
          updatedProgramStats[pId].lastUpdated = new Date();

          // Store allocations for this program
          memberAllocations[memberId].programAllocations[pId] = {
            amount: amountAllocatedForProgram,
            count: countAllocatedForProgram,
            closingEntries: allocations
          };
        }
      }

      // Calculate total paid amount for this member (sum of all program allocations)
      const totalPaidForMember = Object.values(memberAllocations[memberId].programAllocations)
        .reduce((sum, prog) => sum + prog.amount, 0);

      // Update Member Main Document
      const currentMemberData = memberDoc.data();
      const newPaid = (currentMemberData.closing_paidAmount || 0) + totalPaidForMember;
      const totalFees = currentMemberData.closing_totalAmount || (newPaid + (currentMemberData.closing_pendingAmount || 0));
      const paymentPercentage = totalFees > 0 ? (newPaid / totalFees) * 100 : 0;

      const totalPaidCount = Object.values(memberAllocations[memberId].programAllocations)
        .reduce((sum, prog) => sum + prog.count, 0);

      batch.update(memberRef, {
        closing_paidAmount: admin.firestore.FieldValue.increment(totalPaidForMember),
        closing_pendingAmount: admin.firestore.FieldValue.increment(-totalPaidForMember),
        closing_paymentPercentage: Number(paymentPercentage.toFixed(2)),
        paidClosingCount: admin.firestore.FieldValue.increment(totalPaidCount),
        pendingClosingCount: admin.firestore.FieldValue.increment(-totalPaidCount),
        updated_at: timestamp
      });

      // Record Transaction with detailed allocation info
      const feeRef = db.collection('memberClosingFees').doc();
      batch.set(feeRef, {
        memberId, 
        memberName,
        amount: totalPaidForMember,
        paymentMode: paymentMethod,
        transactionId: transactionId || '',
        transactionDate: paymentDate,
        programIds: sortedPrograms,
        programAllocations: memberAllocations[memberId].programAllocations,
        status: 'completed',
        createdBy: authResult.user.uid,
        paymentNote,
        createdAt: timestamp,
        search_memberName: memberName.toLowerCase(),
        groupId: paymentGroupRef.id,
        paymentType: 'closingPayment'
      });
    }

    // Calculate total amounts from all member allocations
    const totalPaidAmount = Object.values(memberAllocations)
      .reduce((sum, member) => sum + member.totalPaid, 0);
    
    const totalPaidCount = Object.values(memberAllocations)
      .reduce((sum, member) => {
        return sum + Object.values(member.programAllocations)
          .reduce((progSum, prog) => progSum + prog.count, 0);
      }, 0);

    // Update Agent Stats
    batch.set(agentRef, {
      closing_paidAmount: admin.firestore.FieldValue.increment(totalPaidAmount),
      closing_pendingAmount: admin.firestore.FieldValue.increment(-totalPaidAmount),
      paidClosingCount: admin.firestore.FieldValue.increment(totalPaidCount),
      pendingClosingCount: admin.firestore.FieldValue.increment(-totalPaidCount),
      programStats: updatedProgramStats,
      updated_at: timestamp
    }, { merge: true });

    // Update Closing Group (payment group) status
    batch.update(paymentGroupRef, {
      status: 'completed',
      paidAt: timestamp,
      memberAllocations: memberAllocations // Store allocation details for reference
    });

    // Update Organization Stats
    const orgRef = db.collection('organizationStats').doc('current');
    batch.set(orgRef, {
      totalClosingPaidAmount: admin.firestore.FieldValue.increment(totalPaidAmount),
      totalClosingPendingAmount: admin.firestore.FieldValue.increment(-totalPaidAmount),
      paidClosingCount: admin.firestore.FieldValue.increment(totalPaidCount),
      pendingClosingCount: admin.firestore.FieldValue.increment(-totalPaidCount),
      updated_at: timestamp
    }, { merge: true });

    await batch.commit();
    
    return NextResponse.json({ 
      success: true, 
      message: "Closing payment processed successfully with FIFO allocation",
      data: {
        paymentGroupId: paymentGroupRef.id,
        totalAmount: totalPaidAmount,
        totalClosingEntries: totalPaidCount,
        allocations: memberAllocations
      }
    });

  } catch (error) {
    console.error("❌ Error processing closing payment:", error);
    return NextResponse.json({ 
      success: false, 
      message: error.message 
    }, { status: 500 });
  }
}