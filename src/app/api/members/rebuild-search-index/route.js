// POST /api/members/rebuild-search-index
//
// Rebuilds `search_keywords` — the array the search box queries — from each
// member's own stored fields.
//
// Needed because the index was only ever written when a member was created or
// approved, never when one was edited. Every member edited before that was
// fixed is still carrying the index built from their ORIGINAL details, so they
// answer to their old name, phone or village and not their current ones. Saving
// each member by hand would fix them one at a time; this does the whole
// collection.
//
// Works in cursor-paginated passes so a large collection doesn't blow the
// request timeout — the caller keeps posting the returned `nextCursor` until it
// comes back null. Safe to re-run: a member whose index already matches is
// counted and skipped, not rewritten.
//
// Body: { cursor?: string|null, pageSize?: number, dryRun?: boolean }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { buildMemberSearchIndex, sameIndex } from '@/utils/searchIndex';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();

const MAX_PAGE = 400;

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json(
        { success: false, message: 'Only superadmin can rebuild the search index' },
        { status: 403 }
      );

    const { cursor = null, pageSize = 300, dryRun = false } =
      await req.json().catch(() => ({}));

    const size = Math.min(Math.max(Number(pageSize) || 300, 1), MAX_PAGE);

    // Ordered by document id and paged with a cursor rather than offset: it
    // needs no composite index, cannot skip or repeat a document as writes land
    // mid-run, and works on members missing any other field.
    let q = db.collection('members')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(size);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();

    let scanned = 0, updated = 0, unchanged = 0, skipped = 0;
    const samples = [];

    let batch = db.batch();
    let pending = 0;

    for (const d of snap.docs) {
      scanned++;
      const m = d.data();

      // Deleted members are left alone — they are excluded from every search
      // query anyway, and rewriting them is churn for no benefit.
      if (m.delete_flag === true) { skipped++; continue; }

      const next = buildMemberSearchIndex(m);

      if (sameIndex(m.search_keywords, next)) { unchanged++; continue; }

      updated++;
      if (samples.length < 10) {
        samples.push({
          memberId: d.id,
          name: m.displayName || m.name || '',
          registrationNumber: m.registrationNumber || '',
          before: Array.isArray(m.search_keywords) ? m.search_keywords.length : 0,
          after: next.length,
        });
      }

      if (!dryRun) {
        batch.update(d.ref, { search_keywords: next });
        pending++;
        // Firestore caps a batch at 500 writes.
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
    }

    if (!dryRun && pending > 0) await batch.commit();

    // Only hand back a cursor when a full page came out — a short page means
    // this was the last one.
    const nextCursor = snap.docs.length === size
      ? snap.docs[snap.docs.length - 1].id
      : null;

    return NextResponse.json({
      success: true,
      dryRun,
      scanned, updated, unchanged, skipped,
      samples,
      nextCursor,
      done: nextCursor === null,
    });
  } catch (err) {
    console.error('rebuild-search-index error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
