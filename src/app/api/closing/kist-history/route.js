// GET /api/closing/kist-history
//
// Kist (instalment) removal history — see app/api/db/kistLog.js.
//   ?memberId=        kists removed FROM this member (the payer)
//   ?closedMemberId=  kists of this closed member (removed from everybody)
//   ?closingGroupId=  everything removed from this closing group
//   ?limit=           newest first, default 300 (max 1000)
// With no filter: the newest removals across all members.
//
// Filters are single equality queries, sorted here, so no composite index is needed.
import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { KIST_LOG, REASON_LABEL } from '../../db/kistLog';

export const runtime = 'nodejs';

const db = admin.firestore();
const iso = (t) => (t?.toDate ? t.toDate().toISOString() : null);

export async function GET(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
  if (!checkRole(['superadmin', 'admin'], auth.user.role))
    return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

  try {
    const url = new URL(req.url);
    const limitN = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 300));
    const filters = [['memberId'], ['closedMemberId'], ['closingGroupId']]
      .map(([k]) => [k, url.searchParams.get(k)])
      .filter(([, v]) => v);

    let q = db.collection(KIST_LOG);
    let rows;
    if (filters.length) {
      const [k, v] = filters[0];
      const snap = await q.where(k, '==', v).limit(2000).get();
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      for (const [k2, v2] of filters.slice(1)) rows = rows.filter((r) => r[k2] === v2);
      rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      rows = rows.slice(0, limitN);
    } else {
      const snap = await q.orderBy('createdAt', 'desc').limit(limitN).get();
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    return NextResponse.json({
      success: true,
      rows: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), reasonLabel: REASON_LABEL[r.reason] || r.reason || '' })),
    });
  } catch (e) {
    console.error('GET /closing/kist-history', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
