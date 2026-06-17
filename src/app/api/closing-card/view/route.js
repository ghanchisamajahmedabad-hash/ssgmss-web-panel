import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const url = new URL(req.url);
    const memberId = url.searchParams.get('memberId');
    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId required' }, { status: 400 });

    const closingGroupId = url.searchParams.get('closingGroupId') || '';

    // ── Look up member doc for the invitation URL ───────────────────────
    const memberSnap = await db.collection('members').doc(memberId).get();
    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    const memberData = memberSnap.data();
    console.log('[closing-card/view] member fields:', Object.keys(memberData).filter(k => k.includes('close') || k.includes('invite')).join(', '));
    console.log('[closing-card/view] member.closed_invitation_url:', memberData.closed_invitation_url ? memberData.closed_invitation_url.substring(0, 80) + '…' : 'NULL/EMPTY');
    let fileUrl = memberData.closed_invitation_url;

    // If member doc has no URL, try the closing_payment doc (per-group URL)
    if (!fileUrl && closingGroupId) {
      try {
        const cpSnap = await db.collection('closing_payment').doc(`${memberId}_${closingGroupId}`).get();
        if (cpSnap.exists) {
          console.log('[closing-card/view] closing_payment doc EXISTS, cp.closed_invitation_url:', cpSnap.data().closed_invitation_url ? cpSnap.data().closed_invitation_url.substring(0, 80) + '…' : 'NULL/EMPTY');
          fileUrl = cpSnap.data().closed_invitation_url || null;
        } else {
          console.log('[closing-card/view] closing_payment doc NOT FOUND for', `${memberId}_${closingGroupId}`);
        }
      } catch (e) { console.log('[closing-card/view] closing_payment lookup error:', e.message); }
    }

    // If still no URL, search for the latest closing_payment with an invitation
    if (!fileUrl) {
      try {
        const q = await db.collection('closing_payment')
          .where('memberId', '==', memberId)
          .where('closed_invitation_url', '!=', '')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        if (!q.empty) {
          fileUrl = q.docs[0].data().closed_invitation_url || null;
          console.log('[closing-card/view] fallback query FOUND url:', fileUrl ? fileUrl.substring(0, 80) + '…' : 'NULL');
        } else {
          console.log('[closing-card/view] fallback query EMPTY — no closing_payment docs with URL for member');
        }
      } catch (e) { console.log('[closing-card/view] fallback query error:', e.message); }
    }

    if (!fileUrl) {
      console.log('[closing-card/view] FINAL: no URL found anywhere, returning 404');
      return NextResponse.json({ success: false, message: 'No invitation card' }, { status: 404 });
    }
    console.log('[closing-card/view] FINAL: URL found, fetching from Firebase...');

    // ── Proxy: fetch from Firebase Storage server-side ──────────────────
    const response = await fetch(fileUrl);
    if (!response.ok) {
      // Fallback: try Admin SDK storage
      try {
        const bucket = admin.storage().bucket();
        const path = extractStoragePath(fileUrl);
        if (path) {
          const [buffer] = await bucket.file(path).download();
          const contentType = getContentType(path);
          return new NextResponse(buffer, {
            status: 200,
            headers: { 'Content-Type': contentType, 'Content-Disposition': 'inline' },
          });
        }
      } catch (fallbackErr) {
        console.error('Fallback failed:', fallbackErr);
      }
      return NextResponse.json({ success: false, message: 'Failed to fetch card' }, { status: 502 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Content-Disposition': 'inline' },
    });

  } catch (error) {
    console.error("View card error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ── DEBUG: log the whole flow so user can see what's happening ────────────
const debug = { memberId, closingGroupId };

// ── Helpers ────────────────────────────────────────────────────────────────

function extractStoragePath(fileUrl) {
  // Firebase download URL format:
  // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?alt=media&token={token}
  try {
    const u = new URL(fileUrl);
    const pathMatch = u.pathname.match(/\/o\/(.+)/);
    if (pathMatch) return decodeURIComponent(pathMatch[1]);
  } catch {}
  return null;
}

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
  return map[ext] || 'application/octet-stream';
}
