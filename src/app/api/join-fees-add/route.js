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
      paymentType:'joinFees',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    for (const payment of memberPayments) {
      const { memberId, memberName, amount, programIds } = payment;
      let remainingAmount = Number(amount);

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) continue;

      // --- WATERFALL PROGRAM SELECTION ---
      // If programId is provided, we put it at the front of the list.
      // Then we add the rest of the member's programs so the surplus flows into them.
      let sortedPrograms = [...programIds];
      if (programId && programId !== 'all') {
        sortedPrograms = [programId, ...programIds.filter(id => id !== programId)];
      }

      for (const pId of sortedPrograms) {
        if (remainingAmount <= 0) break;

        const memberProgramRef = memberRef.collection('memberPrograms').doc(pId);
        const mpDoc = await memberProgramRef.get();
        
        if (!mpDoc.exists) continue;
        const mpData = mpDoc.data();
        const pendingForThisProgram = mpData.pendingAmount || 0;

        // Calculate how much to apply to this specific program
        let deduction = 0;
        
        if (pendingForThisProgram > 0) {
          // If there is debt, pay up to the debt amount
          deduction = Math.min(remainingAmount, pendingForThisProgram);
        } else if (pId === sortedPrograms[sortedPrograms.length - 1]) {
          // If this is the VERY LAST program and there's still money, 
          // apply the surplus here (even if pending is 0) to avoid losing track of the money.
          deduction = remainingAmount;
        }

        if (deduction > 0) {
          // Update Member Sub-collection Program
          batch.set(memberProgramRef, {
            paidAmount: admin.firestore.FieldValue.increment(deduction),
            pendingAmount: admin.firestore.FieldValue.increment(-deduction),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          // Update Global Program Stats
          const globalProgramRef = db.collection('programs').doc(pId);
          batch.set(globalProgramRef, {
            totalJoinFeesPaid: admin.firestore.FieldValue.increment(deduction),
            totalJoinFeesPending: admin.firestore.FieldValue.increment(-deduction),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          // Update Agent local stats
          if (!updatedProgramStats[pId]) {
            updatedProgramStats[pId] = { totalJoinFeesPaid: 0, totalJoinFeesPending: 0 };
          }
          updatedProgramStats[pId].totalJoinFeesPaid = (updatedProgramStats[pId].totalJoinFeesPaid || 0) + deduction;
          updatedProgramStats[pId].totalJoinFeesPending = (updatedProgramStats[pId].totalJoinFeesPending || 0) - deduction;
          updatedProgramStats[pId].lastUpdated = new Date();

          remainingAmount -= deduction;
        }
      }

      // Update Member Main Document
      const currentMemberData = memberDoc.data();
      const newPaid = (currentMemberData.paidAmount || 0) + Number(amount);
      const totalFees = currentMemberData.totalJoinFees || (newPaid + (currentMemberData.pendingAmount || 0));
      const paymentPercentage = totalFees > 0 ? (newPaid / totalFees) * 100 : 0;

      batch.update(memberRef, {
        paidAmount: admin.firestore.FieldValue.increment(Number(amount)),
        pendingAmount: admin.firestore.FieldValue.increment(-Number(amount)),
        paymentPercentage: Number(paymentPercentage.toFixed(2)),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Record Transaction
      const feeRef = db.collection('memberJoinFees').doc();
      batch.set(feeRef, {
        memberId, memberName,
        amount: Number(amount),
        paymentMode: paymentMethod,
        transactionId: transactionId || '',
        transactionDate: paymentDate,
        programIds: sortedPrograms, // Now shows the order of payment
        status: 'completed',
        createdBy: authResult.user.uid,
        paymentNote,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        search_memberName: memberName.toLowerCase(),
        groupId: paymentGroupRef.id 
      });
    }

    // 4. Final Global Updates
    batch.set(agentRef, {
      totalJoinFeesPaid: admin.firestore.FieldValue.increment(numTotalAmount),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(-numTotalAmount),
      programStats: updatedProgramStats,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const orgRef = db.collection('organizationStats').doc('current');
    batch.set(orgRef, {
      totalJoinFeesPaid: admin.firestore.FieldValue.increment(numTotalAmount),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(-numTotalAmount),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    return NextResponse.json({ success: true, message: "Waterfall payment processed successfully" });

  } catch (error) {
    console.error("❌ Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}