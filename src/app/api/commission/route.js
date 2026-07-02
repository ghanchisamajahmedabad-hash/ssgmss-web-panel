import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── Fetch live commission rates from Firestore settings ──────────────────────
// Falls back to defaults if the settings doc doesn't exist yet.
const DEFAULT_RATES = { joinFeesRate: 25, closingPaymentRate: 5 };

const getCommissionRates = async () => {
  try {
    const snap = await db.collection("settings").doc("commission").get();
    if (!snap.exists) return DEFAULT_RATES;
    const d = snap.data();
    return {
      joinFeesRate:       Number(d.joinFeesRate       ?? DEFAULT_RATES.joinFeesRate),
      closingPaymentRate: Number(d.closingPaymentRate ?? DEFAULT_RATES.closingPaymentRate),
    };
  } catch (e) {
    console.error("getCommissionRates error — using defaults:", e);
    return DEFAULT_RATES;
  }
};

// ─── Core: credit commission to a single agent ────────────────────────────────
// Checks:
//  1. agent.commissionEnabled !== false  (false = opt-out; undefined/true = opt-in)
//  2. rate > 0
//  3. computed amount > 0
// Returns null (silently) when commission is not applicable.
export const creditCommissionStandalone = async ({
  agentId, amount, source, sourceId,
  memberName, memberFatherName, memberRegNo,
  programId, programName, description, createdBy,
}) => {
  try {
    // ── 1. Fetch agent & check opt-in ─────────────────────────────────────────
    const agentRef  = db.collection("agents").doc(agentId);
    const agentDoc  = await agentRef.get();
    if (!agentDoc.exists) return null;

    const agentData = agentDoc.data();

    // Per-source commission toggle (defaults to true if field was never set)
    if (source === "joinFees"       && agentData.commissionJoinFeesEnabled === false) {
      console.log(`Join-fees commission skipped for agent ${agentId}`);
      return null;
    }
    if (source === "closingPayment" && agentData.commissionClosingEnabled  === false) {
      console.log(`Closing commission skipped for agent ${agentId}`);
      return null;
    }

    // ── 2. Fetch dynamic rates ────────────────────────────────────────────────
    const rates = await getCommissionRates();
    const ratePercent = source === "joinFees"
      ? rates.joinFeesRate
      : source === "closingPayment"
        ? rates.closingPaymentRate
        : 0;

    if (ratePercent <= 0) return null;

    const rate             = ratePercent / 100;
    const commissionAmount = Math.round(amount * rate * 100) / 100;
    if (commissionAmount <= 0) return null;

    // ── 3. Credit wallet + write transaction ──────────────────────────────────
    const currentWallet = agentData.walletBalance || 0;
    const batch         = db.batch();

    batch.update(agentRef, {
      walletBalance:         INC(commissionAmount),
      totalCommissionEarned: INC(commissionAmount),
      updated_at:            STS(),
    });

    const txRef = db.collection("commissionTransactions").doc();
    const sourceLabel = source === "joinFees"
      ? `Join Fees Commission (${ratePercent}%)`
      : `Closing Payment Commission (${ratePercent}%)`;

    batch.set(txRef, {
      agentId,
      agentName:        agentData.name || "",
      type:             "credit",
      amount:           commissionAmount,
      source,
      sourceId:         sourceId         || "",
      memberName:       memberName       || "",
      memberFatherName: memberFatherName || "",
      memberRegNo:      memberRegNo      || "",
      programId:        programId        || "",
      programName:      programName      || "",
      commissionRate:   rate,
      commissionRatePercent: ratePercent,
      description:      description || sourceLabel,
      balanceBefore:    currentWallet,
      balanceAfter:     currentWallet + commissionAmount,
      createdBy:        createdBy || "",
      createdAt:        STS(),
    });

    await batch.commit();
    return { txId: txRef.id, commissionAmount, rate, ratePercent };
  } catch (e) {
    console.error("creditCommissionStandalone error:", e);
    return null;
  }
};

// ─── addCommission (used inside existing batches) ─────────────────────────────
// NOTE: rates are passed in pre-fetched to avoid per-member Firestore reads.
// Callers that need this should call getCommissionRates() once and pass it in.
export const addCommission = async (
  batch,
  { agentId, agentName, amount, source, sourceId, memberName, memberFatherName,
    memberRegNo, programId, programName, description, createdBy, rates }
) => {
  const agentRef  = db.collection("agents").doc(agentId);
  const agentDoc  = await agentRef.get();
  if (!agentDoc.exists) return null;

  const agentData = agentDoc.data();
  if (source === "joinFees"       && agentData.commissionJoinFeesEnabled === false) return null;
  if (source === "closingPayment" && agentData.commissionClosingEnabled  === false) return null;

  const r = rates || await getCommissionRates();
  const ratePercent = source === "joinFees" ? r.joinFeesRate : r.closingPaymentRate;
  if (ratePercent <= 0) return null;

  const rate             = ratePercent / 100;
  const commissionAmount = Math.round(amount * rate * 100) / 100;
  if (commissionAmount <= 0) return null;

  const currentWallet = agentData.walletBalance || 0;

  batch.update(agentRef, {
    walletBalance:         INC(commissionAmount),
    totalCommissionEarned: INC(commissionAmount),
    updated_at:            STS(),
  });

  const txRef       = db.collection("commissionTransactions").doc();
  const sourceLabel = source === "joinFees"
    ? `Join Fees Commission (${ratePercent}%)`
    : `Closing Payment Commission (${ratePercent}%)`;

  batch.set(txRef, {
    agentId,
    agentName:        agentName || agentData.name || "",
    type:             "credit",
    amount:           commissionAmount,
    source,
    sourceId:         sourceId         || "",
    memberName:       memberName       || "",
    memberFatherName: memberFatherName || "",
    memberRegNo:      memberRegNo      || "",
    programId:        programId        || "",
    programName:      programName      || "",
    commissionRate:   rate,
    commissionRatePercent: ratePercent,
    description:      description || sourceLabel,
    balanceBefore:    currentWallet,
    balanceAfter:     currentWallet + commissionAmount,
    createdBy:        createdBy || "",
    createdAt:        STS(),
  });

  return { txId: txRef.id, commissionAmount, rate, ratePercent };
};

