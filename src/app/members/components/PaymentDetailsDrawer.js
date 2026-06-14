"use client"
import React, { useState, useEffect } from 'react'
import { Drawer, Card, Tag, Table, Badge, Button, Space, Spin, Empty, Divider } from 'antd'
import {
  DollarOutlined, MoneyCollectOutlined, WalletOutlined,
  CheckCircleOutlined, FilePdfOutlined,
  CreditCardOutlined, BarcodeOutlined
} from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../../../lib/firbase-client'
import PaymentDetailsPdf from './MemberPdf/PaymentDetailsPdf'

const PaymentDetailsDrawer = ({ member, visible, onClose }) => {
  const [transactions, setTransactions] = useState([])
  const [closingTransactions, setClosingTransactions] = useState([])
  const [closingEntries, setClosingEntries] = useState([])
  const [loading, setLoading] = useState({ txn: false, closing: false, entries: false })

  useEffect(() => {
    if (member && visible) {
      fetchTransactions()
      fetchClosingTransactions()
      fetchClosingEntries()
    }
  }, [member, visible])

  const fetchTransactions = async () => {
    if (!member?.id) return
    setLoading(p => ({ ...p, txn: true }))
    try {
      const q = query(collection(db, 'memberJoinFees'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))
      if (data.length === 0 && member.joinFeesDone) {
        data.push({
          id: 'initial-join-fee',
          transactionType: 'join_fee',
          amount: member.paidAmount || 0,
          paymentMode: member.paymentMode,
          transactionId: member.joinFeesTxtId || '',
          transactionDate: member.transactionDate || member.dateJoin,
          status: 'completed',
          verified: true,
          notes: 'Initial join fee payment',
          date: member.createdAt?.toDate?.() || new Date()
        })
      }
      setTransactions(data)
    } catch (err) { console.error(err) }
    finally { setLoading(p => ({ ...p, txn: false })) }
  }

  const fetchClosingTransactions = async () => {
    if (!member?.id) return
    setLoading(p => ({ ...p, closing: true }))
    try {
      const q = query(collection(db, 'memberClosingFees'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setClosingTransactions(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() })))
    } catch (err) { console.error(err) }
    finally { setLoading(p => ({ ...p, closing: false })) }
  }

  const fetchClosingEntries = async () => {
    if (!member?.id) return
    setLoading(p => ({ ...p, entries: true }))
    try {
      const q = query(collection(db, 'closing_payment'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))
      // Look up group names for entries missing closingGroupName
      const missing = data.filter(e => !e.closingGroupName && e.closingGroupId)
      if (missing.length > 0) {
        const uniqueIds = [...new Set(missing.map(e => e.closingGroupId))]
        const nameMap = {}
        await Promise.all(uniqueIds.map(async (gid) => {
          try { const gs = await getDoc(doc(db, 'groupClosings', gid)); if (gs.exists()) nameMap[gid] = gs.data().groupName } catch (_) {}
        }))
        data.forEach(e => { if (!e.closingGroupName && e.closingGroupId && nameMap[e.closingGroupId]) e.closingGroupName = nameMap[e.closingGroupId] })
      }
      setClosingEntries(data)
    } catch (err) { console.error(err) }
    finally { setLoading(p => ({ ...p, entries: false })) }
  }

  const joinFeeTotal = transactions.reduce((s, t) => s + (t.amount || 0), 0)
  const closingTotal = closingTransactions.reduce((s, t) => s + (t.amount || t.amountPaid || 0), 0)

  const txnColumns = [
    {
      title: 'Transaction', key: 'txn', width: 200,
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.transactionType === 'join_fee' ? 'bg-blue-50' : 'bg-green-50'}`}>
            {r.transactionType === 'join_fee' ? <CheckCircleOutlined className="text-blue-600" style={{fontSize:12}} /> : <CreditCardOutlined className="text-green-600" style={{fontSize:12}} />}
          </div>
          <div>
            <div className="text-xs font-medium">{r.transactionType === 'join_fee' ? 'Join Fee' : r.transactionType === 'join_fee_approval' ? 'Approval' : 'Additional'}</div>
            <div className="text-[10px] text-gray-400">{dayjs(r.date).format('DD MMM YY, hh:mm A')}</div>
          </div>
        </div>
      ),
    },
    { title: 'Amount', key: 'amt', width: 80, render: (_, r) => <span className="font-semibold text-green-600">₹{r.amount?.toLocaleString()}</span> },
    { title: 'Mode', key: 'mode', width: 60, render: (_, r) => <Tag color={{ cash: 'green', online: 'blue' }[r.paymentMode] || 'default'} style={{fontSize:9}}>{r.paymentMode}</Tag> },
    { title: 'Status', key: 'status', width: 70, render: (_, r) => <Badge status={r.status === 'completed' ? 'success' : 'processing'} text={<span className="text-xs">{r.status}</span>} /> },
    { title: 'Txn ID', key: 'txnId', width: 100, render: (_, r) => <Tag style={{fontSize:9, fontFamily:'monospace'}}>{r.transactionId || '—'}</Tag> },
  ]

  const closingTxnColumns = [
    {
      title: 'Date', key: 'date', width: 120,
      render: (_, r) => <span className="text-xs">{dayjs(r.date).format('DD MMM YY, hh:mm A')}</span>,
    },
    { title: 'Amount', key: 'amt', width: 80, render: (_, r) => <span className="font-semibold text-purple-600">₹{(r.amount || r.amountPaid || 0).toLocaleString()}</span> },
    { title: 'Mode', key: 'mode', width: 60, render: (_, r) => <Tag color={{ cash: 'green', online: 'blue' }[r.paymentMode] || 'default'} style={{fontSize:9}}>{r.paymentMode}</Tag> },
    { title: 'Note', key: 'note', render: (_, r) => <span className="text-[10px] text-gray-500">{r.paymentNote || '—'}</span> },
  ]

  return (
    <Drawer
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <WalletOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <div className="font-bold text-base">{member?.displayName} {member?.fatherName}</div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <BarcodeOutlined /> {member?.registrationNumber}
            </div>
          </div>
        </div>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      width={700}
      destroyOnClose
      extra={
        <PDFDownloadLink
          document={<PaymentDetailsPdf member={member} transactions={transactions} closingTransactions={closingTransactions} closingEntries={closingEntries} />}
          fileName={`${member?.registrationNumber || 'member'}_payment_details.pdf`}
        >
          {({ loading: l }) => (
            <Button icon={<FilePdfOutlined />} size="small" loading={l}
              style={{ background: '#D3292F', borderColor: '#D3292F', color: '#fff' }}>
              PDF
            </Button>
          )}
        </PDFDownloadLink>
      }
    >
      <div className="space-y-4">
        {/* ── Join Fee Summary ── */}
        <Card size="small" title={<span className="text-sm"><DollarOutlined className="mr-1 text-blue-600" />Join Fee Summary</span>}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Fees',  value: member?.joinFees || 0, color: '#1890ff' },
              { label: 'Paid',        value: member?.paidAmount || 0, color: '#52c41a' },
              { label: 'Pending',     value: member?.pendingAmount || 0, color: (member?.pendingAmount || 0) > 0 ? '#ff4d4f' : '#52c41a' },
            ].map((s, i) => (
              <div key={i} className="text-center bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold" style={{ color: s.color }}>₹{s.value.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-2">
            <Tag color={member?.paymentPercentage === 100 ? 'green' : member?.paymentPercentage > 0 ? 'orange' : 'red'} style={{fontSize:10}}>
              {member?.paymentPercentage || 0}% Paid
            </Tag>
          </div>
        </Card>

        {/* ── Closing Summary ── */}
        {(member?.closing_totalAmount || 0) > 0 && (
          <Card size="small" title={<span className="text-sm"><MoneyCollectOutlined className="mr-1 text-purple-600" />Closing Summary</span>}>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',    value: member?.closing_totalAmount || 0, color: '#722ed1' },
                { label: 'Paid',     value: member?.closing_paidAmount || 0, color: '#52c41a' },
                { label: 'Pending',  value: member?.closing_pendingAmount || 0, color: (member?.closing_pendingAmount || 0) > 0 ? '#ff4d4f' : '#52c41a' },
                { label: 'Events',   value: `${member?.paidClosingCount || 0}/${member?.totalClosingCount || 0}`, color: '#1890ff' },
              ].map((s, i) => (
                <div key={i} className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.label === 'Events' ? s.value : `₹${s.value.toLocaleString()}`}</div>
                  <div className="text-[10px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Closing Entries (member wise) ── */}
        {closingEntries.length > 0 && (
          <Card size="small" title={<span className="text-sm"><MoneyCollectOutlined className="mr-1 text-purple-600" />Closing Entries</span>}>
            <Spin spinning={loading.entries}>
              <div className="space-y-2">
                {closingEntries.map(entry => {
                  const totalAmt = entry.totalAmount || 0
                  const paidAmt  = entry.paidAmount || 0
                  const isPaid   = entry.status === 'paid'
                  const isPartial = entry.status === 'partial'
                  const displayStatus = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'PENDING'
                  const statusColor   = isPaid ? '#52c41a' : isPartial ? '#faad14' : '#ff4d4f'
                  return (
                    <div key={entry.id} className="border rounded-lg p-3 bg-gray-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Tag color={isPaid ? 'green' : isPartial ? 'orange' : 'red'} style={{fontSize:9, margin:0}}>
                            {displayStatus}
                          </Tag>
                          <span className="font-semibold text-sm" style={{color: statusColor}}>
                            ₹{totalAmt.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400">({entry.closingCount || 0} members)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {(entry.closingGroupName || entry.closingGroupId) && (
                            <Tag color="purple" style={{fontSize:9, margin:0}}>{entry.closingGroupName || entry.closingGroupId.slice(-6)}</Tag>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {isPaid ? 'Paid' : isPartial ? `₹${paidAmt.toLocaleString()}/${totalAmt.toLocaleString()}` : 'Pending'}
                          </span>
                        </div>
                      </div>
                      {/* Closing members list */}
                      <div className="space-y-1">
                        {entry.closingDetails?.map((d, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded bg-white border text-xs">
                            <span className="text-gray-400 w-4 shrink-0">{i + 1}.</span>
                            <span className="font-medium min-w-[120px]">{d.closed_memberName}</span>
                            <span className="text-gray-400 hidden sm:inline text-[10px]">{d.closed_fatherName ? `• ${d.closed_fatherName}` : ''}</span>
                            <span className="text-[10px] text-gray-500 ml-auto flex items-center gap-1">
                              <span className="text-gray-400">Reg:</span>
                              <span className="font-mono font-medium">{d.closed_registrationNumber || entry.closing_registrationNumber || entry.registrationNumber || '—'}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Spin>
          </Card>
        )}

        <Divider style={{margin: '8px 0'}} />

        {/* ── Join Fee Transactions ── */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold"><DollarOutlined className="mr-1 text-blue-600" />Join Fee Transactions</span>
            <span className="text-xs text-gray-400">{transactions.length} records · ₹{joinFeeTotal.toLocaleString()}</span>
          </div>
          <Spin spinning={loading.txn}>
            {transactions.length > 0 ? (
              <Table columns={txnColumns} dataSource={transactions} rowKey="id" size="small" pagination={false} />
            ) : (
              <Empty description="No join fee transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Spin>
        </div>

        {/* ── Closing Transactions ── */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold"><MoneyCollectOutlined className="mr-1 text-purple-600" />Closing Transactions</span>
            <span className="text-xs text-gray-400">{closingTransactions.length} records · ₹{closingTotal.toLocaleString()}</span>
          </div>
          <Spin spinning={loading.closing}>
            {closingTransactions.length > 0 ? (
              <Table columns={closingTxnColumns} dataSource={closingTransactions} rowKey="id" size="small" pagination={false} />
            ) : (
              <Empty description="No closing transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Spin>
        </div>
      </div>
    </Drawer>
  )
}

export default PaymentDetailsDrawer
