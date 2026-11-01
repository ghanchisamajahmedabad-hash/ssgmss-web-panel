'use client'
// Closing form for a closed member — enter the settlement, save, download.
//
// The amounts a member ALREADY contributed are pre-filled from that member's
// closing_payment docs, the same source the receipts and the audit use. They
// can be corrected for the letter (closing count, amount due, amount paid);
// a correction changes only what the letter prints — the closing_payment
// records and receipts are untouched — and the drawer flags any figure that
// no longer matches the records. "पूरा हिसाब" opens the event-by-event
// account from join date to closing date.
//
// The settlement is saved onto the member as `closingFormData` before the PDF
// is offered, so the form can be reprinted later with identical figures instead
// of being retyped from memory.

import React, { useState, useEffect, useMemo } from 'react'
import {
  Drawer, Button, Space, Form, InputNumber, Select, Input, Card, Statistic,
  Row, Col, Alert, Spin, Typography, message, Divider, Tag, Checkbox, DatePicker,
} from 'antd'
import { FilePdfOutlined, SaveOutlined, ReloadOutlined, HistoryOutlined, UndoOutlined, PictureOutlined } from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { collection, query, where, getDocs, getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../../../../lib/firbase-client'
import ClosingFormPdf from './ClosingFormPdf'
import ClosingHistoryDrawer from './ClosingHistoryDrawer'
import ClosingStatusCard from './ClosingStatusCard'

const { Text, Title } = Typography

const ClosingFormDrawer = ({ open, onClose, member, programList = [], onSaved }) => {
  const [form]      = Form.useForm()
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [docs, setDocs]         = useState([])
  const [error, setError]       = useState(null)
  const [settlement, setSettlement] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  // Penalties added from the member details view (Penalty tab)
  const [penalties, setPenalties] = useState([])
  const penaltyTotal = penalties.reduce((s, p) => s + (Number(p?.amount) || 0), 0)

  const programName = useMemo(() => {
    const p = programList.find(x => x.id === member?.programId)
    return p?.hindiName || p?.name || member?.programName || ''
  }, [programList, member])

  // ── What the member has actually been charged and has paid ────────────────
  const totals = useMemo(() => {
    let total = 0, paid = 0, events = 0
    for (const d of docs) {
      if (d.isReversed === true) continue
      total  += Number(d.totalAmount  || 0)
      paid   += Number(d.paidAmount   || 0)
      events += Number(d.closingCount || 0)
    }
    return { total, paid, pending: Math.max(0, total - paid), events }
  }, [docs])

  const load = async () => {
    if (!member?.id) return
    setLoading(true); setError(null)
    try {
      const [snap, memberSnap] = await Promise.all([
        getDocs(query(collection(db, 'closing_payment'), where('memberId', '==', member.id))),
        // Fresh member read for penalties — the table row can be older
        getDoc(doc(db, 'members', member.id)),
      ])
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      const pen = memberSnap.data()?.penalties
      setPenalties(Array.isArray(pen) ? pen : [])
    } catch (e) {
      console.error(e)
      setError('क्लोजिंग रिकॉर्ड नहीं पढ़े जा सके — ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !member?.id) return
    setSettlement(member.closingFormData || null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id])

  // Seed the form once the charges are known, or from a previously saved form.
  useEffect(() => {
    if (!open) return
    const prev = member?.closingFormData
    form.setFieldsValue({
      // Closing figures — from the records unless the letter was corrected
      membersCount:      prev?.membersCount      ?? totals.events,
      totalCharged:      prev?.totalCharged      ?? totals.total,
      memberContributed: prev?.memberContributed ?? totals.paid,
      amountGiven: prev?.amountGiven ?? 0,
      paymentMode: prev?.paymentMode ?? 'नकद',
      // Outstanding closing instalments are the member's own old pending by
      // default — the usual thing deducted from the payout.
      oldPending:  prev?.oldPending ?? totals.pending,
      // Member's penalties are deducted by default
      penalty:     prev?.penalty ?? penaltyTotal,
      // Print the penalty line on the letter? Older saved forms had no such
      // choice and always printed it, so they default to true.
      showPenaltyInPdf: prev?.showPenaltyInPdf ?? true,
      note:        prev?.note ?? '',
      paymentDone: prev?.paymentDone ?? false,
      // Default to the day the money actually changed hands, not "today
      // whenever this form is reopened" — so a form prepared now and marked
      // paid next week records next week.
      paymentDate: prev?.paymentDate ? dayjs(prev.paymentDate) : dayjs(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, totals.pending, totals.total, totals.paid, totals.events, penaltyTotal, member?.id])

  const values   = Form.useWatch([], form) || {}
  const netAmount = Math.max(0,
    Number(values.amountGiven || 0) - Number(values.oldPending || 0) - Number(values.penalty || 0))

  // Which corrected figures no longer match the closing_payment records
  const edited = {
    membersCount:      values.membersCount      !== undefined && Number(values.membersCount)      !== totals.events,
    totalCharged:      values.totalCharged      !== undefined && Number(values.totalCharged)      !== totals.total,
    memberContributed: values.memberContributed !== undefined && Number(values.memberContributed) !== totals.paid,
  }
  const anyEdited = edited.membersCount || edited.totalCharged || edited.memberContributed
  const formPending = Math.max(0, Number(values.totalCharged || 0) - Number(values.memberContributed || 0))

  const resetToRecords = () => form.setFieldsValue({
    membersCount: totals.events, totalCharged: totals.total,
    memberContributed: totals.paid, oldPending: totals.pending,
  })

  const save = async () => {
    try {
      const v = await form.validateFields()
      if (Number(v.amountGiven || 0) <= 0) {
        message.error('सदस्य को दी जा रही राशि डालें')
        return
      }
      if (v.paymentDone && !v.paymentDate) {
        message.error('भुगतान की दिनांक चुनें')
        return
      }
      setSaving(true)

      const data = {
        // Pre-filled from the closing records; may be corrected for the letter.
        memberContributed: Number(v.memberContributed ?? totals.paid),
        membersCount:      Number(v.membersCount ?? totals.events),
        totalCharged:      Number(v.totalCharged ?? totals.total),
        // What the records said at the time, kept so a corrected letter can
        // always be traced back.
        recordFigures:     { memberContributed: totals.paid, membersCount: totals.events, totalCharged: totals.total },
        figuresEdited:     Number(v.memberContributed ?? totals.paid) !== totals.paid
                        || Number(v.membersCount ?? totals.events)    !== totals.events
                        || Number(v.totalCharged ?? totals.total)     !== totals.total,
        // Entered
        amountGiven: Number(v.amountGiven || 0),
        paymentMode: v.paymentMode || 'नकद',
        oldPending:  Number(v.oldPending || 0),
        penalty:     Number(v.penalty || 0),
        showPenaltyInPdf: v.showPenaltyInPdf !== false,
        // Which penalty entries were on the member when this was prepared
        penaltyDetails: penalties.map(p => ({ amount: Number(p.amount) || 0, date: p.date || null, note: p.note || '' })),
        note:        v.note || '',
        netAmount,
        // Handover status. paymentDate is only meaningful once paid, so it is
        // cleared otherwise rather than left as a date nothing happened on.
        paymentDone: !!v.paymentDone,
        paymentDate: v.paymentDone && v.paymentDate
          ? dayjs(v.paymentDate).startOf('day').toISOString()
          : null,
        preparedAt:  new Date().toISOString(),
      }

      await updateDoc(doc(db, 'members', member.id), {
        closingFormData: data,
        closingFormAt:   serverTimestamp(),
        updated_at:      serverTimestamp(),
      })

      setSettlement(data)
      message.success('समापन पत्र सहेजा गया — अब डाउनलोड कर सकते हैं')
      onSaved?.(member.id, data)
    } catch (e) {
      if (e?.errorFields) return         // form validation, already shown
      console.error(e)
      message.error('सहेजा नहीं जा सका: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const fileName = `ClosingForm_${member?.registrationNumber || member?.id || 'member'}_${dayjs().format('YYYY-MM-DD')}.pdf`

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      title={
        <div>
          <Title level={5} style={{ margin: 0 }}>सदस्यता समापन पत्र</Title>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {member?.displayName} · {member?.registrationNumber}
          </Text>
        </div>
      }
      extra={
        <Space>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}
            disabled={loading}>
            पूरा हिसाब
          </Button>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>
            Refresh
          </Button>
          {settlement && (
            <Button size="small" icon={<PictureOutlined />} onClick={() => setStatusOpen(true)}
              style={{ borderColor: '#15803d', color: '#15803d' }}>
              स्टेटस / प्रमाणपत्र
            </Button>
          )}
          {settlement && (
            <Button size="small" icon={<SaveOutlined />} loading={saving} onClick={save}>
              बदलाव सहेजें
            </Button>
          )}
          {settlement ? (
            <PDFDownloadLink
              fileName={fileName}
              document={
                <ClosingFormPdf
                  member={member}
                  settlement={settlement}
                  programName={programName}
                />
              }
            >
              {({ loading: l }) => (
                <Button type="primary" size="small" icon={<FilePdfOutlined />} loading={l}
                  style={{ background: '#D3292F', border: 'none' }}>
                  डाउनलोड PDF
                </Button>
              )}
            </PDFDownloadLink>
          ) : (
            <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving} onClick={save}>
              सहेजें और PDF बनाएं
            </Button>
          )}
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {error && <Alert type="error" showIcon message={error} />}

          {!member?.member_closed && (
            <Alert
              type="warning" showIcon
              message="यह सदस्य अभी क्लोज नहीं हुआ है"
              description="समापन पत्र आमतौर पर क्लोजिंग के बाद ही दिया जाता है।"
            />
          )}

          {/* From the closing records */}
          <Card size="small" title={<span style={{ fontSize: 12 }}>क्लोजिंग रिकॉर्ड से</span>}>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>कुल राशि</span>}
                  value={totals.total} prefix="₹" valueStyle={{ fontSize: 17, color: '#722ed1' }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>चुकाई गई</span>}
                  value={totals.paid} prefix="₹" valueStyle={{ fontSize: 17, color: '#16a34a' }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>बकाया</span>}
                  value={totals.pending} prefix="₹"
                  valueStyle={{ fontSize: 17, color: totals.pending > 0 ? '#dc2626' : '#16a34a' }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>क्लोजिंग</span>}
                  value={totals.events} valueStyle={{ fontSize: 17, color: '#2563eb' }} />
              </Col>
            </Row>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                ये आंकड़े सदस्य के closing_payment रिकॉर्ड से लिए गए हैं।
              </Text>
              <Button size="small" type="link" icon={<HistoryOutlined />} style={{ fontSize: 11, padding: 0 }}
                onClick={() => setHistoryOpen(true)}>
                जॉइन से क्लोजिंग तक पूरा हिसाब देखें
              </Button>
            </div>
          </Card>

          <Divider style={{ margin: '4px 0' }} />

          {/* Entered */}
          <Form form={form} layout="vertical" size="small">
            {/* Closing figures printed on the letter — editable */}
            <Card size="small" style={{ marginBottom: 12, borderColor: anyEdited ? '#faad14' : undefined }}
              title={<span style={{ fontSize: 12 }}>पत्र में क्लोजिंग राशि (बदल सकते हैं)</span>}
              extra={anyEdited && (
                <Button size="small" type="link" icon={<UndoOutlined />} style={{ fontSize: 11 }}
                  onClick={resetToRecords}>
                  रिकॉर्ड से भरें
                </Button>
              )}>
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item name="membersCount" label="कुल क्लोजिंग (संख्या)"
                    help={edited.membersCount ? <span style={{ fontSize: 10, color: '#d48806' }}>रिकॉर्ड: {totals.events}</span> : null}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="totalCharged" label="कुल क्लोजिंग राशि (देय)"
                    help={edited.totalCharged ? <span style={{ fontSize: 10, color: '#d48806' }}>रिकॉर्ड: ₹{totals.total.toLocaleString('en-IN')}</span> : null}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="memberContributed" label="सदस्य ने भरी राशि"
                    help={edited.memberContributed ? <span style={{ fontSize: 10, color: '#d48806' }}>रिकॉर्ड: ₹{totals.paid.toLocaleString('en-IN')}</span> : null}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹" />
                  </Form.Item>
                </Col>
              </Row>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                बकाया (देय − भरी) : <b style={{ color: formPending > 0 ? '#dc2626' : '#16a34a' }}>₹{formPending.toLocaleString('en-IN')}</b>
                {formPending !== Number(values.oldPending || 0) && (
                  <Button size="small" type="link" style={{ fontSize: 11 }}
                    onClick={() => form.setFieldsValue({ oldPending: formPending })}>
                    इसे "पुरानी बकाया" में डालें
                  </Button>
                )}
              </div>
              {anyEdited && (
                <Alert type="warning" showIcon style={{ marginTop: 8 }}
                  message={<span style={{ fontSize: 11 }}>
                    बदली गई राशि केवल समापन पत्र में छपेगी — सदस्य के क्लोजिंग भुगतान रिकॉर्ड और रसीदें नहीं बदलेंगी।
                    भुगतान दर्ज करने के लिए Payments → Closing Payment का उपयोग करें।
                  </span>} />
              )}
            </Card>

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="amountGiven" label="सदस्य को दी जा रही राशि" required
                  rules={[{ required: true, message: 'राशि डालें' }]}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹"
                    placeholder="0" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="paymentMode" label="भुगतान माध्यम">
                  <Select options={[
                    { label: 'नकद',   value: 'नकद' },
                    { label: 'चेक',   value: 'चेक' },
                    { label: 'ऑनलाइन', value: 'ऑनलाइन' },
                  ]} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="oldPending" label="पुरानी बकाया (कटौती)"
                  help={<span style={{ fontSize: 10 }}>क्लोजिंग बकाया से भरा गया — बदल सकते हैं</span>}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="penalty" label="पेनल्टी (कटौती)"
                  help={<span style={{ fontSize: 10 }}>
                    {penalties.length
                      ? `सदस्य की ${penalties.length} पेनल्टी, कुल ₹${penaltyTotal.toLocaleString('en-IN')} — बदल सकते हैं`
                      : 'कोई पेनल्टी नहीं — सदस्य विवरण → Penalty टैब से जोड़ें'}
                  </span>}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹" />
                </Form.Item>
              </Col>
              {Number(values.penalty || 0) > 0 && (
                <Col span={24}>
                  <Form.Item name="showPenaltyInPdf" valuePropName="checked" style={{ marginBottom: 6 }}
                    help={values.showPenaltyInPdf === false
                      ? <span style={{ fontSize: 10, color: '#d48806' }}>
                          पेनल्टी की लाइन PDF में नहीं छपेगी — नेट राशि में कटौती फिर भी रहेगी।
                        </span>
                      : null}>
                    <Checkbox>PDF में पेनल्टी दिखाएं</Checkbox>
                  </Form.Item>
                </Col>
              )}
              <Col xs={24} md={12}>
                <Form.Item label="नेट राशि (स्वतः)"
                  help={<span style={{ fontSize: 10 }}>दी जा रही राशि − पुरानी बकाया − पेनल्टी</span>}>
                  <InputNumber style={{ width: '100%', background: '#f6ffed', fontWeight: 700 }}
                    value={netAmount} disabled prefix="₹" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="paymentDone" valuePropName="checked" style={{ marginBottom: 6 }}>
                  <Checkbox>
                    <b>भुगतान हो गया</b>
                    <Text style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>
                      (राशि सदस्य को सौंप दी गई है)
                    </Text>
                  </Checkbox>
                </Form.Item>
              </Col>

              {/* Only meaningful once the money has changed hands. */}
              {values.paymentDone && (
                <Col xs={24} md={12}>
                  <Form.Item
                    name="paymentDate"
                    label="भुगतान दिनांक"
                    rules={[{ required: true, message: 'दिनांक चुनें' }]}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      format="DD-MM-YYYY"
                      // A handover cannot be in the future.
                      disabledDate={(d) => d && d > dayjs().endOf('day')}
                    />
                  </Form.Item>
                </Col>
              )}

              <Col span={24}>
                <Form.Item name="note" label="टिप्पणी">
                  <Input.TextArea rows={2} maxLength={300} showCount />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          {settlement && (
            <Alert
              type="success" showIcon
              message={<span style={{ fontSize: 12 }}>
                समापन पत्र सहेजा गया — नेट ₹{Number(settlement.netAmount || 0).toLocaleString('en-IN')}
              </span>}
              description={
                <Space size={4} wrap>
                  <Text style={{ fontSize: 11 }}>
                    {settlement.preparedAt ? dayjs(settlement.preparedAt).format('DD-MM-YYYY hh:mm A') : ''}
                  </Text>
                  <Tag style={{ fontSize: 10 }}>{settlement.paymentMode}</Tag>
                  {settlement.paymentDone
                    ? <Tag color="success" style={{ fontSize: 10 }}>
                        भुगतान हो गया{settlement.paymentDate ? ` · ${dayjs(settlement.paymentDate).format('DD-MM-YYYY')}` : ''}
                      </Tag>
                    : <Tag color="warning" style={{ fontSize: 10 }}>भुगतान बाकी</Tag>}
                  <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }}
                    loading={saving} onClick={save}>
                    बदलकर फिर सहेजें
                  </Button>
                </Space>
              }
            />
          )}
        </Space>
      )}

      <ClosingHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        member={member}
        closingDocs={docs}
        programName={programName}
      />

      {/* WhatsApp status / payment certificate — uses the SAVED settlement */}
      <ClosingStatusCard
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        member={member}
        settlement={settlement}
        programName={programName}
      />
    </Drawer>
  )
}

export default ClosingFormDrawer
