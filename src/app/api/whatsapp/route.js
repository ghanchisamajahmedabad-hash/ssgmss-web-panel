import { NextResponse } from 'next/server'

const GUPSHUP_URL    = 'https://api.gupshup.io/wa/api/v1/msg'
const GUPSHUP_OPT_IN = 'https://api.gupshup.io/wa/api/v1/app/opt/in'
const API_KEY        = process.env.WHATSAPP_API_KEY
const SOURCE         = process.env.SOURCE_NO_WHATSAPP   // 919227105345
const SRC_NAME       = process.env.SRC_NAME_WHATSAPP     // ssgmswhatsapp

// ── Format phone: strip spaces/dashes, ensure starts with 91 ─────────────────
function formatPhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.length === 10) return '91' + digits
  return null
}

// ── Opt-in a number so Gupshup/WhatsApp will deliver messages to it ──────────
async function optInPhone(destination) {
  try {
    const res = await fetch(`${GUPSHUP_OPT_IN}/${SRC_NAME}`, {
      method: 'POST',
      headers: {
        apikey: API_KEY,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ user: destination }).toString(),
    })
    const text = await res.text()
    console.log(`Gupshup opt-in ${destination}: ${res.status} - ${text}`)
  } catch (err) {
    console.warn(`Opt-in failed for ${destination}:`, err.message)
    // non-fatal — attempt send anyway
  }
}

// ── POST /api/whatsapp
// Body: { phone, message }   — message is plain text
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { phone, message } = await req.json()

    if (!phone || !message)
      return NextResponse.json({ success: false, message: 'phone and message are required' }, { status: 400 })

    const destination = formatPhone(phone)
    if (!destination)
      return NextResponse.json({ success: false, message: `Invalid phone number: ${phone}` }, { status: 400 })

    if (!API_KEY || !SOURCE || !SRC_NAME)
      return NextResponse.json({ success: false, message: 'WhatsApp credentials not configured' }, { status: 500 })

    // Opt-in the destination number before sending
    await optInPhone(destination)

    const payload = new URLSearchParams({
      channel:        'whatsapp',
      source:         SOURCE,
      destination,
      'src.name':     SRC_NAME,
      message:        JSON.stringify({ type: 'text', text: message }),
      disablePreview: 'false',
      encode:         'false',
    })

    const res = await fetch(GUPSHUP_URL, {
      method:  'POST',
      headers: {
        apikey:           API_KEY,
        accept:           'application/json',
        'content-type':   'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    })

    const text = await res.text()
    console.log(`Gupshup response for ${destination}: ${res.status} ${res.statusText} - ${text}`)
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!res.ok)
      return NextResponse.json({ success: false, message: 'Gupshup error', gupshup: data }, { status: res.status })

    return NextResponse.json({ success: true, message: 'WhatsApp message sent', gupshup: data })
  } catch (err) {
    console.error('❌ WhatsApp send error:', err)
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}
