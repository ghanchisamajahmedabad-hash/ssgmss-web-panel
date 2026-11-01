'use client'
// Payment certificate / WhatsApp status card for a closed member.
//
// Drawn on an A4-proportioned canvas (1240×1754 — A4 at 150 dpi), like the
// printed certificates the trust shares, and offered as:
//   • PNG — for WhatsApp status / sharing
//   • PDF — the same image on one A4 page, for printing or sending as a file
// The handover photo can be zoomed, panned (sliders or drag on the preview),
// rotated, brightened and resized.
//
// "सहेजें" keeps the card with the member:
//   Storage  members/closingCertificates/{memberId}_card.png   — finished card
//            members/closingCertificates/{memberId}_photo.jpg  — original photo
//   Firestore members/{id}.closingCertificate = { imageUrl, photoUrl, fields,
//            savedAt, savedBy } — every text field and photo edit
// Reopening restores all of it. The saved photo is read back through
// /api/closing-card/view (same-origin, Admin SDK), because a Storage URL drawn
// straight onto a canvas would need bucket CORS and would block the download.
//   • Share — the phone's share sheet (WhatsApp etc.) where the browser allows
//
// Everything is in Hindi. The figures come from the saved समापन पत्र
// (closingFormData), so the card can't disagree with the letter; every line is
// still editable here before downloading, and a handover photo can be added.
//
// The project's Noto Sans Devanagari is loaded into the canvas from the same
// font modules the PDFs use, so the Hindi renders identically on every
// computer instead of depending on what fonts Windows happens to have.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, Row, Col, Form, Input, InputNumber, Select, Upload, Button, Space, Slider, DatePicker, message, Typography,
} from 'antd'
import {
  CameraOutlined, DownloadOutlined, FilePdfOutlined, ShareAltOutlined, DeleteOutlined,
  RotateLeftOutlined, RotateRightOutlined, UndoOutlined, SaveOutlined, CheckCircleOutlined, LinkOutlined,
} from '@ant-design/icons'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
import dayjs from 'dayjs'
import { db } from '../../../../../lib/firbase-client'
import { ownClosedDay } from './ClosingHistoryDrawer'
import { useAuth } from '@/components/Base/AuthProvider'

const { Text } = Typography

const W = 1240, H = 1754
const RED = '#D3292F', NAVY = '#1B385A', GREEN = '#15803d', GOLD = '#d4a017'
const FONT = 'SSGMSHindi'

const TRUST = {
  name:   'श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट',
  place:  'अहमदाबाद, गुजरात',
  regNo:  'Reg. No: A/5231  •  SINCE : 2024',
  phones: '9374934004  •  9825289998  •  9426517804  •  9824017977',
  address: 'हेड ऑफिस : 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास, चांदखेडा, साबरमती, अहमदाबाद 382424',
}

// ── Amount in Hindi words (Indian system) ──────────────────────────────────
const UPTO_99 = ['शून्य','एक','दो','तीन','चार','पाँच','छह','सात','आठ','नौ','दस','ग्यारह','बारह','तेरह','चौदह','पंद्रह','सोलह','सत्रह','अठारह','उन्नीस','बीस','इक्कीस','बाईस','तेईस','चौबीस','पच्चीस','छब्बीस','सत्ताईस','अट्ठाईस','उनतीस','तीस','इकतीस','बत्तीस','तैंतीस','चौंतीस','पैंतीस','छत्तीस','सैंतीस','अड़तीस','उनतालीस','चालीस','इकतालीस','बयालीस','तैंतालीस','चवालीस','पैंतालीस','छियालीस','सैंतालीस','अड़तालीस','उनचास','पचास','इक्यावन','बावन','तिरेपन','चौवन','पचपन','छप्पन','सत्तावन','अट्ठावन','उनसठ','साठ','इकसठ','बासठ','तिरेसठ','चौंसठ','पैंसठ','छियासठ','सड़सठ','अड़सठ','उनहत्तर','सत्तर','इकहत्तर','बहत्तर','तिहत्तर','चौहत्तर','पचहत्तर','छिहत्तर','सतहत्तर','अठहत्तर','उनासी','अस्सी','इक्यासी','बयासी','तिरासी','चौरासी','पचासी','छियासी','सत्तासी','अट्ठासी','नवासी','नब्बे','इक्यानवे','बानवे','तिरानवे','चौरानवे','पंचानवे','छियानवे','सत्तानवे','अट्ठानवे','निन्यानवे']

