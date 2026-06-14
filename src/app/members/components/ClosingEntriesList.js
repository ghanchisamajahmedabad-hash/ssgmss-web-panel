"use client"
import React, { useState } from 'react'
import { Card, Tag, Button, Space, Spin, Table, Text, Progress, Empty } from 'antd'
import {
  MoneyCollectOutlined, FilePdfOutlined, HistoryOutlined,
  CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined
} from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import ClosingRasidPdf from './ClosingRasidPdf'
import ClosingEntryCard from './ClosingEntryCard'

const fmtDate = (d) => {
  if (!d) return '—'
  const parsed = dayjs(d)
  return parsed.isValid() ? parsed.format('DD/MM/YY') : d
}

const ClosingEntriesList = ({
  member,
  closingEntries,
  closingTransactions,
  loading,
  buildPdfData,
}) => {
  const [closingFilter, setClosingFilter] = useState('all')

  const pendingCount = closingEntries.filter(e => e.status !== 'paid').length
  const paidCount = closingEntries.filter(e => e.status === 'paid').length

  const filteredEntries = closingEntries.filter(e => {
    if (closingFilter === 'paid') return e.status === 'paid'
    if (closingFilter === 'pending') return e.status !== 'paid'
    return true
  })

  const hasClosing = (member?.closing_totalAmount || 0) > 0

  return (
    <div className="mt-4 space-y-4">
      {/* Summary cards — only here, not duplicated in header */}
      {hasClosing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { title: 'Total Closing', value: member.closing_totalAmount || 0, color: '#722ed1', prefix: '₹' },
            { title: 'Paid', value: member.closing_paidAmount || 0, color: '#52c41a', prefix: '₹' },
            { title: 'Pending', value: member.closing_pendingAmount || 0, color: (member.closing_pendingAmount || 0) > 0 ? '#ff4d4f' : '#52c41a', prefix: '₹' },
            { title: 'Events', value: `${member.paidClosingCount || 0} paid / ${member.totalClosingCount || 0} total`, color: '#1890ff', prefix: '' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-2xs text-gray-500">{s.title}</div>
              <div className="text-lg font-bold" style={{ color: s.color }}>
                {s.prefix}{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter + PDF bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg border">
        <Space>
          <Button size="small" type={closingFilter === 'all' ? 'primary' : 'default'}
            onClick={() => setClosingFilter('all')}
            style={closingFilter === 'all' ? { background: '#1B385A', borderColor: '#1B385A' } : {}}>
            All <span className="ml-1 opacity-70">({closingEntries.length})</span>
          </Button>
          <Button size="small" type={closingFilter === 'pending' ? 'primary' : 'default'}
            danger={closingFilter === 'pending'} onClick={() => setClosingFilter('pending')}
            style={closingFilter === 'pending' ? { fontWeight: 600 } : {}}>
            Pending <span className="ml-1 opacity-70">({pendingCount})</span>
          </Button>
          <Button size="small" type={closingFilter === 'paid' ? 'primary' : 'default'}
            onClick={() => setClosingFilter('paid')}
            style={closingFilter === 'paid' ? { background: '#52c41a', borderColor: '#52c41a' } : {}}>
            Paid <span className="ml-1 opacity-70">({paidCount})</span>
          </Button>
        </Space>
        {closingEntries.length > 0 && (
          <Space size={4}>
            {pendingCount > 0 && (
              <PDFDownloadLink document={<ClosingRasidPdf entries={buildPdfData(closingEntries.filter(e => e.status !== 'paid'))} />}
                fileName={`closing_pending_${member?.registrationNumber || member?.id}.pdf`}>
                {({ loading: l }) => <Button size="small" icon={<FilePdfOutlined />} loading={l}
                  style={{ background: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff', borderRadius: 6, fontWeight: 500 }}>
                  Pending PDF</Button>}
              </PDFDownloadLink>
            )}
            {paidCount > 0 && (
              <PDFDownloadLink document={<ClosingRasidPdf entries={buildPdfData(closingEntries.filter(e => e.status === 'paid'))} />}
                fileName={`closing_paid_${member?.registrationNumber || member?.id}.pdf`}>
                {({ loading: l }) => <Button size="small" icon={<FilePdfOutlined />} loading={l}
                  style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff', borderRadius: 6, fontWeight: 500 }}>
                  Paid PDF</Button>}
              </PDFDownloadLink>
            )}
            <PDFDownloadLink document={<ClosingRasidPdf entries={buildPdfData(closingEntries)} />}
              fileName={`closing_all_${member?.registrationNumber || member?.id}.pdf`}>
              {({ loading: l }) => <Button size="small" icon={<FilePdfOutlined />} loading={l}
                style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff', borderRadius: 6, fontWeight: 500 }}>
                All PDF</Button>}
            </PDFDownloadLink>
          </Space>
        )}
      </div>

      {/* Closing entries */}
      <Spin spinning={loading.entries}>
        {filteredEntries.length > 0 ? (
          <div className="space-y-2">
            {filteredEntries.map(entry => (
              <ClosingEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">
            <MoneyCollectOutlined style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.3 }} />
            {closingFilter === 'pending' ? 'No pending closing entries'
              : closingFilter === 'paid' ? 'No paid closing entries'
              : 'No closing entries found'}
          </div>
        )}
      </Spin>

      {/* Payment history table */}
      {closingTransactions.length > 0 && (
        <Card size="small" title={<span className="text-sm"><HistoryOutlined className="mr-1" />Payment History</span>}>
          <Table
            columns={[
              { title: 'Date', key: 'date', width: 120,
                render: (_, r) => <span className="text-sm">{dayjs(r.date).format('DD MMM YYYY, hh:mm A')}</span> },
              { title: 'Closing Group', key: 'cg', width: 100,
                render: (_, r) => r.closingGroupName
                  ? <Tag color="purple" style={{ fontSize: 9 }}>{r.closingGroupName}</Tag>
                  : r.closingGroupId ? <Tag style={{ fontSize: 9 }}>{r.closingGroupId.slice(-8)}</Tag> : '—' },
              { title: 'Amount', key: 'amt', width: 100,
                render: (_, r) => <span className="font-semibold text-purple-600">₹{(r.amount || r.amountPaid || 0).toLocaleString()}</span> },
              { title: 'Mode', key: 'mode', width: 70,
                render: (_, r) => <Tag color={{ cash: 'green', online: 'blue' }[r.paymentMode] || 'default'} style={{ fontSize: 9 }}>{r.paymentMode}</Tag> },
              { title: 'Txn ID', key: 'txnId', width: 110,
                render: (_, r) => <Tag style={{ fontSize: 9, fontFamily: 'monospace' }}>{r.transactionId || '—'}</Tag> },
              { title: 'Note', key: 'note',
                render: (_, r) => <span className="text-xs text-gray-500">{r.paymentNote || '—'}</span> },
            ]}
            dataSource={closingTransactions}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </Card>
      )}
    </div>
  )
}

export default ClosingEntriesList
