// app/api/members/delete-restore/route.js
import { NextResponse } from "next/server";

import admin from "../../db/firebaseAdmin";
import { verifyToken, checkRole } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const auth = admin.auth();
const INC = admin.firestore.FieldValue.increment;
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── Read flat member data (single program) ───────────────────────────────────
const getMemberInfo = async (memberId) => {
    const snap = await db.collection('members').doc(memberId).get();
    if (!snap.exists) return null;
    const d = snap.data();
    return {
        programId: d.programId || '',
        programName: d.programName || '',
        agentId: d.agentId || null,
        joinFees: d.joinFees || 0,
        paidAmount: d.paidAmount || 0,
        pendingAmount: d.pendingAmount || 0,
        // closing fields
        closing_totalAmount: d.closing_totalAmount || 0,
        closing_paidAmount: d.closing_paidAmount || 0,
        closing_pendingAmount: d.closing_pendingAmount || 0,
        totalClosingCount: d.totalClosingCount || 0,
        paidClosingCount: d.paidClosingCount || 0,
        pendingClosingCount: d.pendingClosingCount || 0,
    };
};

// ─── DECREMENT (delete) ───────────────────────────────────────────────────────
const decrementStats = async (info) => {
    const { programId, agentId, joinFees, paidAmount, pendingAmount,
        closing_totalAmount, closing_paidAmount, closing_pendingAmount,
        totalClosingCount, paidClosingCount, pendingClosingCount } = info;

    const batch = db.batch();

    // ── Agent ────────────────────────────────────────────────────────────────
    if (agentId) {
        const agentSnap = await db.collection('agents').doc(agentId).get();
        if (agentSnap.exists) {
            const ad = agentSnap.data();
            const ps = { ...(ad.programStats || {}) };

            if (programId && ps[programId]) {
                const p = ps[programId];
                const newCnt = Math.max(0, (p.memberCount || 0) - 1);
                if (newCnt <= 0) {
                    delete ps[programId];
                } else {
                    ps[programId] = {
                        ...p,
                        memberCount: newCnt,
                        totalJoinFees: Math.max(0, (p.totalJoinFees || 0) - joinFees),
                        totalJoinFeesPaid: Math.max(0, (p.totalJoinFeesPaid || 0) - paidAmount),
                        totalJoinFeesPending: Math.max(0, (p.totalJoinFeesPending || 0) - pendingAmount),
                        lastUpdated: STS(),
                    };
                }
            }

            batch.update(db.collection('agents').doc(agentId), {
                memberCount: Math.max(0, (ad.memberCount || 0) - 1),
                totalJoinFees: Math.max(0, (ad.totalJoinFees || 0) - joinFees),
                totalJoinFeesPaid: Math.max(0, (ad.totalJoinFeesPaid || 0) - paidAmount),
                totalJoinFeesPending: Math.max(0, (ad.totalJoinFeesPending || 0) - pendingAmount),
                // closing counters
                closing_totalAmount: Math.max(0, (ad.closing_totalAmount || 0) - closing_totalAmount),
                closing_paidAmount: Math.max(0, (ad.closing_paidAmount || 0) - closing_paidAmount),
                closing_pendingAmount: Math.max(0, (ad.closing_pendingAmount || 0) - closing_pendingAmount),
                totalClosingCount: Math.max(0, (ad.totalClosingCount || 0) - totalClosingCount),
                paidClosingCount: Math.max(0, (ad.paidClosingCount || 0) - paidClosingCount),
                pendingClosingCount: Math.max(0, (ad.pendingClosingCount || 0) - pendingClosingCount),
                programStats: ps,
                updated_at: STS(),
            });
        }
    }

    // ── Program ──────────────────────────────────────────────────────────────
    if (programId) {
        const progSnap = await db.collection('programs').doc(programId).get();
        if (progSnap.exists) {
            const pd = progSnap.data();
            batch.update(db.collection('programs').doc(programId), {
                memberCount: Math.max(0, (pd.memberCount || 0) - 1),
                totalJoinFees: Math.max(0, (pd.totalJoinFees || 0) - joinFees),
                totalJoinFeesPaid: Math.max(0, (pd.totalJoinFeesPaid || 0) - paidAmount),
                totalJoinFeesPending: Math.max(0, (pd.totalJoinFeesPending || 0) - pendingAmount),
                totalClosingAmount: Math.max(0, (pd.totalClosingAmount || 0) - closing_totalAmount),
                totalClosingPaidAmount: Math.max(0, (pd.totalClosingPaidAmount || 0) - closing_paidAmount),
                totalClosingPendingAmount: Math.max(0, (pd.totalClosingPendingAmount || 0) - closing_pendingAmount),
                totalClosingCount: Math.max(0, (pd.totalClosingCount || 0) - totalClosingCount),
                updated_at: STS(),
            });
        }
    }

    // ── Org ──────────────────────────────────────────────────────────────────
    const orgSnap = await db.collection('organizationStats').doc('current').get();
    if (orgSnap.exists) {
        const od = orgSnap.data();
        batch.update(db.collection('organizationStats').doc('current'), {
            totalMembers: Math.max(0, (od.totalMembers || 0) - 1),
            totalJoinFees: Math.max(0, (od.totalJoinFees || 0) - joinFees),
            totalJoinFeesPaid: Math.max(0, (od.totalJoinFeesPaid || 0) - paidAmount),
            totalJoinFeesPending: Math.max(0, (od.totalJoinFeesPending || 0) - pendingAmount),
            totalClosingPendingAmount: Math.max(0, (od.totalClosingPendingAmount || 0) - closing_pendingAmount),
            totalClosingPaidAmount: Math.max(0, (od.totalClosingPaidAmount || 0) - closing_paidAmount),
            totalClosingAmount: Math.max(0, (od.totalClosingAmount || 0) - closing_totalAmount),
            totalClosingCount: Math.max(0, (od.totalClosingCount || 0) - totalClosingCount),
            updated_at: STS(),
        });
    }

    await batch.commit();
    console.log(`✅ Stats DECREMENTED for member (program: ${programId}, agent: ${agentId})`);
};