export const hindiAmountWords = (num) => {
  let n = Math.floor(Math.abs(Number(num) || 0))
  if (n === 0) return 'शून्य रुपये मात्र'
  const parts = []
  const crore = Math.floor(n / 1e7); n %= 1e7
  const lakh  = Math.floor(n / 1e5); n %= 1e5
  const thou  = Math.floor(n / 1e3); n %= 1e3
  const hund  = Math.floor(n / 100); n %= 100
  if (crore) parts.push(`${crore > 99 ? hindiAmountWords(crore).replace(' रुपये मात्र', '') : UPTO_99[crore]} करोड़`)
  if (lakh)  parts.push(`${UPTO_99[lakh]} लाख`)
  if (thou)  parts.push(`${UPTO_99[thou]} हज़ार`)
  if (hund)  parts.push(`${UPTO_99[hund]} सौ`)
  if (n)     parts.push(UPTO_99[n])
  return `${parts.join(' ')} रुपये मात्र`
}

const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}/-`

const PHOTO_DEFAULTS = { pZoom: 1, pPanX: 50, pPanY: 50, pRotate: 0, pBright: 100, pContrast: 100, pHeight: 560 }

// What the closing was — decides the date label and the default wording
const closingKind = (programName = '') => {
  const p = programName.toLowerCase()
  if (/सुरक्षा|suraksha|निधन|मृत्यु/.test(p)) return 'death'
  if (/शादी|विवाह|shadi|vivah|marriage|सहयोग/.test(p)) return 'marriage'
  return 'other'
}
const EVENT_LABEL = { death: 'निधन तिथि', marriage: 'विवाह तिथि', other: 'क्लोजिंग तिथि' }

// ── Assets (loaded once per page) ─────────────────────────────────────────
let assetsPromise = null
const loadImage = (src) => new Promise((resolve) => {
  const img = new window.Image()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)       // a missing logo shouldn't block the card
  img.src = src
})
const loadAssets = () => {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const [{ default: regular }, { default: bold }] = await Promise.all([
        import('@/app/api/helper/static/font/NotoSansDevanagari'),
        import('@/app/api/helper/static/font/NotoSansDevanagariBold'),
      ])
      const faces = [
        new FontFace(FONT, `url(${regular})`, { weight: '400' }),
        new FontFace(FONT, `url(${bold})`,    { weight: '700' }),
      ]
      await Promise.all(faces.map(f => f.load().then(ff => document.fonts.add(ff)).catch(() => null)))
      const [logo, deity] = await Promise.all([loadImage('/Images/logoT.png'), loadImage('/Images/sanidevImg.jpeg')])
      return { logo, deity }
    })()
  }
  return assetsPromise
}

// ── Drawing helpers ───────────────────────────────────────────────────────
const font = (size, bold = false) => `${bold ? 700 : 400} ${size}px ${FONT}, "Nirmala UI", "Mangal", sans-serif`

const wrapLines = (ctx, text, maxW) => {
  const out = []
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w }
      else line = test
    }
    out.push(line)
  }
  return out
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const drawCircleImage = (ctx, img, cx, cy, r) => {
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
  if (img) {
    const s = Math.max((2 * r) / img.width, (2 * r) / img.height)
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s)
  }
  ctx.restore()
}

// The body below the photo, drawn from `y`. With draw=false it only measures,
// so the photo can be given whatever room is left.
const drawBody = (ctx, d, y, draw = true) => {
  const L = 72, R = W - 72, maxW = R - L

  // Title bar
  ctx.font = font(36, true)
  const titleLines = wrapLines(ctx, d.heading, maxW - 40)
  const titleH = titleLines.length * 48 + 22
  if (draw) {
    roundRect(ctx, L, y, maxW, titleH, 14)
    ctx.fillStyle = NAVY; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    titleLines.forEach((t, i) => ctx.fillText(t, W / 2, y + 10 + i * 48))
    ctx.textAlign = 'left'
  }
  y += titleH + 22

  // Details — two columns, address full width
  const LH = 42, colW = maxW / 2
  const field = (label, value, x, yy, width) => {
    ctx.font = font(27, true)
    const lw = ctx.measureText(`${label} : `).width
    ctx.font = font(27)
    const lines = wrapLines(ctx, value, width - lw)
    if (draw) {
      ctx.font = font(27, true); ctx.fillStyle = NAVY; ctx.fillText(`${label} : `, x, yy)
      ctx.font = font(27); ctx.fillStyle = '#111827'
      lines.forEach((t, i) => ctx.fillText(t, x + lw, yy + i * LH))
    }
    return lines.length
  }
  const pairs = [
    [['नाम', d.fullName],              ['दिनांक', d.dateText]],
    [d.father ? ['पिता / पति', d.father] : null, d.regNo ? ['पंजीकरण क्रमांक', d.regNo] : null],
    [d.samaj ? ['समाज', d.samaj] : null,         d.eventDate ? [d.eventLabel, d.eventDate] : null],
  ]
  for (const [a, b] of pairs) {
    if (!a && !b) continue
    const n1 = a ? field(a[0], a[1], L, y, colW - 16) : 0
    const n2 = b ? field(b[0], b[1], L + colW + 16, y, colW - 16) : 0
    y += Math.max(n1, n2, 1) * LH
  }
  if (d.address) y += field('पता', d.address, L, y, maxW) * LH
  y += 14

  // Paragraph
  ctx.font = font(27)
  const pLines = wrapLines(ctx, d.paragraph, maxW)
  if (draw) { ctx.fillStyle = '#1f2937'; pLines.forEach((t, i) => ctx.fillText(t, L, y + i * 41)) }
  y += pLines.length * 41 + 20

  // Amount box
  ctx.font = font(26, true)
  const wordsLines = wrapLines(ctx, `(${d.amountWords})`, maxW - 60)
  ctx.font = font(25)
  const modeLines  = d.modeLine ? wrapLines(ctx, d.modeLine, maxW - 60) : []
  const boxH = 20 + 60 + wordsLines.length * 38 + modeLines.length * 36 + 18
  if (draw) {
    roundRect(ctx, L, y, maxW, boxH, 18)
    ctx.fillStyle = '#ecfdf5'; ctx.fill()
    ctx.lineWidth = 4; ctx.strokeStyle = GREEN; ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = font(48, true); ctx.fillStyle = GREEN
    ctx.fillText(`सहायता राशि : ${rs(d.amount)}`, W / 2, y + 18)
    ctx.font = font(26, true); ctx.fillStyle = '#065f46'
    wordsLines.forEach((t, i) => ctx.fillText(t, W / 2, y + 84 + i * 38))
    ctx.font = font(25); ctx.fillStyle = '#374151'
    modeLines.forEach((t, i) => ctx.fillText(t, W / 2, y + 84 + wordsLines.length * 38 + i * 36))
    ctx.textAlign = 'left'
  }
  return y + boxH
}

// Photo with the user's edits: zoom, pan (x/y %), rotation, brightness.
// Always covers its frame — zooming in only ever crops, never letterboxes.
const drawPhoto = (ctx, img, x, y, w, h, e = {}) => {
  const rot = ((e.rotate || 0) % 360 + 360) % 360
  const sideways = rot === 90 || rot === 270
  const iw = sideways ? img.height : img.width
  const ih = sideways ? img.width : img.height
  const scale = Math.max(w / iw, h / ih) * (e.zoom || 1)
  const dw = iw * scale, dh = ih * scale
  // Centre of the drawn image; pan moves it across the overflow only
  const cx = x + w / 2 + (dw - w) * (0.5 - (e.panX ?? 50) / 100)
  const cy = y + h / 2 + (dh - h) * (0.5 - (e.panY ?? 50) / 100)
  ctx.save()
  roundRect(ctx, x, y, w, h, 22); ctx.clip()
  ctx.filter = `brightness(${(e.brightness ?? 100) / 100}) contrast(${(e.contrast ?? 100) / 100})`
  ctx.translate(cx, cy)
  ctx.rotate((rot * Math.PI) / 180)
  const rw = sideways ? dh : dw, rh = sideways ? dw : dh
  ctx.drawImage(img, -rw / 2, -rh / 2, rw, rh)
  ctx.restore()
  ctx.filter = 'none'
  roundRect(ctx, x, y, w, h, 22)
  ctx.lineWidth = 6; ctx.strokeStyle = GOLD; ctx.stroke()
}

export const drawStatusCard = (canvas, d, assets, photo) => {
  const ctx = canvas.getContext('2d')
  canvas.width = W; canvas.height = H
  ctx.textBaseline = 'top'

  // Background + frame
  ctx.fillStyle = '#fffaf3'; ctx.fillRect(0, 0, W, H)
  ctx.lineWidth = 10; ctx.strokeStyle = GOLD; ctx.strokeRect(14, 14, W - 28, H - 28)

  // ── Letterhead ─────────────────────────────────────────────────────────
  const HX = 24, HW = W - 48
  const hg = ctx.createLinearGradient(0, 24, 0, 340)
  hg.addColorStop(0, '#fffdf7'); hg.addColorStop(1, '#fff3dc')
  ctx.fillStyle = hg; ctx.fillRect(HX, 24, HW, 316)

  const sg = ctx.createLinearGradient(0, 0, W, 0)
  sg.addColorStop(0, '#f59e0b'); sg.addColorStop(0.5, '#ea580c'); sg.addColorStop(1, '#f59e0b')
  ctx.fillStyle = sg; ctx.fillRect(HX, 24, HW, 46)
  ctx.fillStyle = '#fff'; ctx.font = font(22, true); ctx.textBaseline = 'middle'
  ctx.textAlign = 'left';   ctx.fillText('॥ श्री गणेशाय नमः ॥', 54, 48)
  ctx.textAlign = 'center'; ctx.fillText('॥ श्री शनिदेवाय नमः ॥', W / 2, 48)
  ctx.textAlign = 'right';  ctx.fillText('॥ श्री सांवलाजी महाराज नमः ॥', W - 54, 48)
  ctx.textBaseline = 'top'

  const ring = (cx, cy, r, img) => {
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, Math.PI * 2)
    const rg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    rg.addColorStop(0, '#f6d365'); rg.addColorStop(1, '#b8860b')
    ctx.fillStyle = rg; ctx.fill()
    ctx.restore()
    drawCircleImage(ctx, img, cx, cy, r)
  }
  ring(140, 168, 74, assets.logo)
  ring(W - 140, 168, 74, assets.deity)

  ctx.textAlign = 'center'; ctx.fillStyle = '#8b1a1a'
  ctx.font = font(50, true)
  ctx.fillText('श्री क्षत्रिय घांची मोदी समाज', W / 2, 84)
  ctx.fillText('सेवा संस्थान ट्रस्ट', W / 2, 144)
  ctx.font = font(29, true); ctx.fillStyle = NAVY
  const placeW = ctx.measureText(TRUST.place).width
  ctx.fillText(TRUST.place, W / 2, 208)
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(W / 2 - placeW / 2 - 90, 229); ctx.lineTo(W / 2 - placeW / 2 - 18, 229); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(W / 2 + placeW / 2 + 18, 229); ctx.lineTo(W / 2 + placeW / 2 + 90, 229); ctx.stroke()

  ctx.fillStyle = '#4b5563'
  let addrSize = 22
  ctx.font = font(addrSize)
  while (ctx.measureText(TRUST.address).width > HW - 60 && addrSize > 16) ctx.font = font(--addrSize)
  ctx.fillText(TRUST.address, W / 2, 262)

  ctx.font = font(22, true); ctx.fillStyle = NAVY
  ctx.textAlign = 'left';  ctx.fillText('SINCE : 2024', 56, 300)
  ctx.textAlign = 'right'; ctx.fillText('Reg. No : A/5231', W - 56, 300)
  ctx.textAlign = 'center'; ctx.fillStyle = '#8b1a1a'
  ctx.fillText('सेवा  •  समर्पण  •  समाज', W / 2, 300)

  ctx.fillStyle = GOLD; ctx.fillRect(HX, 340, HW, 5)
  ctx.fillStyle = NAVY; ctx.fillRect(HX, 345, HW, 52)
  ctx.fillStyle = '#fff'; ctx.font = font(25, true); ctx.textBaseline = 'middle'
  ctx.fillText(`संपर्क : ${TRUST.phones}`, W / 2, 371)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  // ── Photo + body ───────────────────────────────────────────────────────
  const footerTop = H - 240
  let y = 424
  const bodyH = drawBody(ctx, d, 0, false)
  const room  = footerTop - 26 - y - bodyH - 26        // what's left for the photo
  const wanted = d.photo?.height ?? 560                 // user's size choice
  let photoH = 0
  if (photo) photoH = Math.max(0, Math.min(wanted, room))
  const photoShown = !!photo && photoH >= 220
  if (photoShown) {
    drawPhoto(ctx, photo, 60, y, W - 120, photoH, d.photo)
    y += photoH + 26
  } else {
    y += Math.max(0, (footerTop - 26 - y - bodyH) / 2)
  }
  drawBody(ctx, d, y, true)

  // ── Footer: signatures ─────────────────────────────────────────────────
  const LX = 300, RX = W - 300
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(LX - 200, footerTop + 40); ctx.lineTo(LX + 200, footerTop + 40); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(RX - 200, footerTop + 40); ctx.lineTo(RX + 200, footerTop + 40); ctx.stroke()
  ctx.textAlign = 'center'; ctx.fillStyle = '#111827'
  ctx.font = font(26, true); ctx.fillText(d.agentLabel || 'स्वयंसेवक', LX, footerTop + 50)
  ctx.font = font(25)
  if (d.agentName)  ctx.fillText(d.agentName, LX, footerTop + 86)
  if (d.agentPhone) ctx.fillText(d.agentPhone, LX, footerTop + 120)
  ctx.font = font(26, true); ctx.fillText('अधिकृत हस्ताक्षर', RX, footerTop + 50)
  ctx.font = font(22)
  wrapLines(ctx, TRUST.name, 420).forEach((t, i) => ctx.fillText(t, RX, footerTop + 88 + i * 32))

  ctx.fillStyle = NAVY; ctx.fillRect(24, H - 72, W - 48, 48)
  ctx.fillStyle = '#fff'; ctx.font = font(24, true); ctx.textBaseline = 'middle'
  ctx.fillText('श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट, अहमदाबाद', W / 2, H - 48)
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'

  return {
    photoDropped: !!photo && !photoShown,
    photoShrunk:  photoShown && photoH < wanted,
  }
}

// ── Saving helpers ─────────────────────────────────────────────────────────
// Phone photos are often 4000px / 5 MB; the card never needs more than ~1800px.
const shrinkPhoto = (img, max = 1800) => new Promise((resolve) => {
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  c.toBlob(resolve, 'image/jpeg', 0.88)
})

const authHeader = async () => {
  const token = await getAuth().currentUser?.getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Load a saved Storage file as a same-origin image (see header note)
const loadSavedImage = async (fileUrl) => {
  const res = await fetch(`/api/closing-card/view?fileUrl=${encodeURIComponent(fileUrl)}`, { headers: await authHeader() })
  if (!res.ok) throw new Error(`photo ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  return loadImage(url)
}