// ─── deductWallet ─────────────────────────────────────────────────────────────
export const deductWallet = async (batch, { agentId, amount, description, createdBy }) => {
  if (amount <= 0) return { success: false, message: "Amount must be positive" };

  const agentRef  = db.collection("agents").doc(agentId);
  const agentDoc  = await agentRef.get();
  if (!agentDoc.exists) return { success: false, message: "Agent not found" };

  const agentData     = agentDoc.data();
  const currentWallet = agentData.walletBalance || 0;
  if (currentWallet < amount)
    return { success: false, message: `Insufficient wallet balance. Available: ₹${currentWallet}` };

  batch.update(agentRef, {
    walletBalance:            INC(-amount),
    totalCommissionWithdrawn: INC(amount),
    updated_at:               STS(),
  });

  const txRef = db.collection("commissionTransactions").doc();
  batch.set(txRef, {
    agentId,
    agentName:     agentData.name || "",
    type:          "debit",
    amount,
    source:        "withdrawal",
    description:   description || "Wallet Withdrawal",
    balanceBefore: currentWallet,
    balanceAfter:  currentWallet - amount,
    createdBy:     createdBy || "",
    createdAt:     STS(),
  });

  return { success: true, txId: txRef.id, newBalance: currentWallet - amount };
};

// ─── GET — commission transaction history ─────────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const page    = parseInt(searchParams.get("page")  || "1");
    const limit   = parseInt(searchParams.get("limit") || "50");

    let q = db.collection("commissionTransactions").orderBy("createdAt", "desc");
    if (agentId) q = q.where("agentId", "==", agentId);

    const offset = (page - 1) * limit;
    const snap   = await q.limit(limit).offset(offset).get();
    const data   = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const countSnap = await (agentId
      ? db.collection("commissionTransactions").where("agentId", "==", agentId).count().get()
      : db.collection("commissionTransactions").count().get());
    const total = countSnap.data().count;

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("GET commission error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── POST — manual credit / debit / pay-agent ────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin", "admin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });

    const body     = await req.json();
    const { action } = body;

    if (action === "credit") {
      const { agentId, amount, source, sourceId, memberName, memberFatherName, memberRegNo, programId, programName, description } = body;
      if (!agentId || !amount || !source)
        return NextResponse.json({ success: false, message: "agentId, amount, source required" }, { status: 400 });

      const result = await creditCommissionStandalone({
        agentId, amount, source, sourceId, memberName, memberFatherName, memberRegNo,
        programId, programName, description, createdBy: authResult.user.uid,
      });
      if (!result)
        return NextResponse.json({ success: false, message: "Commission not applicable (disabled for agent, 0 rate, or 0 amount)" });

      return NextResponse.json({ success: true, message: `Commission ₹${result.commissionAmount} credited`, data: result });
    }

    if (action === "debit") {
      const { agentId, amount, description } = body;
      if (!agentId || !amount)
        return NextResponse.json({ success: false, message: "agentId, amount required" }, { status: 400 });

      const batch  = db.batch();
      const result = await deductWallet(batch, { agentId, amount, description: description || "Manual Withdrawal", createdBy: authResult.user.uid });
      if (!result.success) return NextResponse.json(result, { status: 400 });

      await batch.commit();
      return NextResponse.json({ success: true, message: `₹${amount} withdrawn from wallet`, data: result });
    }

    if (action === "pay-agent") {
      const { agentId, amount, description } = body;
      if (!agentId || !amount)
        return NextResponse.json({ success: false, message: "agentId, amount required" }, { status: 400 });

      const batch  = db.batch();
      const result = await deductWallet(batch, { agentId, amount, description: description || `Payment to Agent - ₹${amount}`, createdBy: authResult.user.uid });
      if (!result.success) return NextResponse.json(result, { status: 400 });

      await batch.commit();
      return NextResponse.json({ success: true, message: `₹${amount} paid to agent`, data: result });
    }

    return NextResponse.json({ success: false, message: "Invalid action. Use: credit, debit, pay-agent" }, { status: 400 });
  } catch (e) {
    console.error("POST commission error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// Keep COMMISSION_RATES export for any legacy callers (they now just get the defaults)
export const COMMISSION_RATES = { joinFees: DEFAULT_RATES.joinFeesRate / 100, closingPayment: DEFAULT_RATES.closingPaymentRate / 100 };
export { getCommissionRates };