// ─── INCREMENT (restore) ──────────────────────────────────────────────────────
const incrementStats = async (info) => {
    const { programId, programName, agentId, joinFees, paidAmount, pendingAmount,
        closing_totalAmount, closing_paidAmount, closing_pendingAmount,
        totalClosingCount, paidClosingCount, pendingClosingCount } = info;

    const batch = db.batch();

    // ── Agent ────────────────────────────────────────────────────────────────
    if (agentId) {
        const agentSnap = await db.collection('agents').doc(agentId).get();
        if (agentSnap.exists) {
            const ad = agentSnap.data();
            const ps = { ...(ad.programStats || {}) };

            if (programId) {
                if (!ps[programId]) {
                    ps[programId] = {
                        programName, memberCount: 1,
                        totalJoinFees: joinFees, totalJoinFeesPaid: paidAmount, totalJoinFeesPending: pendingAmount,
                        lastUpdated: STS(),
                    };
                } else {
                    ps[programId] = {
                        ...ps[programId],
                        memberCount: (ps[programId].memberCount || 0) + 1,
                        totalJoinFees: (ps[programId].totalJoinFees || 0) + joinFees,
                        totalJoinFeesPaid: (ps[programId].totalJoinFeesPaid || 0) + paidAmount,
                        totalJoinFeesPending: (ps[programId].totalJoinFeesPending || 0) + pendingAmount,
                        lastUpdated: STS(),
                    };
                }
            }

            batch.update(db.collection('agents').doc(agentId), {
                memberCount: INC(1),
                totalJoinFees: INC(joinFees),
                totalJoinFeesPaid: INC(paidAmount),
                totalJoinFeesPending: INC(pendingAmount),
                closing_totalAmount: INC(closing_totalAmount),
                closing_paidAmount: INC(closing_paidAmount),
                closing_pendingAmount: INC(closing_pendingAmount),
                totalClosingCount: INC(totalClosingCount),
                paidClosingCount: INC(paidClosingCount),
                pendingClosingCount: INC(pendingClosingCount),
                programStats: ps,
                updated_at: STS(),
            });
        }
    }

    // ── Program ──────────────────────────────────────────────────────────────
    if (programId) {
        batch.set(db.collection('programs').doc(programId), {
            memberCount: INC(1),
            totalJoinFees: INC(joinFees),
            totalJoinFeesPaid: INC(paidAmount),
            totalJoinFeesPending: INC(pendingAmount),
            totalClosingAmount: INC(closing_totalAmount),
            totalClosingPaidAmount: INC(closing_paidAmount),
            totalClosingPendingAmount: INC(closing_pendingAmount),
            totalClosingCount: INC(totalClosingCount),
            updated_at: STS(),
        }, { merge: true });
    }

    // ── Org ──────────────────────────────────────────────────────────────────
    batch.set(db.collection('organizationStats').doc('current'), {
        totalMembers: INC(1),
        totalJoinFees: INC(joinFees),
        totalJoinFeesPaid: INC(paidAmount),
        totalJoinFeesPending: INC(pendingAmount),
        totalClosingPendingAmount: INC(closing_pendingAmount),
        totalClosingPaidAmount: INC(closing_paidAmount),
        totalClosingAmount: INC(closing_totalAmount),
        totalClosingCount: INC(totalClosingCount),
        updated_at: STS(),
    }, { merge: true });

    await batch.commit();
    console.log(`✅ Stats INCREMENTED for member (program: ${programId}, agent: ${agentId})`);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST  → soft-delete a member (mark delete_flag=true + decrement counters)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
    try {
        const authResult = await verifyToken(req);
        if (!authResult.success)
            return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

        // Allow admin OR the member's own agent to delete
        const body = await req.json();
        const { memberId, deletedBy } = body;

        if (!memberId)
            return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

        // Read member info before marking deleted
        const info = await getMemberInfo(memberId);
        if (!info)
            return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

        // Soft-delete the member doc
        await db.collection('members').doc(memberId).update({
            delete_flag: true,
            status: 'deleted',
            active_flag: false,
            deleted_at: STS(),
            deleted_by: deletedBy || authResult.user.uid,
            updated_at: STS(),
        });

        // Decrement all counters
        await decrementStats(info);

        return NextResponse.json({ success: true, message: 'Member deleted and counters updated' });
    } catch (e) {
        console.error('❌ DELETE member error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH → restore a member (mark delete_flag=false + increment counters)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req) {
    try {
        const authResult = await verifyToken(req);
        if (!authResult.success)
            return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

        if (!checkRole(['superadmin', 'admin'], authResult.user.role))
            return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

        const body = await req.json();
        const { memberId } = body;

        if (!memberId)
            return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

        // Read member info (still in Firestore, just flagged)
        const info = await getMemberInfo(memberId);
        if (!info)
            return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

        // Restore the member doc
        await db.collection('members').doc(memberId).update({
            delete_flag: false,
            status: 'active',
            active_flag: true,
            deleted_at: DEL(),
            deleted_by: DEL(),
            restored_at: STS(),
            restored_by: authResult.user.uid,
            updated_at: STS(),
        });

        // Re-increment all counters
        await incrementStats(info);

        return NextResponse.json({ success: true, message: 'Member restored and counters updated' });
    } catch (e) {
        console.error('❌ RESTORE member error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE → permanently delete member doc + storage files
// (counters already decremented at soft-delete time, so no counter change here)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req) {
    try {
        const authResult = await verifyToken(req);
        if (!authResult.success)
            return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

        if (!checkRole(['superadmin', 'admin'], authResult.user.role))
            return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

        const { memberId } = await req.json();
        if (!memberId)
            return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

        // Delete the Firestore doc
        await db.collection('members').doc(memberId).delete();

        // Delete payment summaries
        const psSnap = await db.collection('memberPaymentSummaries').where('memberId', '==', memberId).get();
        const psBatch = db.batch();
        psSnap.docs.forEach(d => psBatch.delete(d.ref));
        if (!psSnap.empty) await psBatch.commit();

        // Delete join fee transactions
        const jfSnap = await db.collection('memberJoinFees').where('memberId', '==', memberId).get();
        const jfBatch = db.batch();
        jfSnap.docs.forEach(d => jfBatch.delete(d.ref));
        if (!jfSnap.empty) await jfBatch.commit();

        // NOTE: Storage files are deleted client-side (already handled in TrashManagementPage)
        // Counter adjustment is NOT done here because counters were already decremented at soft-delete time.

        return NextResponse.json({ success: true, message: 'Member permanently deleted' });
    } catch (e) {
        console.error('❌ PERMANENT DELETE member error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}