// Form values → plain JSON for Firestore (dayjs → ISO)
const serialiseFields = (v) => {
  const out = {}
  for (const [k, val] of Object.entries(v || {})) {
    if (val === undefined) continue
    out[k] = dayjs.isDayjs(val) ? val.toISOString() : val
  }
  return out
}

// ── Modal ─────────────────────────────────────────────────────────────────
const ClosingStatusCard = ({ open, onClose, member, settlement, programName = '', onSaved }) => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const canvasRef = useRef(null)
  const [assets, setAssets] = useState(null)
  const [photo, setPhoto] = useState(null)        // HTMLImageElement
  const [busy, setBusy] = useState(null)          // 'png' | 'pdf' | 'share'
  const [photoDropped, setPhotoDropped] = useState(false)
  const [photoShrunk, setPhotoShrunk] = useState(false)
  const dragRef = useRef(null)
  // Saved copy on the member, and whether the photo changed since
  const [saved, setSaved] = useState(null)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const values = Form.useWatch([], form) || {}

  const kind = closingKind(programName || member?.programName)

  // Seed once per open
  useEffect(() => {
    if (!open || !member) return
    let cancelled = false
    loadAssets().then(a => { if (!cancelled) setAssets(a) })

    const s = settlement || {}
    const closedOn = ownClosedDay(member)
    const name = member.displayName || member.name || ''
    const honorific = kind === 'death' ? 'स्व.' : 'श्री'
    const count = Number(s.membersCount || 0)
    const contributed = Number(s.memberContributed || 0)
    const recipient = kind === 'death' ? 'नामांकित वारिस / नॉमिनी को' : 'सदस्य को'

    form.setFieldsValue({
      heading:   `${programName || member.programName || 'योजना'} — सहायता राशि भुगतान प्रमाणपत्र`,
      honorific,
      name,
      father:    member.fatherName || '',
      samaj:     'घांची',
      address:   [member.village, member.city || member.district, member.state].filter(Boolean).join(', '),
      regNo:     [member.registrationNumber, member.legacyApplicationNo].filter(Boolean).join(' / '),
      eventLabel: EVENT_LABEL[kind],
      eventDate:  closedOn ? closedOn.format('DD-MM-YYYY') : '',
      date:       s.paymentDate ? dayjs(s.paymentDate) : dayjs(),
      paragraph:
        `${honorific} ${name} ने सदस्यता तिथि से आज तक ट्रस्ट के ${count} सदस्यों की सेवा एवं सहायता में ` +
        `कुल ₹${contributed.toLocaleString('en-IN')} का सहयोग किया है।\n` +
        `योजना के नियमानुसार ट्रस्ट द्वारा निर्धारित सहायता राशि ${recipient} सम्मान सहित प्रदान की गई।`,
      amount:     Number(s.amountGiven || 0),
      mode:       s.paymentMode || 'नकद',
      agentLabel: 'स्वयंसेवक / एजेंट',
      agentName:  '',
      agentPhone: '',
      ...PHOTO_DEFAULTS,
    })
    setPhoto(null); setPhotoChanged(false); setSaved(null)

    // A saved card wins over the defaults above: restore its fields and photo.
    // Otherwise fill the left signature with the member's agent.
    setRestoring(true)
    getDoc(doc(db, 'members', member.id))
      .then(async (snap) => {
        if (cancelled) return
        const cert = snap.data()?.closingCertificate
        if (cert?.fields) {
          setSaved(cert)
          const f = { ...cert.fields }
          if (f.date) f.date = dayjs(f.date)
          form.setFieldsValue({ ...PHOTO_DEFAULTS, ...f })
          if (cert.photoUrl) {
            try {
              const img = await loadSavedImage(cert.photoUrl)
              if (!cancelled && img) setPhoto(img)
            } catch (e) {
              console.warn('[status card] saved photo', e)
              if (!cancelled) message.warning('सहेजी गई फोटो नहीं खुल सकी — दोबारा अपलोड करें')
            }
          }
          return
        }
        if (member.agentId) {
          const a = await getDoc(doc(db, 'agents', member.agentId))
          if (!cancelled && a.exists()) {
            const d = a.data()
            form.setFieldsValue({ agentName: d.name || d.displayName || '', agentPhone: d.phone1 || d.phone || '' })
          }
        }
      })
      .catch((e) => console.warn('[status card] restore', e))
      .finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id])

  const cardData = useMemo(() => {
    const v = values
    return {
      heading:    v.heading || '',
      fullName:   [v.honorific, v.name].filter(Boolean).join(' '),
      father:     v.father,
      samaj:      v.samaj,
      address:    v.address,
      regNo:      v.regNo,
      eventLabel: v.eventLabel,
      eventDate:  v.eventDate,
      dateText:   v.date ? dayjs(v.date).format('DD-MM-YYYY') : '',
      paragraph:  v.paragraph || '',
      amount:     v.amount || 0,
      amountWords: hindiAmountWords(v.amount || 0),
      modeLine:   v.mode ? `(${v.mode} द्वारा) सहायता राशि सम्मान सहित प्रदान की गई।` : '',
      agentLabel: v.agentLabel,
      agentName:  v.agentName,
      agentPhone: v.agentPhone,
      photo: {
        zoom:       v.pZoom ?? 1,
        panX:       v.pPanX ?? 50,
        panY:       v.pPanY ?? 50,
        rotate:     v.pRotate ?? 0,
        brightness: v.pBright ?? 100,
        contrast:   v.pContrast ?? 100,
        height:     v.pHeight ?? 560,
      },
    }
  }, [values])

  // Redraw the preview whenever anything changes
  useEffect(() => {
    if (!open || !assets || !canvasRef.current) return
    const id = requestAnimationFrame(() => {
      const r = drawStatusCard(canvasRef.current, cardData, assets, photo)
      setPhotoDropped(!!r?.photoDropped)
      setPhotoShrunk(!!r?.photoShrunk)
    })
    return () => cancelAnimationFrame(id)
  }, [open, assets, cardData, photo])

  const onPhoto = (file) => {
    if (!file.type?.startsWith('image/')) { message.error('केवल फोटो चुनें'); return Upload.LIST_IGNORE }
    const reader = new FileReader()
    reader.onload = async () => {
      const img = await loadImage(reader.result)
      if (img) { setPhoto(img); setPhotoChanged(true); form.setFieldsValue(PHOTO_DEFAULTS) } else message.error('फोटो नहीं खुल सका')
    }
    reader.readAsDataURL(file)
    return false   // never upload anywhere — the photo only goes into the card
  }

  // Drag on the preview to pan the photo. Movement is converted to the same
  // 0–100 pan scale the sliders use (roughly 1% per 8 canvas pixels).
  const onDragStart = (e) => {
    if (!photo) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, panX: values.pPanX ?? 50, panY: values.pPanY ?? 50 }
  }
  const onDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const k = W / e.currentTarget.getBoundingClientRect().width / 8
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)))
    form.setFieldsValue({
      pPanX: clamp(d.panX - (e.clientX - d.x) * k),
      pPanY: clamp(d.panY - (e.clientY - d.y) * k),
    })
  }
  const onDragEnd = () => { dragRef.current = null }

  // ── Save card + photo + details with the member ────────────────────────
  const saveCard = async () => {
    if (!member?.id || !canvasRef.current) return
    setBusy('save')
    try {
      const storage = getStorage()
      const folder = 'members/closingCertificates'

      // Finished card
      const cardRef = storageRef(storage, `${folder}/${member.id}_card.png`)
      await uploadBytes(cardRef, await toBlob(), { contentType: 'image/png' })
      const imageUrl = await getDownloadURL(cardRef)

      // Original photo — only re-uploaded when a new one was chosen
      let photoUrl = saved?.photoUrl || null
      if (!photo) photoUrl = null
      else if (photoChanged || !photoUrl) {
        const pRef = storageRef(storage, `${folder}/${member.id}_photo.jpg`)
        await uploadBytes(pRef, await shrinkPhoto(photo), { contentType: 'image/jpeg' })
        photoUrl = await getDownloadURL(pRef)
      }

      const cert = {
        imageUrl,
        photoUrl,
        fields:  serialiseFields(form.getFieldsValue(true)),
        savedAt: new Date().toISOString(),
        savedBy: user?.displayName || user?.name || user?.email || 'Admin',
      }
      await updateDoc(doc(db, 'members', member.id), {
        closingCertificate:   cert,
        closingCertificateAt: serverTimestamp(),
        updated_at:           serverTimestamp(),
      })
      setSaved(cert); setPhotoChanged(false)
      onSaved?.(member.id, cert)
      message.success('प्रमाणपत्र सहेजा गया — इमेज, फोटो और सभी विवरण सदस्य के साथ रखे गए')
    } catch (e) {
      console.error('[status card] save', e)
      message.error('सहेजा नहीं जा सका: ' + e.message)
    } finally {
      setBusy(null)
    }
  }

  const baseName = `${member?.registrationNumber || 'member'}_sahayata_${dayjs().format('YYYY-MM-DD')}`

  const toBlob = () => new Promise(res => canvasRef.current.toBlob(res, 'image/png'))

  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const downloadPng = async () => {
    setBusy('png')
    try { saveBlob(await toBlob(), `${baseName}.png`) }
    finally { setBusy(null) }
  }

  const downloadPdf = async () => {
    setBusy('pdf')
    try {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.92)
      const { pdf, Document, Page, Image } = await import('@react-pdf/renderer')
      // One A4 page, image edge to edge (the canvas is already A4-shaped)
      const blob = await pdf(
        <Document>
          <Page size="A4" style={{ padding: 0 }}>
            <Image src={dataUrl} style={{ width: 595.28, height: 841.89 }} />
          </Page>
        </Document>
      ).toBlob()
      saveBlob(blob, `${baseName}.pdf`)
    } catch (e) {
      console.error(e); message.error('PDF नहीं बना: ' + e.message)
    } finally { setBusy(null) }
  }

  const share = async () => {
    setBusy('share')
    try {
      const file = new File([await toBlob()], `${baseName}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: cardData.heading })
      } else {
        message.info('इस ब्राउज़र से सीधा शेयर नहीं हो सकता — इमेज डाउनलोड करके WhatsApp पर लगाएं')
      }
    } catch (e) {
      if (e?.name !== 'AbortError') message.error('शेयर नहीं हो सका: ' + e.message)
    } finally { setBusy(null) }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="सहायता राशि प्रमाणपत्र — WhatsApp स्टेटस"
      width={1100}
      footer={
        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} loading={busy === 'save'} disabled={restoring}
            onClick={saveCard} style={{ background: NAVY, borderColor: NAVY }}>
            {saved ? 'बदलाव सहेजें' : 'सहेजें'}
          </Button>
          <Button icon={<ShareAltOutlined />} loading={busy === 'share'} onClick={share}>शेयर</Button>
          <Button icon={<FilePdfOutlined />} loading={busy === 'pdf'} onClick={downloadPdf}
            style={{ borderColor: RED, color: RED }}>PDF डाउनलोड</Button>
          <Button type="primary" icon={<DownloadOutlined />} loading={busy === 'png'} onClick={downloadPng}
            style={{ background: GREEN, borderColor: GREEN }}>इमेज डाउनलोड (स्टेटस)</Button>
        </Space>
      }
      destroyOnHidden
    >
      {saved && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 12px',
                      marginBottom: 12, fontSize: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <CheckCircleOutlined style={{ color: GREEN }} />
          <span>
            सहेजा गया : <b>{dayjs(saved.savedAt).format('DD-MM-YYYY hh:mm A')}</b>
            {saved.savedBy ? ` · ${saved.savedBy}` : ''}
          </span>
          {saved.imageUrl && (
            <a href={saved.imageUrl} target="_blank" rel="noreferrer"><LinkOutlined /> सहेजी इमेज खोलें</a>
          )}
        </div>
      )}
      {restoring && <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>सहेजा हुआ प्रमाणपत्र लोड हो रहा है…</Text>}
      <Row gutter={20}>
        <Col xs={24} md={14}>
          <Form form={form} layout="vertical" size="small">
            <Form.Item label="फोटो (भुगतान करते हुए)">
              <Space wrap>
                <Upload accept="image/*" showUploadList={false} beforeUpload={onPhoto}>
                  <Button icon={<CameraOutlined />}>{photo ? 'फोटो बदलें' : 'फोटो अपलोड करें'}</Button>
                </Upload>
                {photo && <Button danger icon={<DeleteOutlined />} onClick={() => { setPhoto(null); setPhotoChanged(true) }}>हटाएं</Button>}
              </Space>
            </Form.Item>
            {photo && (
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 12 }}>फोटो एडिट</Text>
                  <Space size={4}>
                    <Button size="small" icon={<RotateLeftOutlined />} title="बाएँ घुमाएँ"
                      onClick={() => form.setFieldsValue({ pRotate: ((values.pRotate || 0) + 270) % 360 })} />
                    <Button size="small" icon={<RotateRightOutlined />} title="दाएँ घुमाएँ"
                      onClick={() => form.setFieldsValue({ pRotate: ((values.pRotate || 0) + 90) % 360 })} />
                    <Button size="small" icon={<UndoOutlined />} onClick={() => form.setFieldsValue(PHOTO_DEFAULTS)}>
                      रीसेट
                    </Button>
                  </Space>
                </div>
                <Text type="secondary" style={{ fontSize: 10 }}>प्रीव्यू पर फोटो को माउस से खींचकर भी खिसका सकते हैं</Text>
                <Row gutter={12}>
                  <Col span={12}><Form.Item name="pZoom" label="ज़ूम" style={{ marginBottom: 0 }}>
                    <Slider min={1} max={3} step={0.05} tooltip={{ formatter: v => `${v}×` }} /></Form.Item></Col>
                  <Col span={12}><Form.Item name="pHeight" label="फोटो का आकार (ऊँचाई)" style={{ marginBottom: 0 }}>
                    <Slider min={260} max={760} step={10} /></Form.Item></Col>
                  <Col span={12}><Form.Item name="pPanX" label="बाएँ ↔ दाएँ" style={{ marginBottom: 0 }}>
                    <Slider min={0} max={100} /></Form.Item></Col>
                  <Col span={12}><Form.Item name="pPanY" label="ऊपर ↕ नीचे" style={{ marginBottom: 0 }}>
                    <Slider min={0} max={100} /></Form.Item></Col>
                  <Col span={12}><Form.Item name="pBright" label="ब्राइटनेस" style={{ marginBottom: 0 }}>
                    <Slider min={50} max={160} tooltip={{ formatter: v => `${v}%` }} /></Form.Item></Col>
                  <Col span={12}><Form.Item name="pContrast" label="कंट्रास्ट" style={{ marginBottom: 0 }}>
                    <Slider min={50} max={160} tooltip={{ formatter: v => `${v}%` }} /></Form.Item></Col>
                </Row>
                <Form.Item name="pRotate" hidden><InputNumber /></Form.Item>
              </div>
            )}
            <Form.Item name="heading" label="शीर्षक"><Input /></Form.Item>
            <Row gutter={8}>
              <Col span={6}>
                <Form.Item name="honorific" label="संबोधन">
                  <Select options={['श्री', 'श्रीमती', 'सुश्री', 'स्व.', 'कुमारी', ''].map(v => ({ value: v, label: v || '(कोई नहीं)' }))} />
                </Form.Item>
              </Col>
              <Col span={18}><Form.Item name="name" label="नाम"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="father" label="पिता / पति"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="samaj" label="समाज"><Input /></Form.Item></Col>
              <Col span={24}><Form.Item name="address" label="पता"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="regNo" label="पंजीकरण क्रमांक"><Input /></Form.Item></Col>
              <Col span={6}>
                <Form.Item name="eventLabel" label="तिथि का नाम">
                  <Select options={['विवाह तिथि', 'निधन तिथि', 'क्लोजिंग तिथि'].map(v => ({ value: v, label: v }))} />
                </Form.Item>
              </Col>
              <Col span={6}><Form.Item name="eventDate" label="तिथि"><Input placeholder="DD-MM-YYYY" /></Form.Item></Col>
            </Row>
            <Form.Item name="paragraph" label="संदेश"><Input.TextArea rows={4} maxLength={450} showCount /></Form.Item>
            <Row gutter={8}>
              <Col span={9}>
                <Form.Item name="amount" label="सहायता राशि">
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹" />
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item name="mode" label="माध्यम">
                  <Select options={['चेक', 'नकद', 'ऑनलाइन'].map(v => ({ value: v, label: v }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="date" label="दिनांक">
                  <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
                </Form.Item>
              </Col>
            </Row>
            <Text style={{ fontSize: 11, color: GREEN, display: 'block', marginTop: -6, marginBottom: 8 }}>
              ({hindiAmountWords(values.amount || 0)})
            </Text>
            <Row gutter={8}>
              <Col span={8}><Form.Item name="agentLabel" label="बाएँ हस्ताक्षर"><Input /></Form.Item></Col>
              <Col span={9}><Form.Item name="agentName" label="नाम"><Input /></Form.Item></Col>
              <Col span={7}><Form.Item name="agentPhone" label="मोबाइल"><Input /></Form.Item></Col>
            </Row>
          </Form>
        </Col>
        <Col xs={24} md={10}>
          <div style={{ position: 'sticky', top: 0 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>पूर्वावलोकन — A4</Text>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerLeave={onDragEnd}
              style={{
                width: '100%', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', background: '#fff',
                cursor: photo ? 'grab' : 'default', touchAction: photo ? 'none' : 'auto',
              }}
            />
            {!assets && <Text type="secondary" style={{ fontSize: 11 }}>फॉन्ट लोड हो रहा है…</Text>}
            {photoDropped && (
              <Text type="warning" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                संदेश लंबा होने से फोटो के लिए जगह नहीं बची — संदेश छोटा करें तो फोटो दिखेगी।
              </Text>
            )}
            {!photoDropped && photoShrunk && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                फोटो जितनी जगह बची उतनी ही बड़ी दिख रही है — और बड़ी करने के लिए संदेश छोटा करें।
              </Text>
            )}
          </div>
        </Col>
      </Row>
    </Modal>
  )
}

export default ClosingStatusCard
