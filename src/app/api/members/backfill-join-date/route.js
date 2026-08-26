// POST /api/members/backfill-join-date
//
// One-time migration: populates `joinDateTs` (a sortable Timestamp) on every
// member that doesn't have it yet.
//
// The join date has always been stored as `dateJoin` / `programJoinDate` in
// DD-MM-YYYY form. Those strings don't sort chronologically ("05-01-2026" is
// alphabetically less than "10-12-2025"), so they can't back a range filter.
// The members page now filters on `joinDateTs`, which means any member without
// the field silently drops out of date-filtered results until this has run.
//
// Safe to run repeatedly — members that already have the field are skipped
// unless `force` is set.
//
// Body: { force?: boolean, dryRun?: boolean }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';
export const maxDuration = 300;

const db = admin.firestore();

// Parse DD-MM-YYYY into a Date at local midnight
const parseJoinDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can run this migration' }, { status: 403 });

    const { force = false, dryRun = false } = await req.json().catch(() => ({}));

    const snap = await db.collection('members').get();

    let scanned = 0, updated = 0, skipped = 0, unparseable = 0;
    const problems = [];

    // Firestore caps a batch at 500 writes
    let batch = db.batch();
    let pending = 0;

    for (const docSnap of snap.docs) {
      scanned++;
      const m = docSnap.data();

      if (m.joinDateTs && !force) { skipped++; continue; }

      // Prefer the member-facing join date, then the program copy
      let date = parseJoinDate(m.dateJoin) || parseJoinDate(m.programJoinDate);

      // Fall back to createdAt so the member still appears in date filters
      // rather than disappearing entirely
      if (!date && m.createdAt?.toDate) {
        date = m.createdAt.toDate();
        problems.push({
          id: docSnap.id,
          registrationNumber: m.registrationNumber || '',
          reason: 'No parseable join date — used createdAt',
          dateJoin: m.dateJoin || null,
        });
        unparseable++;
      }

      if (!date) {
        problems.push({
          id: docSnap.id,
          registrationNumber: m.registrationNumber || '',
          reason: 'No join date and no createdAt — skipped',
          dateJoin: m.dateJoin || null,
        });
        unparseable++;
        continue;
      }

      if (!dryRun) {
        batch.update(docSnap.ref, { joinDateTs: admin.firestore.Timestamp.fromDate(date) });
        pending++;
        if (pending >= 450) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
      updated++;
    }

    if (!dryRun && pending > 0) await batch.commit();

    console.log(`[BackfillJoinDate] scanned=${scanned} updated=${updated} skipped=${skipped} problems=${problems.length}${dryRun ? ' (dry run)' : ''}`);

    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun
        ? `Dry run: ${updated} member(s) would be updated, ${skipped} already had the field`
        : `Backfilled ${updated} member(s); ${skipped} already had the field`,
      scanned,
      updated,
      skipped,
      unparseable,
      // Cap the payload — the counts above tell the real story
      problems: problems.slice(0, 50),
    });

  } catch (error) {
    console.error('backfill-join-date error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
