'use client'
// Full closing account for ONE closed member — "पूरा हिसाब".
//
// Window: the member's join date → the member's own closing date. Everything
// they could have been asked to pay for falls inside it.
//
// Two sources are joined:
//   1. The member's closing_payment docs — the closings they were actually
//      CHARGED for (closingDetails), with what was paid and when. Per-event
//      paid/pending comes from closingLateness.docEventLateness, the same logic
//      the member profile and receipts use, so the figures can't disagree.
//   2. Every member of the same yojna who CLOSED inside the window. Anyone in
//      here that isn't in (1) is shown as "शुल्क नहीं लगा" — usually because
//      that closing was limited to other age groups, sometimes because the
//      member had no instalment amount / join date at the time.
//
// Nothing is written from here.

import React, { useEffect, useMemo, useState } from 'react'
import {
  Drawer, Table, Tag, Card, Row, Col, Statistic, Alert, Spin, Typography, Space, Segmented, Tooltip,
} from 'antd'
import { CalendarOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { docEventLateness, toDay, GRACE_DAYS, LATE_LABEL } from '@/app/members/components/closingLateness'
import { fetchAllClosedForExport } from './closingFirestore'

dayjs.extend(customParseFormat)

const { Text } = Typography
const rs  = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const fmt = (d) => (d ? d.format('DD-MM-YYYY') : '—')

// A member's own closing date, from wherever the close path stored it.
export const ownClosedDay = (m) =>
  toDay(m?.closed_date) || toDay(m?.marriageDate) || toDay(m?.member_closed_at)

const ClosingHistoryDrawer = ({ open, onClose, member, closingDocs = [], programName = '' }) => {
  const [yojnaClosed, setYojnaClosed] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState('all')

  const joinDay   = toDay(member?.dateJoin) || toDay(member?.programJoinDate) || toDay(member?.joinDateTs)
  const closedDay = ownClosedDay(member)

  // Every closing in the yojna inside the window
  useEffect(() => {
    if (!open || !member?.programId || !joinDay || !closedDay) { setYojnaClosed([]); return }
    let cancelled = false
    setLoading(true); setError(null)
    fetchAllClosedForExport({ programId: member.programId, fromDate: joinDay, toDate: closedDay })
      .then(rows => { if (!cancelled) setYojnaClosed(rows.filter(r => r.id !== member.id)) })
      .catch(e => {
        console.error('[ClosingHistory] yojna closings', e)
        if (!cancelled) setError('योजना की क्लोजिंग सूची नहीं पढ़ी जा सकी — केवल लगाया गया शुल्क दिखाया जा रहा है। (' + e.message + ')')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id])

  // ── Rows ────────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const out = []
    const chargedIds = new Set()

    for (const cp of closingDocs) {
      if (cp?.isReversed === true) continue
      for (const ev of docEventLateness(cp)) {
        if (ev.closedMemberId) chargedIds.add(ev.closedMemberId)
        const paid = ev.status === 'PAID_ON_TIME' || ev.status === 'PAID_LATE'
        out.push({
          key:        `c-${cp.id}-${ev.closedMemberId || out.length}`,
          closedMemberId: ev.closedMemberId || null,
          name:       ev.closedMemberName || '—',
          regNo:      '',
          closedOn:   ev.closedOn,
          dueDate:    ev.dueDate,
          charged:    true,
          amount:     ev.amount,
          paidAmount: paid ? ev.amount : 0,
          paidOn:     paid ? ev.paidOn : null,
          status:     ev.status,
          daysLate:   ev.daysLate,
          approximate: ev.approximate,
          outside:    !!(ev.closedOn && ((joinDay && ev.closedOn.isBefore(joinDay)) || (closedDay && ev.closedOn.isAfter(closedDay)))),
        })
      }
    }

    // Closings in the window this member was not charged for
    const regById = new Map()
    for (const m of yojnaClosed) {
      regById.set(m.id, m.registrationNumber || '')
      if (chargedIds.has(m.id)) continue
      const d = ownClosedDay(m)
      out.push({
        key:      `n-${m.id}`,
        name:     m.displayName || m.name || '—',
        regNo:    m.registrationNumber || '',
        closedOn: d,
        dueDate:  null,
        charged:  false,
        amount:   0,
        paidAmount: 0,
        paidOn:   null,
        status:   'NOT_CHARGED',
      })
    }
    // Fill reg. no. on charged rows where we know it
    for (const r of out) {
      if (r.charged && !r.regNo && regById.has(r.closedMemberId)) r.regNo = regById.get(r.closedMemberId)
    }

    out.sort((a, b) => (a.closedOn?.valueOf() || 0) - (b.closedOn?.valueOf() || 0))
    out.forEach((r, i) => { r.sr = i + 1 })
    return out
  }, [closingDocs, yojnaClosed, joinDay?.valueOf(), closedDay?.valueOf()])

  const sums = useMemo(() => {
    const charged = rows.filter(r => r.charged)
    const due  = charged.reduce((s, r) => s + r.amount, 0)
    // Paid is taken from the docs themselves, not the per-event split, so a
    // part-payment that doesn't cover a whole instalment still counts.
    const paid = closingDocs.filter(d => d?.isReversed !== true)
                            .reduce((s, d) => s + Number(d.paidAmount || 0), 0)
    return {
      inWindow:   rows.length,
      charged:    charged.length,
      notCharged: rows.length - charged.length,
      paidEvents: charged.filter(r => r.paidOn).length,
      due, paid,
      pending:    Math.max(0, due - paid),
      late:       charged.filter(r => r.status === 'PAID_LATE' || r.status === 'OVERDUE').length,
    }
  }, [rows, closingDocs])

  const shown = rows.filter(r =>
    view === 'all'        ? true :
    view === 'paid'       ? r.charged && !!r.paidOn :
    view === 'pending'    ? r.charged && !r.paidOn :
    view === 'notCharged' ? !r.charged : true)

  const columns = [
    { title: '#', dataIndex: 'sr', width: 46, align: 'center' },
    {
      title: 'क्लोज हुआ सदस्य', key: 'name',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</div>
          {r.regNo && <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.regNo}</div>}
        </div>
      ),
    },
    { title: 'क्लोजिंग तिथि', key: 'closedOn', width: 105, render: (_, r) => fmt(r.closedOn) },
    {
      title: <Tooltip title={`क्लोजिंग तिथि + ${GRACE_DAYS} दिन`}>अंतिम तिथि</Tooltip>,
      key: 'due', width: 100, render: (_, r) => <span style={{ color: '#6b7280' }}>{fmt(r.dueDate)}</span>,
    },
    {
      title: 'देय', key: 'amount', width: 80, align: 'right',
      render: (_, r) => r.charged ? <b>{rs(r.amount)}</b> : <span style={{ color: '#d1d5db' }}>—</span>,
    },
    {
      title: 'भरा', key: 'paid', width: 80, align: 'right',
      render: (_, r) => r.charged
        ? <span style={{ color: r.paidOn ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{rs(r.paidAmount)}</span>
        : <span style={{ color: '#d1d5db' }}>—</span>,
    },
    { title: 'भुगतान तिथि', key: 'paidOn', width: 100, render: (_, r) => fmt(r.paidOn) },
    {
      title: 'स्थिति', key: 'status', width: 130,
      render: (_, r) => {
        if (!r.charged) return (
          <Tooltip title="इस क्लोजिंग का शुल्क इस सदस्य पर नहीं लगा — आमतौर पर क्योंकि वह क्लोजिंग दूसरे आयु वर्ग के लिए थी">
            <Tag style={{ fontSize: 10 }}>शुल्क नहीं लगा</Tag>
          </Tooltip>
        )
        const l = LATE_LABEL[r.status] || LATE_LABEL.UNKNOWN
        return (
          <Space size={2} wrap>
            <Tag color={l.color} style={{ fontSize: 10, marginRight: 0 }}>{l.text}</Tag>
            {r.daysLate > 0 && <span style={{ fontSize: 10, color: '#dc2626' }}>{r.daysLate} दिन</span>}
            {r.outside && <Tooltip title="यह क्लोजिंग सदस्य की जॉइन/क्लोजिंग तिथि की अवधि से बाहर है"><Tag color="red" style={{ fontSize: 10 }}>अवधि से बाहर</Tag></Tooltip>}
          </Space>
        )
      },
    },
  ]

  const months = joinDay && closedDay ? closedDay.diff(joinDay, 'month') : null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={980}
      title={
        <div>
          <div style={{ fontWeight: 700 }}>क्लोजिंग का पूरा हिसाब</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {member?.displayName} · {member?.registrationNumber}{programName ? ` · ${programName}` : ''}
          </Text>
        </div>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Card size="small">
          <Space size={24} wrap style={{ fontSize: 12 }}>
            <span><CalendarOutlined /> जॉइन तिथि : <b>{fmt(joinDay)}</b></span>
            <span><CalendarOutlined /> क्लोजिंग तिथि : <b style={{ color: '#dc2626' }}>{fmt(closedDay)}</b></span>
            {months !== null && <span>अवधि : <b>{Math.floor(months / 12) ? `${Math.floor(months / 12)} वर्ष ` : ''}{months % 12} माह</b></span>}
            <span>किस्त राशि : <b>{rs(member?.payAmount)}</b></span>
          </Space>
        </Card>

        {(!joinDay || !closedDay) && (
          <Alert type="warning" showIcon message={
            !joinDay ? 'सदस्य की जॉइन तिथि उपलब्ध नहीं — योजना की क्लोजिंग सूची नहीं निकाली जा सकती, केवल लगाया गया शुल्क दिखाया गया है।'
                     : 'सदस्य की क्लोजिंग तिथि उपलब्ध नहीं — पहले क्लोजिंग तिथि सेट करें।'} />
        )}
        {error && <Alert type="error" showIcon message={error} />}

        <Row gutter={[10, 10]}>
          {[
            { t: 'अवधि में क्लोजिंग', v: sums.inWindow, c: '#1B385A' },
            { t: 'शुल्क लगा',        v: sums.charged,  c: '#2563eb', note: sums.notCharged ? `${sums.notCharged} पर नहीं` : '' },
            { t: 'कुल देय',          v: rs(sums.due),  c: '#722ed1' },
            { t: 'भरा',             v: rs(sums.paid), c: '#16a34a', note: `${sums.paidEvents} किस्त` },
            { t: 'बकाया',           v: rs(sums.pending), c: sums.pending > 0 ? '#dc2626' : '#16a34a' },
            { t: 'देर / अतिदेय',      v: sums.late,     c: sums.late ? '#f59e0b' : '#16a34a' },
          ].map(s => (
            <Col key={s.t} xs={12} md={4}>
              <Card size="small" styles={{ body: { padding: '8px 10px' } }}>
                <Statistic title={<span style={{ fontSize: 11 }}>{s.t}</span>} value={s.v}
                  valueStyle={{ fontSize: 16, color: s.c, fontWeight: 700 }} />
                {s.note && <div style={{ fontSize: 10, color: '#9ca3af' }}>{s.note}</div>}
              </Card>
            </Col>
          ))}
        </Row>

        <Segmented
          size="small"
          value={view}
          onChange={setView}
          options={[
            { label: `सभी (${rows.length})`, value: 'all' },
            { label: `भरी (${sums.paidEvents})`, value: 'paid' },
            { label: `बकाया (${sums.charged - sums.paidEvents})`, value: 'pending' },
            { label: `शुल्क नहीं लगा (${sums.notCharged})`, value: 'notCharged' },
          ]}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <Table
            size="small"
            columns={columns}
            dataSource={shown}
            pagination={shown.length > 50 ? { pageSize: 50, size: 'small' } : false}
            scroll={{ x: 860 }}
            rowClassName={r => (!r.charged ? 'opacity-60' : '')}
            locale={{ emptyText: 'इस अवधि में कोई क्लोजिंग नहीं' }}
            summary={() => view === 'all' && rows.length > 0 ? (
              <Table.Summary.Row style={{ background: '#f1f5f9', fontWeight: 700 }}>
                <Table.Summary.Cell index={0} colSpan={4}>कुल ({sums.charged} किस्त)</Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">{rs(sums.due)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><span style={{ color: '#16a34a' }}>{rs(sums.paid)}</span></Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={2}>
                  <span style={{ color: sums.pending ? '#dc2626' : '#16a34a' }}>बकाया {rs(sums.pending)}</span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null}
          />
        )}

        {rows.some(r => r.approximate) && (
          <Alert type="info" showIcon icon={<InfoCircleOutlined />} message={
            <span style={{ fontSize: 11 }}>
              कुछ भुगतान आंशिक हैं। भुगतान ग्रुप स्तर पर दर्ज होता है, किस्त-वार नहीं — इसलिए कौन-सी किस्त भरी गई,
              यह राशि के आधार पर (पुरानी पहले) अनुमानित है। कुल "भरा" राशि सटीक है।
            </span>} />
        )}
      </Space>
    </Drawer>
  )
}

export default ClosingHistoryDrawer
