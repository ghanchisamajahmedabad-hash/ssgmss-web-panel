// ─────────────────────────────────────────────────────────────────────────────
// Duplicate check for a member request, run before it is approved.
//
// A request is a members doc (status 'pending_approval'). This looks for OTHER
// members docs (active, closed, pending or rejected — anything not deleted)
// that are very likely the same person:
//
//   strong  (red, approval asks for confirmation)
//     • same Aadhaar number
//     • same phone  + same name
//     • same name   + same father's name
//
//   weak    (shown for information only)
//     • same phone, different name — usually a family member
//
// Only single-field equality queries are used, so no new Firestore index is
// needed.
// ─────────────────────────────────────────────────────────────────────────────
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'

// Lower-case, drop spaces / dots / dashes so "Ram Lal" == "ramlal" == "RAM-LAL"
const norm = (v) => String(v || '').toLowerCase().replace(/[\s.\-_/]+/g, '').trim()
const digits = (v) => String(v || '').replace(/\D/g, '')

const statusLabel = (m) => {
  if (m.member_closed) return 'Closed'
  if (m.status === 'pending_approval') return 'Pending request'
  if (m.status === 'rejected') return 'Rejected'
  if (m.active_flag === false) return 'Inactive'
  return 'Active'
}

export const findDuplicateMembers = async (req) => {
  if (!req?.id) return { strong: [], weak: [] }

  const aadhaar = digits(req.aadhaarNo)
  const phones = [...new Set([req.phone, req.phoneAlt].map(p => String(p || '').trim()).filter(p => digits(p).length >= 10))]
  const name = String(req.displayName || '').trim()

  const queries = []
  if (aadhaar.length >= 12) {
    // Stored both with and without spaces in older data
    const spaced = aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ')
    ;[...new Set([aadhaar, spaced, String(req.aadhaarNo).trim()])].forEach(v =>
      queries.push(query(collection(db, 'members'), where('aadhaarNo', '==', v))))
  }
  phones.forEach(p => {
    queries.push(query(collection(db, 'members'), where('phone', '==', p)))
    queries.push(query(collection(db, 'members'), where('phoneAlt', '==', p)))
  })
  if (name) queries.push(query(collection(db, 'members'), where('displayName', '==', name)))

  const snaps = await Promise.all(queries.map(q => getDocs(q).catch(() => null)))
  const found = {}
  snaps.forEach(s => s?.docs.forEach(d => {
    if (d.id !== req.id) found[d.id] = { id: d.id, ...d.data() }
  }))

  const reqName = norm(req.displayName)
  const reqFather = norm(req.fatherName)
  const reqPhones = new Set(phones.map(digits))

  const strong = []
  const weak = []
  Object.values(found).forEach(m => {
    if (m.delete_flag === true) return

    const reasons = []
    const sameAadhaar = aadhaar.length >= 12 && digits(m.aadhaarNo) === aadhaar
    const sameName = !!reqName && norm(m.displayName) === reqName
    const sameFather = !!reqFather && norm(m.fatherName) === reqFather
    const samePhone = [m.phone, m.phoneAlt].some(p => p && reqPhones.has(digits(p)))

    if (sameAadhaar) reasons.push('Aadhaar same')
    if (samePhone && sameName) reasons.push('Phone + naam same')
    if (sameName && sameFather) reasons.push('Naam + pita ka naam same')

    const row = {
      id: m.id,
      registrationNumber: m.registrationNumber || '',
      displayName: m.displayName || '',
      fatherName: m.fatherName || '',
      phone: m.phone || '',
      aadhaarNo: m.aadhaarNo || '',
      village: m.village || '',
      programName: m.programName || '',
      agentName: m.addedByName || m.agentName || '',
      status: statusLabel(m),
      reasons,
    }

    if (reasons.length) strong.push(row)
    else if (samePhone) weak.push({ ...row, reasons: ['Same phone (parivar?)'] })
  })

  return { strong, weak }
}
