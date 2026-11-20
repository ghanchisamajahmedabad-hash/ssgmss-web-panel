'use client'
// Revert ONE closed member — closing status + that member's kist from every
// member of the closing group (POST /api/closing/revert-member).
// Opens with a preview (dry run) so the admin sees exactly who is affected before
// anything changes. Other closed members of the same group are not touched.
import React, { useEffect, useState } from 'react'
import { Modal, Alert, Table, Radio, Input, Spin, Statistic, Row, Col, Tag, message } from 'antd'
import { RollbackOutlined } from '@ant-design/icons'
import { auth } from '../../../../../lib/firbase-client'

const rs = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

const call = async (body) => {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch('/api/closing/revert-member', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || `Request failed (${res.status})`)
  return data
}

export default function RevertClosedMemberModal({ member, onClose, onDone }) {
  const open = !!member
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [paidHandling, setPaidHandling] = useState('advance')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!member) return
    setPreview(null); setError(null); setReason(''); setPaidHandling('advance')
    setLoading(true)
    call({ memberId: member.id, closingGroupId: member.closingGroupId || undefined, dryRun: true })
      .then((d) => setPreview(d.preview))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [member])

  const doRevert = async () => {
    setSaving(true)
    try {
      const d = await call({
        memberId: member.id, closingGroupId: preview?.closingGroupId || member.closingGroupId || undefined,
        paidHandling, reason: reason.trim() || undefined,
      })
      message.success(d.message || 'Revert ho gaya')
      onDone?.(d)
      onClose?.()
    } catch (e) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { title: 'Sadasya', key: 'n', render: (_, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.name || '—'}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{r.regNo}</div>
      </div>
    ) },
    { title: 'Kist', dataIndex: 'kists', width: 50, align: 'center' },
    { title: 'Hategi rakam', dataIndex: 'amount', width: 90, align: 'right', render: rs },
    { title: 'Jama tha', dataIndex: 'paid', width: 80, align: 'right', render: rs },
    { title: 'Jama wapas', dataIndex: 'released', width: 90, align: 'right',
      render: (v) => (v > 0 ? <span style={{ color: '#b45309', fontWeight: 600 }}>{rs(v)}</span> : '—') },
    { title: 'Naya kul', dataIndex: 'newTotal', width: 80, align: 'right',
      render: (v, r) => (r.removesDoc ? <Tag>hat jayega</Tag> : rs(v)) },
  ]

  return (
    <Modal
      open={open}
      onCancel={saving ? undefined : onClose}
      title={<span><RollbackOutlined /> Closed member revert — {member?.displayName} ({member?.registrationNumber || '—'})</span>}
      okText="Haan, revert karein"
      okButtonProps={{ danger: true, disabled: !preview || loading, loading: saving }}
      cancelText="Nahi"
      onOk={doRevert}
      width={760}
      destroyOnClose
    >
      {loading ? <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div> : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {preview ? (
        <>
          <Alert
            type="warning" showIcon style={{ marginBottom: 12 }}
            message="Sirf is ek sadasya ka revert"
            description={(
              <div style={{ fontSize: 12 }}>
                Sadasya wapas <b>active</b> ho jayega, aur group <b>{preview.closingGroupName || preview.closingGroupId || '—'}</b> ke
                har sadasya par isi ki closing ki <b>kist hat jayegi</b> (rakam, ginti, status, agent / yojna ke total sab theek honge).
                Isi group ke baaki closed sadasya waise hi rahenge. Har hatayi kist ka record &quot;Kist History&quot; mein rahega.
              </div>
            )}
          />
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col span={6}><Statistic title="Sadasya prabhavit" value={preview.affectedMembers} /></Col>
            <Col span={6}><Statistic title="Kist hategi" value={preview.removedKists} /></Col>
            <Col span={6}><Statistic title="Rakam hategi" value={rs(preview.removedAmount)} /></Col>
            <Col span={6}><Statistic title="Jama paisa wapas" value={rs(preview.releasedPaid)} valueStyle={{ color: preview.releasedPaid ? '#b45309' : undefined }} /></Col>
          </Row>
          {preview.releasedPaid > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Jinhone is kist ka paisa de diya tha ({rs(preview.releasedPaid)}), wo paisa:
              </div>
              <Radio.Group value={paidHandling} onChange={(e) => setPaidHandling(e.target.value)}>
                <Radio value="advance">Sadasya ke advance mein daalein (agli kist mein kaam aayega)</Radio>
                <Radio value="remove">Hata dein (jaise poora group revert karne par hota hai)</Radio>
              </Radio.Group>
            </div>
          ) : null}
          <Input.TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
            placeholder="Kaaran (record ke liye) — jaise: galti se close ho gaya" style={{ marginBottom: 12 }} />
          <Table size="small" rowKey="memberId" columns={columns} dataSource={preview.rows}
            pagination={preview.rows.length > 8 ? { pageSize: 8, size: 'small' } : false}
            locale={{ emptyText: 'Kisi sadasya par is closing ki kist nahi lagi thi — sirf status wapas hoga.' }} />
          {preview.affectedMembers > preview.rows.length ? (
            <div style={{ fontSize: 11, color: '#64748b' }}>Pehle {preview.rows.length} dikh rahe hain — revert sab {preview.affectedMembers} par lagega.</div>
          ) : null}
        </>
      ) : null}
    </Modal>
  )
}
