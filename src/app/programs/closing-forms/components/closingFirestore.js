import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getCountFromServer
} from 'firebase/firestore'
import { db } from '../../../../../lib/firbase-client'
import { normalizeSearchTerm } from '@/utils/searchIndex'
import dayjs from 'dayjs'

// member_closed_date is stored as an ISO-8601 UTC string (e.g. ...T18:30:00.000Z).
// The table displays dates in IST (UTC+05:30), so a stored day D rolls over to
// the next displayed day once the UTC time is >= 18:30. To make server-side
// date-range filters match what the user sees, convert displayed days back to
// UTC string bounds:
//   - from F  ->  closed_date >= (F-1) 18:30:00.000Z
//   - to   T  ->  closed_date <  T    18:30:00.000Z
const isoBound = (day, subtractOne = false) => {
  const base = subtractOne ? day.subtract(1, 'day') : day
  return `${base.format('YYYY-MM-DD')}T18:30:00.000Z`
}

// Hindi names too — see utils/searchIndex.js
const normalizeSearch = (s) => normalizeSearchTerm(s)

/* Build the where-clauses for a CLOSED-members query (server-side filters).
   filters: {
     programId, agentId, closingGroupId  ('' or 'all' = no filter)
     fromDate, toDate (dayjs objects, local start-of-day)
     search (string -> search_keywords array-contains)
   }
   No orderBy here so getCountFromServer works with just equality filters. */
export const buildClosedConditions = (filters = {}) => {
  const {
    programId, agentId, closingGroupId, fromDate, toDate, search
  } = filters

  const conditions = [
    where('delete_flag', '==', false),
    where('status',      '==', 'active'),
    where('member_closed', '==', true),
  ]

  // Filter on `programId`, NOT `member_closed_program`.
  //
  // member_closed_program is only written by api/closed_payment_entry when it
  // closes a member. Members closed by any other path, and every migrated
  // member, simply don't have the field — and a Firestore equality match
  // EXCLUDES documents where the field is absent, so the programme filter
  // returned almost nothing. Every member doc has programId, and the close
  // operation sets it to the closing programme anyway, so it is both always
  // present and equally correct.
  if (programId && programId !== 'all')
    conditions.push(where('programId', '==', programId))
  if (agentId && agentId !== 'all')
    conditions.push(where('agentId', '==', agentId))
  if (closingGroupId && closingGroupId !== 'all')
    conditions.push(where('closingGroupId', '==', closingGroupId))

  if (fromDate) conditions.push(where('closed_date', '>=', isoBound(fromDate, true)))
  if (toDate)   conditions.push(where('closed_date', '<',  isoBound(toDate, false)))

  const normalized = normalizeSearch(search)
  if (normalized) conditions.push(where('search_keywords', 'array-contains', normalized))

  return conditions
}

/* stable ordering + cursor support for the closed table.
   Date-wise by each member's closing date (closed_date):
     sortDir 'asc'  → earliest closing first (default)
     sortDir 'desc' → latest closing first
     sortDir 'created' → the old order (when the record was made, newest first)
   With a date-range active Firestore requires the range field to lead the
   ordering, so 'created' falls back to closing date ascending there. */
const buildClosedOrderClauses = (filters = {}) => {
  const hasDateRange = !!(filters.fromDate || filters.toDate)
  const dir = filters.sortDir === 'desc' ? 'desc' : 'asc'
  if (filters.sortDir === 'created' && !hasDateRange) return [orderBy('createdAt', 'desc')]
  if (filters.sortDir === 'created') return [orderBy('closed_date', 'asc'), orderBy('createdAt', 'asc')]
  return [orderBy('closed_date', dir), orderBy('createdAt', dir)]
}

/* Ordering by closed_date needs a Firestore composite index for each filter
   combination (firestore.indexes.json → `firebase deploy --only firestore:indexes`).
   Until an index is built the query is refused with failed-precondition — then
   the page falls back to the old order and sorts what it got by closing date, so
   the screen keeps working. The console shows the link that creates the index. */
const isIndexMissing = (e) => e?.code === 'failed-precondition' || /requires an index/i.test(e?.message || '')
const closedDateKey = (m) => {
  const v = m?.closed_date
  if (!v) return '9999'
  if (typeof v === 'string') {
    const d = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(v.trim())
    return d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : v
  }
  const t = v?.toDate ? v.toDate() : new Date(v)
  return isNaN(t) ? '9999' : t.toISOString()
}
export const sortByClosedDate = (rows, sortDir = 'asc') => {
  if (sortDir === 'created') return rows
  const out = [...rows].sort((a, b) => closedDateKey(a).localeCompare(closedDateKey(b)))
  return sortDir === 'desc' ? out.reverse() : out
}
let warnedIndex = false
const warnIndex = (e) => {
  if (warnedIndex) return
  warnedIndex = true
  console.warn('[closing-forms] Closing-date order needs a Firestore index — showing the old order sorted per page.', e?.message)
}

