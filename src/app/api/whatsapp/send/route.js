import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();

// ── Gupshup credentials ───────────────────────────────────────────────────────
const GUPSHUP_URL     = 'https://api.gupshup.io/wa/api/v1/msg'
const GUPSHUP_OPT_IN  = 'https://api.gupshup.io/wa/api/v1/app/opt/in'
const GUPSHUP_API_KEY = process.env.WHATSAPP_API_KEY
const GUPSHUP_SOURCE  = process.env.SOURCE_NO_WHATSAPP
const GUPSHUP_SRC_NAME = process.env.SRC_NAME_WHATSAPP

function formatPhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.length === 10) return '91' + digits
  return null
}

async function optInPhone(destination) {
  try {
    const res = await fetch(`${GUPSHUP_OPT_IN}/${GUPSHUP_SRC_NAME}`, {
      method: 'POST',
      headers: {
        apikey: GUPSHUP_API_KEY,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ user: destination }).toString(),
    })
    const text = await res.text()
    console.log(`Gupshup opt-in ${destination}: ${res.status} - ${text}`)
  } catch (err) {
    console.warn(`Opt-in failed for ${destination}:`, err.message)
  }
}

async function sendGupshupMessage(phone, text) {
  const destination = formatPhone(phone)
  if (!destination) return { ok: false, reason: 'Invalid phone number' }
  if (!GUPSHUP_API_KEY || !GUPSHUP_SOURCE || !GUPSHUP_SRC_NAME)
    return { ok: false, reason: 'WhatsApp credentials not configured' }

  const payload = new URLSearchParams({
    channel:        'whatsapp',
    source:         GUPSHUP_SOURCE,
    destination,
    'src.name':     GUPSHUP_SRC_NAME,
    message:        JSON.stringify({ type: 'text', text }),
    disablePreview: 'false',
    encode:         'false',
  })

  try {
    const res = await fetch(GUPSHUP_URL, {
      method: 'POST',
      headers: {
        apikey:         GUPSHUP_API_KEY,
        accept:         'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    })
    console.log(`Gupshup response for ${destination}: ${res.status} ${res.statusText}`)
    const responseText = await res.text()
    if (!res.ok) return { ok: false, reason: `Gupshup error ${res.status}: ${responseText}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

// ── Message template builder ──────────────────────────────────────────────────
function buildMessage(member, template) {
  return template
    .replace(/{name}/g, member.displayName || '')
    .replace(/{fatherName}/g, member.fatherName || '')
    .replace(/{regNo}/g, member.registrationNumber || '')
    .replace(/{amount}/g, (member.closing_pendingAmount || 0).toLocaleString('en-IN'))
    .replace(/{pendingCount}/g, String(member.pendingClosingCount || 0))
    .replace(/{program}/g, member.programName || '');
}

const DEFAULT_TEMPLATE = `नमस्ते {name} जी,

आपके {program} कार्यक्रम में {pendingCount} किस्तें बकाया हैं। कुल ₹{amount} का भुगतान शेष है।

कृपया जल्द से जल्द भुगतान करें।

धन्यवाद,
SSGMSSS`;

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { memberIds, template, testMode } = await req.json();
    const messageTemplate = template || DEFAULT_TEMPLATE;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ success: false, message: 'No members selected' }, { status: 400 });
    }

    // ── Fetch members from Firestore (max 30 per in-query) ─────────────────
    const CHUNK = 30;
    const members = [];
    for (let i = 0; i < memberIds.length; i += CHUNK) {
      const chunk = memberIds.slice(i, i + CHUNK);
      const snap = await db.collection('members')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach(d => {
        const m = d.data();
        members.push({
          id: d.id,
          displayName: m.displayName || '',
          fatherName: m.fatherName || '',
          phone: m.phone || '',
          registrationNumber: m.registrationNumber || '',
          programName: m.programName || '',
          closing_pendingAmount: m.closing_pendingAmount || 0,
          pendingClosingCount: m.pendingClosingCount || 0,
        });
      });
    }

    if (members.length === 0) {
      return NextResponse.json({ success: false, message: 'No members found' }, { status: 404 });
    }

    // ── Preview mode: build messages without sending ────────────────────────
    if (testMode) {
      const results = members.map(member => {
        const hasPhone = !!member.phone
        const builtMessage = buildMessage(member, messageTemplate)
        return {
          memberId: member.id,
          memberName: member.displayName,
          phone: member.phone,
          message: builtMessage,
          status: hasPhone ? 'sent' : 'skipped',
          reason: hasPhone ? undefined : 'No phone number',
        }
      })
      return NextResponse.json({
        success: true,
        message: `Preview ready: ${members.length} members`,
        total: members.length,
        sent: results.filter(r => r.status === 'sent').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        results,
      })
    }

    // ── Real send: call Gupshup for each member with a phone ───────────────
    const results = []
    for (const member of members) {
      if (!member.phone) {
        results.push({
          memberId: member.id,
          memberName: member.displayName,
          phone: '',
          status: 'skipped',
          reason: 'No phone number',
        })
        continue
      }

      const text = buildMessage(member, messageTemplate)
      // Opt-in the number before sending so Gupshup delivers it
      const destination = formatPhone(member.phone)
      if (destination) await optInPhone(destination)
      const { ok, reason } = await sendGupshupMessage(member.phone, text)

      console.log(`[WhatsApp] ${ok ? '✅' : '❌'} ${member.displayName} (${member.phone})${reason ? ' — ' + reason : ''}`)

      results.push({
        memberId: member.id,
        memberName: member.displayName,
        phone: member.phone,
        status: ok ? 'sent' : 'failed',
        reason: ok ? undefined : reason,
      })
    }

    const sent    = results.filter(r => r.status === 'sent').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const failed  = results.filter(r => r.status === 'failed').length

    // ── Log to Firestore ─────────────────────────────────────────────────────
    await db.collection('whatsappLogs').add({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentBy: authResult.user.uid,
      totalMembers: members.length,
      sent,
      skipped,
      failed,
      memberIds,
      template: messageTemplate,
    });

    return NextResponse.json({
      success: true,
      message: `Messages processed: ${sent} sent, ${skipped} skipped (no phone)${failed > 0 ? `, ${failed} failed` : ''}`,
      total: members.length,
      sent,
      skipped,
      failed,
    });

  } catch (error) {
    console.error("WhatsApp send error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
