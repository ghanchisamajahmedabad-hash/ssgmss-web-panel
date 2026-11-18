"use client"
// ─────────────────────────────────────────────────────────────────────────────
// Member-wise सहयोग राशि रसीद (closing receipt) — one shared builder for every
// place in the panel that downloads a single member's receipts:
//
//   • Members table → row ⋮ menu → "Rasid Download"
//   • Member details drawer → header + Closing tab (per group / all / paid / pending)
//   • Payment Details drawer → header + each closing group card
//
// The figures follow EXACTLY the same rules as /api/agent-rasid (the receipt the
// agent app and RasidGroupClosingDrawer make), so a member's receipt is the same
// whichever screen it is downloaded from:
//
//   • one receipt page-set per closing group (closing_payment doc)
//   • the table lists the closings THAT doc charges for, at that doc's total
//   • each closed member's code / name / village / date / mobile is read from
//     the closed member's OWN member doc — closingDetails is only a fallback,
//     and its fields are ignored when they are really the PAYING member's
//   • yojana + age group come from the paying member's own program
//   • worker = the member's agent "(code) name phone"
//   • reversed docs are skipped
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import {
  collection, query, where, getDocs, getDoc, doc, orderBy, documentId,
} from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../../../../lib/firbase-client'
import ClosingRasidPdf from '../ClosingRasidPdf'

const HINDI_MONTHS = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']

const slug = (v) => String(v || '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40)

// "DD-MM-YYYY" from a Timestamp / ISO string / DD-MM-YYYY string / Date.
// Same as /api/agent-rasid: an ISO string written from a local (IST) midnight
// arrives as the previous day T18:30Z, so it is moved forward a day.
export const toDDMMYYYY = (d) => {
  if (!d) return ''
  if (d?.toDate) return dayjs(d.toDate()).format('DD-MM-YYYY')
  if (typeof d === 'string') {
    const s = d.trim()
    const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
    if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/)
    if (iso) {
      const local = dayjs(`${iso[1]}-${iso[2]}-${iso[3]}`)
      return Number(s.slice(11, 13)) >= 18 ? local.add(1, 'day').format('DD-MM-YYYY') : local.format('DD-MM-YYYY')
    }
  }
  const p = dayjs(d)
  return p.isValid() ? p.format('DD-MM-YYYY') : ''
}

const sortKey = (s) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || '')
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 0
}

// Firestore `in` takes at most 30 ids per query
const getDocsByIds = async (col, ids) => {
  const uniq = [...new Set((ids || []).filter(Boolean).map(String))]
  const out = {}
  for (let i = 0; i < uniq.length; i += 30) {
    const snap = await getDocs(query(collection(db, col), where(documentId(), 'in', uniq.slice(i, i + 30))))
    snap.docs.forEach(d => { out[d.id] = { id: d.id, ...d.data() } })
  }
  return out
}

const getOne = async (col, id) => {
  if (!id) return null
  try {
    const s = await getDoc(doc(db, col, String(id)))
    return s.exists() ? { id: s.id, ...s.data() } : null
  } catch { return null }
}

// The member's closing_payment docs (one per closing group). Used when the
// caller hasn't already loaded them — e.g. straight from the members table.
export const fetchMemberClosingEntries = async (memberId) => {
  if (!memberId) return []
  const snap = await getDocs(query(
    collection(db, 'closing_payment'),
    where('memberId', '==', memberId),
    orderBy('createdAt', 'desc'),
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))
}

// closing_payment docs are keyed `${memberId}_${groupId}`
export const groupIdOf = (entry) => entry?.closingGroupId || entry?.id?.split('_')[1] || ''

export const isEntryPaid = (e) => e?.status === 'paid'

