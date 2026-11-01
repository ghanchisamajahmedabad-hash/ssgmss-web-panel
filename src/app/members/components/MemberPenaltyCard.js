"use client"
// Member penalties — amount, date, note.
//
// Stored on the member doc itself:
//   penalties:    [{ id, amount, date (ISO, start of day), note,
//                    createdAt, createdBy, updatedAt?, updatedBy? }]
//   penaltyTotal: sum of amounts
//
// On the member doc (not a sub-collection) so the closing form, which already
// has the member loaded, can deduct penaltyTotal at settlement without another
// read. Every write is a transaction that re-reads the doc, so two people
// editing at once can't overwrite each other's entries, and penaltyTotal is
// always recomputed from the array rather than incremented.

import React, { useEffect, useState } from 'react'
import {
  Card, Table, Button, Modal, Form, InputNumber, DatePicker, Input, Space, Tag,
  Popconfirm, Empty, Statistic, message, Tooltip,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../../../lib/firbase-client'
import { useAuth } from '@/components/Base/AuthProvider'

const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const newId = () => `pen_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const penaltyTotalOf = (list = []) =>
  (Array.isArray(list) ? list : []).reduce((s, p) => s + (Number(p?.amount) || 0), 0)

const MemberPenaltyCard = ({ member, onChange }) => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const [list, setList] = useState(Array.isArray(member?.penalties) ? member.penalties : [])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(null)   // null | { mode: 'add' } | { mode: 'edit', item }

  const who = user?.displayName || user?.name || user?.email || 'Admin'

  // Fresh read — the member prop handed to the drawer can be older than the doc
  const load = async () => {
    if (!member?.id) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'members', member.id))
      setList(Array.isArray(snap.data()?.penalties) ? snap.data().penalties : [])
    } catch (e) {
      console.error('[penalty] load', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [member?.id])

  // Read-modify-write in a transaction
  const write = async (mutate) => {
    const ref = doc(db, 'members', member.id)
    const next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      const current = Array.isArray(snap.data()?.penalties) ? snap.data().penalties : []
      const updated = mutate(current)
      tx.update(ref, {
        penalties:    updated,
        penaltyTotal: penaltyTotalOf(updated),
        updated_at:   serverTimestamp(),
      })
      return updated
    })
    setList(next)
    onChange?.(next, penaltyTotalOf(next))
  }

  const openAdd = () => {
    form.setFieldsValue({ amount: null, date: dayjs(), note: '' })
    setModal({ mode: 'add' })
  }
  const openEdit = (item) => {
    form.setFieldsValue({ amount: item.amount, date: item.date ? dayjs(item.date) : dayjs(), note: item.note || '' })
    setModal({ mode: 'edit', item })
  }

  const submit = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const entry = {
        amount: Number(v.amount),
        date:   dayjs(v.date).startOf('day').toISOString(),
        note:   (v.note || '').trim(),
      }
      if (modal.mode === 'add') {
        await write(cur => [...cur, {
          id: newId(), ...entry, createdAt: new Date().toISOString(), createdBy: who,
        }])
        message.success('पेनल्टी जोड़ी गई')
      } else {
        await write(cur => cur.map(p => p.id === modal.item.id
          ? { ...p, ...entry, updatedAt: new Date().toISOString(), updatedBy: who }
          : p))
        message.success('पेनल्टी अपडेट हुई')
      }
      setModal(null)
    } catch (e) {
      if (e?.errorFields) return
      console.error('[penalty] save', e)
      message.error('सहेजा नहीं जा सका: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item) => {
    try {
      await write(cur => cur.filter(p => p.id !== item.id))
      message.success('पेनल्टी हटाई गई')
    } catch (e) {
      message.error('हटाया नहीं जा सका: ' + e.message)
    }
  }

  const sorted = [...list].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const total = penaltyTotalOf(list)

  const columns = [
    { title: '#', key: 'sr', width: 44, align: 'center', render: (_, __, i) => i + 1 },
    {
      title: 'दिनांक', dataIndex: 'date', key: 'date', width: 110,
      render: d => d ? dayjs(d).format('DD-MM-YYYY') : '—',
    },
    {
      title: 'राशि', dataIndex: 'amount', key: 'amount', width: 100, align: 'right',
      render: a => <b style={{ color: '#dc2626' }}>{rs(a)}</b>,
    },
    {
      title: 'कारण / टिप्पणी', dataIndex: 'note', key: 'note',
      render: n => n || <span style={{ color: '#d1d5db' }}>—</span>,
    },
    {
      title: 'जोड़ा', key: 'by', width: 150,
      render: (_, p) => (
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          {p.createdBy || '—'}
          {p.createdAt && <div>{dayjs(p.createdAt).format('DD-MM-YY hh:mm A')}</div>}
          {p.updatedAt && <Tooltip title={`${p.updatedBy || ''} · ${dayjs(p.updatedAt).format('DD-MM-YY hh:mm A')}`}>
            <Tag style={{ fontSize: 9, marginTop: 2 }}>बदला गया</Tag>
          </Tooltip>}
        </div>
      ),
    },
    {
      title: '', key: 'act', width: 80, align: 'center',
      render: (_, p) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />
          <Popconfirm title="यह पेनल्टी हटाएं?" okText="हटाएं" cancelText="नहीं"
            okButtonProps={{ danger: true }} onConfirm={() => remove(p)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="mt-4">
      <Card
        size="small"
        title={<span className="text-sm"><WarningOutlined style={{ color: '#dc2626', marginRight: 8 }} />पेनल्टी</span>}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAdd}
            style={{ background: '#dc2626', borderColor: '#dc2626' }}>
            पेनल्टी जोड़ें
          </Button>
        }
      >
        <Space size={32} style={{ marginBottom: 12 }}>
          <Statistic title={<span style={{ fontSize: 11 }}>कुल पेनल्टी</span>} value={total} prefix="₹"
            valueStyle={{ fontSize: 20, color: total > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }} />
          <Statistic title={<span style={{ fontSize: 11 }}>एंट्री</span>} value={list.length}
            valueStyle={{ fontSize: 20 }} />
        </Space>
        {total > 0 && (
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
            सदस्य क्लोज होने पर यह राशि समापन पत्र में "पेनल्टी (कटौती)" के रूप में अपने आप भरी जाएगी।
          </div>
        )}
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={sorted}
          pagination={false}
          scroll={{ x: 640 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="कोई पेनल्टी नहीं" /> }}
        />
      </Card>

      <Modal
        open={!!modal}
        title={modal?.mode === 'edit' ? 'पेनल्टी बदलें' : 'पेनल्टी जोड़ें'}
        onCancel={() => setModal(null)}
        onOk={submit}
        okText="सहेजें"
        cancelText="रद्द करें"
        confirmLoading={saving}
        destroyOnHidden
      >
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          {member?.displayName} · {member?.registrationNumber}
        </div>
        <Form form={form} layout="vertical">
          <Form.Item name="amount" label="पेनल्टी राशि"
            rules={[{ required: true, message: 'राशि डालें' },
                    { type: 'number', min: 1, message: 'राशि 0 से अधिक हो' }]}>
            <InputNumber style={{ width: '100%' }} min={1} precision={0} prefix="₹" autoFocus />
          </Form.Item>
          <Form.Item name="date" label="दिनांक" rules={[{ required: true, message: 'दिनांक चुनें' }]}>
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY"
              disabledDate={d => d && d > dayjs().endOf('day')} />
          </Form.Item>
          <Form.Item name="note" label="कारण / टिप्पणी">
            <Input.TextArea rows={3} maxLength={300} showCount placeholder="जैसे: क्लोजिंग भुगतान देर से" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MemberPenaltyCard