const toRow = (doc) => ({ id: doc.id, key: doc.id, ...doc.data() })

/* ── Closed table page (limit pageSize, cursor-aware) ──────────────────────── */
export const fetchClosedPage = async (filters = {}, lastDoc = null, pageSize = 100, withTotal = true) => {
  const conditions   = buildClosedConditions(filters)
  const orderClauses = buildClosedOrderClauses(filters)

  const run = (order) => {
    const constraints = [...conditions, ...order, limit(pageSize + 1)]
    if (lastDoc) constraints.push(startAfter(lastDoc))
    return getDocs(query(collection(db, 'members'), ...constraints))
  }

  let snap, fallback = false
  try {
    snap = await run(orderClauses)
  } catch (e) {
    if (!isIndexMissing(e) || filters.sortDir === 'created') throw e
    warnIndex(e)
    fallback = true
    snap = await run(buildClosedOrderClauses({ ...filters, sortDir: 'created' }))
  }

  let docs = snap.docs
  const hasNextPage = docs.length > pageSize
  if (hasNextPage) docs = docs.slice(0, pageSize)

  const rows = docs.map(toRow)
  return {
    rows: fallback ? sortByClosedDate(rows, filters.sortDir) : rows,
    indexMissing: fallback,
    lastDoc: docs[docs.length - 1] || null,
    hasNextPage,
    total: withTotal
      ? await getCountFromServer(query(collection(db, 'members'), ...conditions)).then(r => r.data().count).catch(() => null)
      : null,
  }
}

/* ── Closed count for stats cards (no member_closed for the "total active") ── */
export const getClosedStats = async () => {
  const base = [
    where('delete_flag', '==', false),
    where('status',      '==', 'active'),
  ]
  const closed = [...base, where('member_closed', '==', true)]

  const countOf = (conds) =>
    getCountFromServer(query(collection(db, 'members'), ...conds))
      .then(r => r.data().count)
      .catch(() => null)

  const [totalActive, closedCount] = await Promise.all([countOf(base), countOf(closed)])

  let inviteCount = null
  try {
    // Needs a (member_closed + closed_invitation_url) composite index;
    // degrade gracefully to null until that index exists.
    inviteCount = await countOf([...closed, where('closed_invitation_url', '>', '')])
  } catch (e) { console.warn('[getClosedStats] invite index missing?', e.message) }

  return {
    totalActive: totalActive ?? 0,
    closedCount: closedCount ?? 0,
    activeCount: (totalActive ?? 0) - (closedCount ?? 0),
    inviteCount,
  }
}

/* ── ALL closed members for CSV/PDF export (scrolled from the backend) ────── */
export const fetchAllClosedForExport = async (filters = {}) => {
  const conditions   = buildClosedConditions(filters)
  const orderClauses = buildClosedOrderClauses(filters)

  let all = []
  let lastDoc = null
  let done = false

  const PAGE = 300
  while (!done) {
    let snap
    try {
      const constraints = [...conditions, ...orderClauses, limit(PAGE)]
      if (lastDoc) constraints.push(startAfter(lastDoc))
      snap = await getDocs(query(collection(db, 'members'), ...constraints))
    } catch (e) {
      if (!isIndexMissing(e) || filters.sortDir === 'created') throw e
      warnIndex(e)
      // no index yet: read in the old order, sort everything at the end
      return fetchAllClosedForExport({ ...filters, sortDir: 'created' })
        .then((rows) => sortByClosedDate(rows, filters.sortDir))
    }
    snap.forEach(d => all.push(toRow(d)))
    if (snap.size < PAGE) done = true
    else lastDoc = snap.docs[snap.docs.length - 1]
  }

  // Fallback for legacy docs that may store closed_date as a Date object
  // (breaks server-side string comparison): filter those out client-side.
  if (filters.fromDate || filters.toDate) {
    try {
      const lower = filters.fromDate ? isoBound(dayjs(filters.fromDate), true) : null
      const upper = filters.toDate ? isoBound(dayjs(filters.toDate), false) : null
      all = all.filter(m => {
        const s = typeof m.closed_date === 'string' ? m.closed_date : ''
        return (!lower || s >= lower) && (!upper || s < upper)
      })
    } catch (e) { /* keep server-filtered result */ }
  }

  return all
}