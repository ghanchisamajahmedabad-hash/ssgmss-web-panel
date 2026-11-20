'use client'
// Kist (instalment) removal history — whose kist was removed, from which closing
// group, which closing it was, the amount, paid money handling, why and by whom.
// Data: GET /api/closing/kist-history (see app/api/db/kistLog.js).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Table, Tag, Input, Select, Button, Space, Tooltip, Empty } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { auth } from '../../../lib/firbase-client'

const rs = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
const SOURCE = {
  'audit':         { label: 'Closing check', color: 'blue' },
  'revert-member': { label: 'Member revert', color: 'volcano' },
}

/**
 * filter: { memberId?, closedMemberId?, closingGroupId? } — none = all members
 * compact: hide the paying-member column (used inside one member's view)
 */
export default function KistHistoryTable({ filter = {}, compact = false, pageSize = 20 }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [source, setSource] = useState('all')
  const key = JSON.stringify(filter)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      const params = new URLSearchParams(Object.entries(JSON.parse(key)).filter(([, v]) => v))
      params.set('limit', '1000')
      const res = await fetch(`/api/closing/kist-history?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Load failed')
      setRows(data.rows || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [key])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => (source === 'all' || r.source === source)
      && (!t || [r.memberName, r.memberRegNo, r.closedMemberName, r.closedMemberRegNo, r.closingGroupName, r.removedByName]
        .some((v) => String(v || '').toLowerCase().includes(t))))
  }, [rows, q, source])

  const columns = [
    { title: 'Kab', dataIndex: 'createdAt', width: 110, render: (v) => (v ? (
      <div><div>{dayjs(v).format('DD-MM-YYYY')}</div><div style={{ fontSize: 11, color: '#64748b' }}>{dayjs(v).format('hh:mm A')}</div></div>
    ) : '—') },
    ...(compact ? [] : [{ title: 'Kiski kist hati (sadasya)', key: 'm', render: (_, r) => (
      <div><div style={{ fontWeight: 600 }}>{r.memberName || '—'}</div><div style={{ fontSize: 11, color: '#64748b' }}>{r.memberRegNo}</div></div>
    ) }]),
    { title: 'Closing group', dataIndex: 'closingGroupName', render: (v, r) => v || r.closingGroupId || '—' },
    { title: 'Kis closing ki kist', key: 'c', render: (_, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.closedMemberName || '—'}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{[r.closedMemberRegNo, r.closedDate].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { title: 'Rakam', key: 'a', width: 110, align: 'right', render: (_, r) => (
      <div>
        <div>{rs(r.amount)}{r.kistCount > 1 ? <span style={{ fontSize: 11, color: '#64748b' }}> ({r.kistCount})</span> : null}</div>
        {r.paidReverted > 0 ? (
          <Tooltip title={r.paidHandling === 'advance' ? 'Jama paisa member ke advance mein gaya' : 'Jama paisa hata diya gaya'}>
            <div style={{ fontSize: 11, color: '#b45309' }}>jama {rs(r.paidReverted)} → {r.paidHandling === 'advance' ? 'advance' : 'hataya'}</div>
          </Tooltip>
        ) : null}
      </div>
    ) },
    { title: 'Kyun', key: 'r', render: (_, r) => (
      <div>
        <Tag color={SOURCE[r.source]?.color}>{SOURCE[r.source]?.label || r.source || '—'}</Tag>
        <div style={{ fontSize: 11 }}>{r.reasonLabel}</div>
        {r.note && r.note !== 'Closed member reverted' ? <div style={{ fontSize: 11, color: '#64748b' }}>{r.note}</div> : null}
      </div>
    ) },
    { title: 'Kisne', dataIndex: 'removedByName', width: 120, render: (v) => v || '—' },
  ]

  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <Input.Search allowClear placeholder="Naam, reg. no., group…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
        <Select value={source} onChange={setSource} style={{ width: 170 }} options={[
          { value: 'all', label: 'Sab' },
          { value: 'revert-member', label: 'Member revert' },
          { value: 'audit', label: 'Closing check' },
        ]} />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        <span style={{ fontSize: 12, color: '#64748b' }}>{shown.length} record</span>
      </Space>
      <Table
        size="small" rowKey="id" loading={loading} columns={columns} dataSource={shown}
        pagination={{ pageSize, size: 'small', showSizeChanger: false }}
        scroll={{ x: compact ? 700 : 950 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error || 'Koi kist nahi hatayi gayi'} /> }}
      />
    </div>
  )
}
