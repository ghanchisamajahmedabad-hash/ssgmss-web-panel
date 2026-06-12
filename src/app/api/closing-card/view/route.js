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

    // ── Look up member doc for the invitation URL ───────────────────────
    const memberSnap = await db.collection('members').doc(memberId).get();
    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    const memberData = memberSnap.data();
    const fileUrl = memberData.closed_invitation_url;
    if (!fileUrl)
      return NextResponse.json({ success: false, message: 'No invitation card' }, { status: 404 });

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
