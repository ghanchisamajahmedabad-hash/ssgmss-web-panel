import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { memberId, closed_date } = await req.json();
    if (!memberId)
      return NextResponse.json({ success: false, message: "memberId is required" }, { status: 400 });

    const memberRef = db.collection("members").doc(memberId);
    const snap = await memberRef.get();
    if (!snap.exists)
      return NextResponse.json({ success: false, message: "Member not found" }, { status: 404 });

    const data = snap.data();
    let newValue = null;

    // Normalize to the same ISO-string format the closing flow uses. The client
    // sends the picked date as local midnight via .toISOString(); accept any
    // parseable date and re-store it as an ISO string.
    if (closed_date) {
      const parsed = new Date(closed_date);
      if (isNaN(parsed.getTime()))
        return NextResponse.json({ success: false, message: "Invalid closed_date" }, { status: 400 });
      newValue = parsed.toISOString();
    }

    // Keep closed_status[].closed_date in sync with the top-level field —
    // only the entry for the member's closing program is touched.
    const targetProgram = data.member_closed_program || data.programId || null;
    const closedStatus = (data.closedStatus || []).map((cs) => {
      if (targetProgram && cs.programId === targetProgram) return { ...cs, closed_date: newValue };
      if (!targetProgram && !cs.closed_date) return { ...cs, closed_date: newValue };
      return cs;
    });

    const update = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (newValue) update.closed_date = newValue;

    if (closedStatus && closedStatus.length) update.closedStatus = closedStatus;

    await memberRef.update(update);

    return NextResponse.json({
      success: true,
      message: "Closing date updated",
      closed_date: newValue,
    });
  } catch (err) {
    console.error("POST /closing/update-date error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}