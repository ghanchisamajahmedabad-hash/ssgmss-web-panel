// GET /api/utr-check?utr=XXXX
// How much of a UTR's bank amount is already used, and by which payments.
// Used by the payment screens to show "₹X of ₹Y used, ₹Z left" before saving.
import { NextResponse } from "next/server";
import { verifyToken } from "../../../../middleware/authMiddleware";
import { getUtrUsage } from "../db/utrLedger";

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const utr = new URL(req.url).searchParams.get('utr');
    if (!utr || !utr.trim())
      return NextResponse.json({ success: false, message: 'utr is required' }, { status: 400 });

    const data = await getUtrUsage(utr);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('utr-check error:', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