// ─── Build receipts ──────────────────────────────────────────────────────────
// Returns the array ClosingRasidPdf expects — one item per closing group.
//   member   the paying member (members doc)
//   entries  closing_payment docs to make receipts for (already filtered)
//   date     receipt date (anything dayjs takes) — default today
//   note     optional override for the Note line
export const buildMemberRasidList = async ({ member, entries, date, note: noteOverride }) => {
  const list = (entries || []).filter(e => e && e.isReversed !== true)
  if (!member || !list.length) return []

  const rasidDate = date && dayjs(date).isValid() ? dayjs(date) : dayjs()
  const groupIds = [...new Set(list.map(groupIdOf).filter(Boolean))]

  // ── Load everything the receipt needs, in parallel ──
  const closedIdsAll = list.flatMap(e => (e.closingDetails || []).map(cd => cd?.closed_memberId).filter(Boolean))
  const [agent, program, groupMap, closedDocs] = await Promise.all([
    getOne('agents', member.agentId),
    getOne('programs', member.programId),
    getDocsByIds('groupClosings', groupIds),
    getDocsByIds('members', closedIdsAll),
  ])

  // Yojna + age group from the PAYING member's own program
  const yojana = program?.name || program?.hindiName || member.programName || ''
  const ageGroup = ((program?.ageGroups || []).find(a => a.id === member.ageGroupId)?.ageGroupName)
    || member.ageGroupName || member.memberGroupName || member.ageGroup || ''

  const worker = agent
    ? [agent.agentCode ? `(${agent.agentCode})` : '', agent.name || '', agent.phone1 || agent.phone || ''].filter(Boolean).join(' ')
    : (member.addedByName || '')

  const note = (noteOverride && String(noteOverride).trim()) ||
    `${HINDI_MONTHS[rasidDate.month()]}-${rasidDate.format('YYYY')} सहयोग राशि ( "यह सहयोग राशि स्वैच्छिक है एवं गैर-वापसीयोग्य है।" )`

  return list.map((entry, idx) => {
    const gid = groupIdOf(entry)
    const group = groupMap[gid] || {}
    const groupDate = toDDMMYYYY(group.closedAt)

    const rows = (entry.closingDetails || []).map((cd, i) => {
      const id = cd?.closed_memberId || `row_${i}`
      const m = cd?.closed_memberId ? closedDocs[cd.closed_memberId] : null
      // closingDetails falls back to the PAYING member's phone / reg. no. —
      // never print those as the closed member's own.
      const cdPhone = cd?.closingPhone && cd.closingPhone !== member.phone ? cd.closingPhone : ''
      const cdReg = [cd?.closed_registrationNumber, cd?.closing_registrationNumber]
        .find(r => r && r !== member.registrationNumber) || ''
      const name = m?.displayName || cd?.closed_memberName || cd?.closing_Name || cd?.name || 'Unknown'
      const father = m?.fatherName || cd?.closed_fatherName || cd?.closing_fatherName || ''
      return {
        id,
        code: m?.registrationNumber || cdReg,
        name: [name, father ? '/ ' + father : ''].filter(Boolean).join(' '),
        village: m ? [m.village, m.district, m.state].filter(Boolean).join(' - ') : (cd?.closed_village || cd?.closing_village || ''),
        date: toDDMMYYYY(m?.closed_date || m?.marriageDate || cd?.closed_date || cd?.marriageDate) || groupDate,
        mobile: m?.phone || m?.phoneNo || cdPhone,
      }
    }).sort((a, b) => sortKey(a.date) - sortKey(b.date))

    return {
      id: entry.id,
      serialNo: String(entry.serialNo || entry.receiptNo || idx + 1),
      date: rasidDate.format('DD-MM-YYYY'),
      name: [member.displayName, member.fatherName ? '/ ' + member.fatherName : ''].filter(Boolean).join(' '),
      phone: member.phone || '',
      address: [member.village, member.city, member.state].filter(Boolean).join(', '),
      yojana,
      ageGroup,
      sahyogRashi: Number(entry.payAmount ?? member.payAmount ?? 0),
      entries: rows,
      totalAmount: Number(entry.totalAmount || 0),
      worker,
      note,
      status: entry.status || 'pending',
      // not printed — used for file names / UI
      groupName: group.groupName || entry.closingGroupName || gid.slice(-6),
    }
  })
}

// ─── Download ────────────────────────────────────────────────────────────────
const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Builds and downloads straight away — no preview step.
//   which: 'all' | 'paid' | 'pending' | <closing_payment doc id> | <groupId>
//   entries: optional — fetched when not given
// Returns the number of receipts in the file (0 = nothing to download).
export const downloadMemberRasid = async ({ member, entries, which = 'all', date, note }) => {
  if (!member?.id) throw new Error('Member not loaded')
  const all = (entries || await fetchMemberClosingEntries(member.id)).filter(e => e.isReversed !== true)

  let picked
  let label
  if (which === 'all') { picked = all; label = 'all' }
  else if (which === 'paid') { picked = all.filter(isEntryPaid); label = 'paid' }
  else if (which === 'pending') { picked = all.filter(e => !isEntryPaid(e)); label = 'pending' }
  else {
    picked = all.filter(e => e.id === which || groupIdOf(e) === which)
    label = null
  }
  if (!picked.length) return 0

  const receipts = await buildMemberRasidList({ member, entries: picked, date, note })
  if (!receipts.length) return 0

  const blob = await pdf(<ClosingRasidPdf entries={receipts} />).toBlob()
  const reg = slug(member.registrationNumber || member.id)
  const day = dayjs(date || undefined).format('DD-MM-YYYY')
  const fileName = label
    ? `Rasid_${reg}_${label}_${day}.pdf`
    : `Rasid_${reg}_${slug(receipts[0].groupName)}_${day}.pdf`
  saveBlob(blob, fileName)
  return receipts.length
}
