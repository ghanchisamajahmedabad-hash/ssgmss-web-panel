"use client"
import React, { useState, useEffect } from 'react'
import {
  Drawer, Row, Col, Avatar, Tag, Descriptions, Card, Table, Tabs,
  Image, Space, Typography, Button, Divider, Badge, Progress, Tooltip,
  Statistic, Empty, Modal, Form, Radio, Select, Input, InputNumber, DatePicker, message
} from 'antd'
import {
  UserOutlined, PhoneOutlined, IdcardOutlined, HomeOutlined,
  WalletOutlined, FileTextOutlined, SafetyOutlined,
  TeamOutlined, EnvironmentOutlined, MailOutlined,
  DownloadOutlined, EyeOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CreditCardOutlined,
  InfoCircleOutlined, FilePdfOutlined,
  EditOutlined, PrinterOutlined, DollarOutlined,
  PercentageOutlined, FileDoneOutlined, ProfileOutlined,
  BarcodeOutlined,
  BookOutlined, TrophyOutlined, ScheduleOutlined,
  SolutionOutlined, CrownOutlined,
  AppstoreOutlined,
  PlusOutlined, MoneyCollectOutlined, CalculatorOutlined,
  UploadOutlined, FilterOutlined,
  SwapOutlined,
  UserSwitchOutlined
} from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import PaymentHistoryPdf from './MemberPdf/PaymentHistoryPdf'
import MemberDetailsPdf from './MemberPdf/MemberDetailsPdf'
import ClosingRasidPdf from './ClosingRasidPdf'
import ClosingEntriesList from './ClosingEntriesList'
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { db } from '../../../../lib/firbase-client'
import { useAuth } from '@/components/Base/AuthProvider'

dayjs.extend(relativeTime)

const { Title, Text } = Typography

const MemberDetailDrawer = ({ member, visible, onClose, programList, agentList, onPaymentSuccess }) => {
  const { user } = useAuth()
  const [paymentForm] = Form.useForm()

  const [transactions,        setTransactions]        = useState([])
  const [closingTransactions, setClosingTransactions] = useState([])
  const [closingEntries,      setClosingEntries]       = useState([])
  const [programData,         setProgramData]          = useState(null)   // single object
  const [loading,             setLoading]              = useState({ transactions: false, closing: false, program: false, entries: false })
  const [previewVisible,      setPreviewVisible]       = useState(false)
  const [previewImage,        setPreviewImage]          = useState('')
  const [activeTab,           setActiveTab]             = useState('overview')

  // ── Quick Payment modal state ────────────────────────────────────────────────
  const [paymentModalVisible, setPaymentModalVisible] = useState(false)
  const [paymentType,         setPaymentType]         = useState('joinFee')   // 'joinFee' | 'closing'
  const [paymentSubmitting,   setPaymentSubmitting]   = useState(false)
  const [selectedClosingGroup, setSelectedClosingGroup] = useState(null)

  const pendingClosingEntries = closingEntries.filter(e => e.status === 'pending' || e.status === 'partial')

  const openPaymentModal = (type = 'joinFee') => {
    setPaymentType(type)
    setSelectedClosingGroup(null)
    paymentForm.resetFields()
    paymentForm.setFieldsValue({
      paymentMode: 'cash',
      paymentDate: dayjs(),
      amount: type === 'joinFee' ? (member?.pendingAmount || 0) : 0,
    })
    setPaymentModalVisible(true)
  }

  const handlePaymentTypeChange = (type) => {
    setPaymentType(type)
    setSelectedClosingGroup(null)
    paymentForm.setFieldsValue({
      amount: type === 'joinFee' ? (member?.pendingAmount || 0) : 0,
    })
  }

  const handleClosingGroupSelect = (groupId) => {
    const entry = pendingClosingEntries.find(e => e.closingGroupId === groupId || e.id === groupId)
    setSelectedClosingGroup(entry)
    const pending = entry ? Math.max(0, (entry.totalAmount || 0) - (entry.paidAmount || 0)) : 0
    paymentForm.setFieldsValue({ amount: pending })
  }

  const handleSubmitPayment = async () => {
    try {
      const values = await paymentForm.validateFields()
      setPaymentSubmitting(true)

      const auth = getAuth()
      const token = await auth.currentUser?.getIdToken()
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

      const paymentDate = values.paymentDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD')
      const agentId = member?.agentId || ''

      let res, data
      if (paymentType === 'joinFee') {
        res = await fetch('/api/join-fees-add', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            agentId,
            totalAmount:    values.amount,
            paymentMethod:  values.paymentMode,
            paymentDate,
            paymentNote:    values.paymentNote || '',
            transactionId:  values.transactionId || '',
            memberPayments: [{ memberId: member.id, memberName: member.displayName, amount: values.amount }],
          }),
        })
      } else {
        // Closing payment — requires a selected closing group
        if (!selectedClosingGroup) { message.error('Please select a closing group'); setPaymentSubmitting(false); return }
        const closingGroupId = selectedClosingGroup.closingGroupId || selectedClosingGroup.id?.split('_')[1]
        res = await fetch('/api/closed_payment_update', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            agentId,
            totalAmount:     values.amount,
            paymentMethod:   values.paymentMode,
            paymentDate,
            paymentNote:     values.paymentNote || '',
            transactionId:   values.transactionId || '',
            closingPayments: [{ memberId: member.id, memberName: member.displayName, amount: values.amount, closingGroupId }],
          }),
        })
      }

      data = await res.json()
      if (data.success) {
        message.success(paymentType === 'joinFee' ? 'Join fee payment added!' : 'Closing payment added!')
        setPaymentModalVisible(false)
        // Refresh transactions in drawer
        fetchTransactions()
        fetchClosingTransactions()
        fetchClosingEntries()
        // Notify parent to refresh member row in table
        if (onPaymentSuccess) onPaymentSuccess(member.id)
      } else {
        message.error(data.message || 'Payment failed')
      }
    } catch (err) {
      if (err?.errorFields) return // form validation
      message.error('Network error')
    } finally {
      setPaymentSubmitting(false)
    }
  }


  useEffect(() => {
    if (member && visible) {
      setActiveTab('overview')
      fetchTransactions()
      fetchClosingTransactions()
      fetchClosingEntries()
      fetchProgramData()
    }
  }, [member, visible])

  // ── Fetch program details from programs collection ─────────────────────────
  const fetchProgramData = async () => {
    if (!member?.programId) { setProgramData(null); return }
    setLoading(prev => ({ ...prev, program: true }))
    try {
      const snap = await getDoc(doc(db, 'programs', member.programId))
      if (snap.exists()) setProgramData({ id: snap.id, ...snap.data() })
      else setProgramData(null)
    } catch (err) {
      console.error('Error fetching program:', err)
    } finally {
      setLoading(prev => ({ ...prev, program: false }))
    }
  }

  const fetchTransactions = async () => {
    if (!member?.id) return
    setLoading(prev => ({ ...prev, transactions: true }))
    try {
      const q    = query(collection(db, 'memberJoinFees'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))

      // If no transactions but member has joinFeesDone, synthesize one
      if (data.length === 0 && member.joinFeesDone) {
        data.push({
          id: 'initial-join-fee',
          transactionType:  'join_fee',
          amount:           member.paidAmount || 0,
          paymentMode:      member.paymentMode,
          transactionId:    member.joinFeesTxtId || '',
          transactionDate:  member.transactionDate || member.dateJoin,
          status:           'completed',
          verified:         true,
          notes:            'Initial join fee payment',
          date:             member.createdAt?.toDate?.() || new Date()
        })
      }
      setTransactions(data)
    } catch (err) {
      console.error('Error fetching transactions:', err)
    } finally {
      setLoading(prev => ({ ...prev, transactions: false }))
    }
  }

  const fetchClosingTransactions = async () => {
    if (!member?.id) return
    setLoading(prev => ({ ...prev, closing: true }))
    try {
      const q    = query(collection(db, 'memberClosingFees'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))
      setClosingTransactions(data)
    } catch (err) {
      console.error('Error fetching closing transactions:', err)
    } finally {
      setLoading(prev => ({ ...prev, closing: false }))
    }
  }

  const fetchClosingEntries = async () => {
    if (!member?.id) return
    setLoading(prev => ({ ...prev, entries: true }))
    try {
      const q    = query(collection(db, 'closing_payment'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))

      // Look up group names for entries that don't have closingGroupName stored
      const missing = data.filter(e => !e.closingGroupName && e.closingGroupId)
      if (missing.length > 0) {
        const uniqueIds = [...new Set(missing.map(e => e.closingGroupId))]
        const nameMap = {}
        await Promise.all(uniqueIds.map(async (gid) => {
          try {
            const gs = await getDoc(doc(db, 'groupClosings', gid))
            if (gs.exists()) nameMap[gid] = gs.data().groupName
          } catch (_) {}
        }))
        data.forEach(e => {
          if (!e.closingGroupName && e.closingGroupId && nameMap[e.closingGroupId])
            e.closingGroupName = nameMap[e.closingGroupId]
        })
      }

      setClosingEntries(data)
    } catch (err) {
      console.error('Error fetching closing entries:', err)
    } finally {
      setLoading(prev => ({ ...prev, entries: false }))
    }
  }

  const handlePreview = (url) => { window.open(url, '_blank') }

  // ── Payment stats from flat member fields ──────────────────────────────────
  const paymentStats = [
    { title: 'Total Join Fees', value: member?.joinFees || 0,          prefix: '₹', color: '#1890ff', icon: <WalletOutlined />,       description: 'Program join fees' },
    { title: 'Paid Amount',     value: member?.paidAmount || 0,        prefix: '₹', color: '#52c41a', icon: <CheckCircleOutlined />,   description: 'Amount received' },
    { title: 'Pending Amount',  value: member?.pendingAmount || 0,     prefix: '₹', color: (member?.pendingAmount || 0) > 0 ? '#ff4d4f' : '#52c41a', icon: <ClockCircleOutlined />, description: 'Balance to be paid' },
    { title: 'Payment Progress',value: member?.paymentPercentage || 0, prefix: '',  suffix: '%', color: member?.paymentPercentage === 100 ? '#52c41a' : member?.paymentPercentage > 0 ? '#faad14' : '#ff4d4f', icon: <PercentageOutlined />, description: 'Completion' },
  ]



  const documents = [
    { type: 'Member Photo',            url: member?.photoURL,            icon: <UserOutlined />,    color: '#1890ff', required: true  },
    { type: 'Nominee / Varisdar Photo', url: member?.guardianPhotoURL,    icon: <SafetyOutlined />,  color: '#52c41a', required: true  },
    { type: 'Member Document (Front)', url: member?.documentFrontURL,    icon: <IdcardOutlined />,  color: '#faad14', required: true  },
    { type: 'Member Document (Back)',  url: member?.documentBackURL,     icon: <IdcardOutlined />,  color: '#fadb14', required: false },
    { type: 'Nominee / Varisdar Document', url: member?.guardianDocumentURL, icon: <ProfileOutlined />, color: '#722ed1', required: true  },
  ]

  const getAgeGroupColor = (g) => ({ minor: '#ff7875', adult: '#1890ff', senior: '#722ed1' }[g?.toLowerCase()] || '#d9d9d9')
  const getAgeGroupIcon  = (g) => ({ minor: <SolutionOutlined />, adult: <UserOutlined />, senior: <CrownOutlined /> }[g?.toLowerCase()] || <UserOutlined />)

  // ── Single-program card ────────────────────────────────────────────────────
  const renderProgramCard = () => {
    if (!member?.programId) return <Empty description="No program enrolled" image={Empty.PRESENTED_IMAGE_SIMPLE} />

    const pct        = member.paymentPercentage || 0
    const progName   = programData?.name || member.programName || member.programId

    return (
      <Card size="small" className="mb-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <TrophyOutlined className="text-blue-600 text-lg" />
          </div>
          <div className="flex-grow">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-base">{progName}</span>
              {member.ageGroupName && <Tag color="blue" size="small">{member.ageGroupName}</Tag>}
              <Tag color={pct === 100 ? 'green' : pct > 0 ? 'orange' : 'red'} className="font-medium">
                {pct === 100 ? 'FULLY PAID' : pct > 0 ? 'PARTIAL' : 'PENDING'}
              </Tag>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-3">
              {member.periodStartDate && (
                <div><span className="font-medium">Period:</span> {member.periodStartDate} → {member.periodEndDate}</div>
              )}
              {member.memberGroupName && (
                <div><span className="font-medium">Group:</span> <Tag color="cyan" size="small">{member.memberGroupName}</Tag></div>
              )}
              <div><span className="font-medium">Join Date:</span> {member.dateJoin}</div>
              <div><span className="font-medium">Pay Amount:</span> ₹{member.payAmount || 0}/month</div>
            </div>

            <Progress
              percent={pct}
              strokeColor={pct === 100 ? '#52c41a' : pct > 0 ? '#faad14' : '#ff4d4f'}
              size="small"
            />
            <div className="flex gap-6 mt-2 text-sm">
              <span><Text type="secondary">Join Fees:</Text> <Text strong>₹{member.joinFees || 0}</Text></span>
              <span><Text type="secondary">Paid:</Text> <Text strong style={{ color: '#52c41a' }}>₹{member.paidAmount || 0}</Text></span>
              <span><Text type="secondary">Pending:</Text> <Text strong style={{ color: (member.pendingAmount || 0) > 0 ? '#ff4d4f' : '#52c41a' }}>₹{member.pendingAmount || 0}</Text></span>
            </div>

            {/* Latest payment method + transaction ID */}
            {(() => {
              const latestTx = transactions[0]
              const mode = latestTx?.paymentMode  || member.paymentMode
              const txId = latestTx?.transactionId || member.joinFeesTxtId
              if (!mode && !txId) return null
              return (
                <div className="flex gap-3 mt-2 items-center flex-wrap">
                  {mode && (
                    <Tag
                      color={mode === 'cash' ? 'green' : 'blue'}
                      style={{ textTransform: 'uppercase', fontWeight: 600, margin: 0 }}
                    >
                      {mode === 'cash' ? '💵 Cash' : '🌐 Online'}
                    </Tag>
                  )}
                  {txId && (
                    <Text
                      copyable
                      style={{ fontSize: 11, fontFamily: 'monospace', color: '#db2777', background: '#fff0f6', padding: '2px 8px', borderRadius: 4 }}
                    >
                      {txId}
                    </Text>
                  )}
                </div>
              )
            })()}

          </div>
        </div>
      </Card>
    )
  }

  // ── Transaction columns ────────────────────────────────────────────────────
  const transactionColumns = [
    {
      title: 'Transaction', key: 'transaction', width: 250,
      render: (_, r) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${r.transactionType === 'join_fee' ? 'bg-blue-50' : 'bg-green-50'}`}>
              {r.transactionType === 'join_fee' ? <CheckCircleOutlined className="text-blue-600" /> : <CreditCardOutlined className="text-green-600" />}
            </div>
            <div>
              <div className="font-semibold">
                {r.transactionType === 'join_fee' ? 'Join Fee Payment' : r.transactionType === 'join_fee_approval' ? 'Approval Payment' : 'Additional Payment'}
              </div>
              <div className="text-xs text-gray-500">{dayjs(r.date).format('DD MMM YYYY, hh:mm A')}</div>
            </div>
          </div>
          {r.notes && <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">{r.notes}</div>}
        </div>
      ),
    },
    {
      title: 'Amount & Mode', key: 'amt', width: 150,
      render: (_, r) => (
        <div className="space-y-2">
          <div className="text-2xl font-bold text-green-600">₹{r.amount?.toLocaleString()}</div>
          <Tag color={{ cash: 'green', online: 'blue', cheque: 'purple' }[r.paymentMode] || 'default'} className="uppercase">
            {r.paymentMode}
          </Tag>
          {r.transactionId && <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">Txn: {r.transactionId}</div>}
        </div>
      ),
    },
    {
      title: 'Status', key: 'status', width: 120,
      render: (_, r) => (
        <div className="space-y-2">
          <Badge status={r.status === 'completed' ? 'success' : 'processing'}
            text={<span className={`font-medium ${r.status === 'completed' ? 'text-green-600' : 'text-orange-600'}`}>{r.status?.toUpperCase()}</span>} />
          {r.verified && <Tag color="green" icon={<CheckCircleOutlined />} size="small">Verified</Tag>}
        </div>
      ),
    },
  ]

  // ── Closing transaction columns ──────────────────────────────────────────────
  const closingTransactionColumns = [
    {
      title: 'Transaction', key: 'transaction', width: 280,
      render: (_, r) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-purple-50">
              <MoneyCollectOutlined className="text-purple-600" style={{ fontSize: 14 }} />
            </div>
            <div>
              <div className="font-semibold text-sm">Closing Payment</div>
              <div className="text-xs text-gray-500">{dayjs(r.date).format('DD MMM YYYY, hh:mm A')}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            <Tag style={{ fontSize: 10, margin: 0 }} color="purple">{r.groupId?.slice(-6) || '—'}</Tag>
            {r.programName && <Tag style={{ fontSize: 10, margin: 0 }} color="pink">{r.programName}</Tag>}
          </div>
          {r.paymentNote && <div className="text-xs text-gray-500 bg-gray-50 p-1.5 rounded mt-1">{r.paymentNote}</div>}
        </div>
      ),
    },
    {
      title: 'Amount & Mode', key: 'amt', width: 140,
      render: (_, r) => (
        <div>
          <div className="text-lg font-bold text-purple-600">₹{(r.amount || r.amountPaid || 0).toLocaleString()}</div>
          <Tag color={{ cash: 'green', online: 'blue', cheque: 'purple' }[r.paymentMode] || 'default'} className="uppercase" style={{ fontSize: 10 }}>
            {r.paymentMode}
          </Tag>
          {r.transactionId && <div className="text-2xs font-mono bg-gray-100 px-1.5 py-0.5 rounded mt-1 truncate max-w-[130px]" title={r.transactionId}>ID: {r.transactionId}</div>}
        </div>
      ),
    },
    {
      title: 'Date', key: 'txnDate', width: 100,
      render: (_, r) => (
        <div className="text-sm">{r.transactionDate || dayjs(r.date).format('DD/MM/YYYY')}</div>
      ),
    },
  ]

  const buildPdfData = (entries) => entries.map(entry => ({
    id: entry.id,
    displayName: entry.closing_Name || member?.displayName || '',
    fatherName: entry.closing_fatherName || member?.fatherName || '',
    surname: member?.surname || '',
    registrationNumber: entry.closing_registrationNumber || member?.registrationNumber || '',
    phone: entry.closingPhone || member?.phone || '',
    village: entry.closing_village || member?.village || '',
    programName: entry.programName || member?.programName || '',
    ageGroupName: member?.ageGroupName || '',
    totalAmount: entry.totalAmount || 0,
    date: entry.date,
    status: entry.status,
    closingGroupId:   entry.closingGroupId   || '',
    closingGroupName: entry.closingGroupName || '',
    entries: entry.closingDetails || [],
    closing_registrationNumber: entry.closing_registrationNumber || null,
    closingPhone: entry.closingPhone || null,
  }))

  return (
    <>
      <Drawer
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar src={member?.photoURL} size={44} icon={<UserOutlined />} className="border-2 border-blue-500" />
              <div>
                <div className="font-bold text-lg">{member?.displayName} {member?.fatherName}</div>
                <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                  <BarcodeOutlined /> {member?.registrationNumber}
                  {member?.ageGroupName && <Tag color="blue" style={{fontSize:10, margin:0}}>{member.ageGroupName}</Tag>}
                </div>
              </div>
            </div>
            <Badge status={member?.active_flag ? 'success' : 'error'} text={member?.active_flag ? 'Active' : 'Inactive'} />
          </div>
        }
        placement="right"
        onClose={onClose}
        open={visible}
        width={1000}
        destroyOnClose
        extra={
          <Space size={4}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => openPaymentModal('joinFee')}
            >
              Add Payment
            </Button>
            <PDFDownloadLink
              document={<MemberDetailsPdf member={member} />}
              fileName={`${member?.registrationNumber || 'member'}_details.pdf`}
            >
              {({ loading }) => (
                <Button icon={<FilePdfOutlined />} size="small" loading={loading}
                  style={{ background: '#1B385A', borderColor: '#1B385A', color: '#fff' }}>
                  Profile
                </Button>
              )}
            </PDFDownloadLink>
            <PDFDownloadLink
              document={<PaymentHistoryPdf member={member} transactions={transactions} closingTransactions={closingTransactions} />}
              fileName={`${member?.registrationNumber || 'member'}_payment_history.pdf`}
            >
              {({ loading: pdfLoading }) => (
                <Button icon={<FilePdfOutlined />} size="small" loading={pdfLoading}
                  style={{ background: '#D3292F', borderColor: '#D3292F', color: '#fff' }}
                  disabled={!transactions.length && !closingTransactions.length}>
                  Payments
                </Button>
              )}
            </PDFDownloadLink>
          </Space>
        }
      >
        {/* Join Fee stats — compact */}
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {paymentStats.map((s, i) => (
            <div key={i} className="bg-white rounded-lg border p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${s.color}15` }}>
                {React.cloneElement(s.icon, { style: { color: s.color, fontSize: '16px' } })}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xs text-gray-500 truncate">{s.title}</div>
                <div className="text-base font-bold" style={{ color: s.color }}>
                  {s.prefix}{s.value?.toLocaleString()}{s.suffix}
                </div>
                <div className="text-2xs text-gray-400 truncate">{s.description}</div>
              </div>
            </div>
          ))}
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'overview',     label: <span><UserOutlined /> Overview</span> },
          { key: 'program',      label: <span><TrophyOutlined /> Program</span> },
          { key: 'transactions', label: <span><CreditCardOutlined /> Transactions ({transactions.length + closingTransactions.length})</span> },
          { key: 'closing', label: <span><MoneyCollectOutlined /> Closing</span> },
          { key: 'documents',    label: <span><FileTextOutlined /> Documents ({documents.filter(d=>d.url).length}/{documents.length})</span> },
        ]} />

        {/* ── Overview ────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="mt-4 space-y-4">
            <Row gutter={[16, 16]}>
              {/* Personal info */}
              <Col xs={24} lg={12}>
                <Card size="small" title={<span className="text-sm"><UserOutlined className="text-blue-600 mr-2" />Personal Information</span>} className="h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar src={member?.photoURL} size={80} icon={<UserOutlined />} className="border-2 border-blue-500" />
                    <div>
                      <div className="font-bold text-xl">{member?.displayName}</div>
                      <div className="text-gray-500">{member?.fatherName}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Tag color="blue">{member?.surname}</Tag>
                        <Tag color={member?.marriage_flag ? 'purple' : 'cyan'}>{member?.marriage_flag ? 'Married' : 'Single'}</Tag>
                        <Tag style={{ color: getAgeGroupColor(member?.ageGroup), borderColor: getAgeGroupColor(member?.ageGroup) }}>
                          {member?.ageGroup?.toUpperCase()}
                        </Tag>
                      </div>
                    </div>
                  </div>
                  <Row gutter={[8, 8]}>
                    <Col span={12}><div className="text-sm text-gray-500">Age</div><div className="font-semibold">{member?.age} years</div></Col>
                    <Col span={12}><div className="text-sm text-gray-500">DOB</div><div className="font-semibold">{member?.dobDate}</div></Col>
                    <Col span={12}><div className="text-sm text-gray-500">Caste</div><div className="font-semibold">{member?.caste}</div></Col>
                    <Col span={12}>
                      <div className="text-sm text-gray-500">Gender</div>
                      {member?.gender
                        ? <Tag color={member.gender === 'male' ? 'blue' : member.gender === 'female' ? 'magenta' : 'default'} style={{ marginTop: 2, textTransform: 'capitalize', fontWeight: 600 }}>
                            {member.gender === 'male' ? '♂ Male' : member.gender === 'female' ? '♀ Female' : 'Other'}
                          </Tag>
                        : <span className="font-semibold text-gray-400">—</span>
                      }
                    </Col>
                    <Col span={24}>
                      <div className="text-sm text-gray-500">Aadhaar</div>
                      <div className="font-semibold flex items-center gap-2"><IdcardOutlined className="text-green-600" />{member?.aadhaarNo || 'Not Provided'}</div>
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* Contact & Address */}
              <Col xs={24} lg={12}>
                <Card size="small" title={<span className="text-sm"><HomeOutlined className="text-green-600 mr-2" />Contact & Address</span>} className="h-full">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3"><PhoneOutlined className="text-blue-600" /><div><div className="font-semibold">{member?.phone}</div><div className="text-xs text-gray-500">Primary</div></div></div>
                    {member?.phoneAlt && <div className="flex items-center gap-3 ml-6"><PhoneOutlined className="text-gray-400 text-sm" /><div className="text-gray-700">{member.phoneAlt}</div></div>}
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="font-semibold mb-1">{member?.currentAddress}</div>
                      <div className="grid grid-cols-2 gap-1 text-sm text-gray-600">
                        <div><b>Village:</b> {member?.village}</div>
                        <div><b>City:</b> {member?.city}</div>
                        <div><b>District:</b> {member?.district}</div>
                        <div><b>State:</b> {member?.state}</div>
                        <div><b>Pin:</b> {member?.pinCode}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>

              {/* Nominee / Varisdar */}
              <Col xs={24}>
                <Card size="small" title={<span className="text-sm"><SafetyOutlined className="text-orange-600 mr-2" />Nominee / Varisdar Details</span>}>
                  <div className="flex items-start gap-4">
                    <Avatar src={member?.guardianPhotoURL} size={70} icon={<UserOutlined />} className="border-2 border-orange-500" />
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Nominee / Varisdar</div>
                      <div className="font-bold text-lg">{member?.guardian || '—'}</div>
                      <div className="text-gray-600 text-sm">{member?.guardianRelation || '—'}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            {/* Agent / Added By info */}
            {(() => {
              const agent = agentList?.find(a => a.id === member?.agentId || a.uid === member?.agentId)
              const isAgent = !!agent
              return (
                <Card size="small" title={<span className="text-sm"><UserSwitchOutlined className="text-indigo-600 mr-2" />{isAgent ? 'Agent Details' : 'Added By'}</span>}>
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={agent?.photoURL}
                      size={44}
                      icon={isAgent ? <UserSwitchOutlined /> : <UserOutlined />}
                      style={{ backgroundColor: isAgent ? '#1890ff' : '#722ed1', flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base leading-tight">
                        {agent?.name || member?.addedByName || (member?.addedBy === 'admin' ? 'Admin' : 'Unknown')}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Tag color={isAgent ? 'blue' : 'purple'} style={{ fontSize: 10, margin: 0 }}>
                          {isAgent ? 'Agent' : 'Admin'}
                        </Tag>
                        {member?.createdAt && (
                          <span className="text-xs text-gray-400">
                            Joined {dayjs(member.createdAt?.toDate?.() || member.createdAt).format('DD MMM YYYY')}
                          </span>
                        )}
                      </div>
                      {isAgent && (
                        <div className="mt-2 space-y-1">
                          {(agent.phone1 || agent.phone) && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <PhoneOutlined className="text-blue-500 text-xs" />
                              <span>{agent.phone1 || agent.phone}</span>
                            </div>
                          )}
                          {agent.phone2 && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <PhoneOutlined className="text-gray-400 text-xs" />
                              <span>{agent.phone2}</span>
                            </div>
                          )}
                          {(agent.village || agent.area) && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <EnvironmentOutlined className="text-green-500 text-xs" />
                              <span>{[agent.village, agent.area, agent.district].filter(Boolean).join(', ')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })()}

            {/* Program summary on overview */}
            <Card size="small" title={<span className="text-sm"><TrophyOutlined className="text-purple-600 mr-2" />Program</span>}>
              {renderProgramCard()}
            </Card>
          </div>
        )}

        {/* ── Program Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'program' && (
          <div className="mt-4">
            <Card size="small">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold">Enrolled Program</span>
              </div>
              {renderProgramCard()}

              {/* Financial breakdown — Join Fees */}
              {member?.programId && (
                <div className="mt-4 pt-4 border-t">
                  <span className="font-semibold text-sm mb-3 block"><DollarOutlined className="mr-1" />Financial Summary — Join Fees</span>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Fees',   value: member.joinFees    || 0, color: '#1890ff' },
                      { label: 'Paid',         value: member.paidAmount  || 0, color: '#52c41a' },
                      { label: 'Pending',      value: member.pendingAmount || 0, color: (member.pendingAmount||0) > 0 ? '#ff4d4f' : '#52c41a' },
                    ].map((item, i) => (
                      <div key={i} className="text-center bg-gray-50 rounded-lg p-3">
                        <div className="text-lg font-bold" style={{ color: item.color }}>₹{item.value.toLocaleString()}</div>
                        <div className="text-2xs text-gray-500">{item.label}</div>
                        <Progress percent={member.joinFees ? Math.round((item.value / member.joinFees) * 100) : 0} showInfo={false} strokeColor={item.color} size="small" className="mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}


            </Card>
          </div>
        )}

        {/* ── Transactions Tab ─────────────────────────────────────────────── */}
        {activeTab === 'transactions' && (
          <div className="mt-4 space-y-6">
            {/* ── Join-Fee Transactions ── */}
            <Card size="small">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-sm"><DollarOutlined className="text-blue-600 mr-1" />Join Fee Transactions</span>
                <Text type="secondary" style={{ fontSize: 11 }}>{transactions.length} record(s) • ₹{member?.paidAmount?.toLocaleString()} paid</Text>
              </div>

              {transactions.length > 0 ? (
                <Table columns={transactionColumns} dataSource={transactions} rowKey="id"
                  loading={loading.transactions} pagination={false} size="small" />
              ) : (
                <Empty description="No join-fee transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              {transactions.length > 0 && (
                <div className="mt-3 pt-3 border-t flex gap-4 flex-wrap text-xs text-gray-500">
                  <span>Total: <b>{transactions.length} txn</b></span>
                  <span>Amount: <b className="text-blue-600">₹{transactions.reduce((s,t) => s+(t.amount||0), 0).toLocaleString()}</b></span>
                  <span>Last: {transactions[0] ? dayjs(transactions[0].date).format('DD MMM YYYY') : 'N/A'}</span>
                  <span>Status:
                    <Badge status={member?.paymentPercentage === 100 ? 'success' : 'warning'}
                      text={<span style={{fontSize:11}}>{member?.paymentPercentage === 100 ? 'Fully Paid' : 'Partially Paid'}</span>} />
                  </span>
                  <span>Methods:
                    {Object.entries(
                      transactions.reduce((acc, t) => {
                        const m = t.paymentMode?.toLowerCase() || 'unknown'
                        acc[m] = (acc[m] || 0) + 1; return acc
                      }, {})
                    ).map(([mode, count], i) => (
                      <Tag key={i} color={{ cash:'green', online:'blue', cheque:'purple' }[mode] || 'default'}>
                        {mode} ×{count}
                      </Tag>
                    ))}
                  </span>
                </div>
              )}
            </Card>

            {/* ── Closing Transactions ── */}
            <Card size="small">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-sm"><MoneyCollectOutlined className="text-purple-600 mr-1" />Closing Payment Transactions</span>
                <Text type="secondary" style={{ fontSize: 11 }}>{closingTransactions.length} record(s) • ₹{member?.closing_paidAmount?.toLocaleString()} paid</Text>
              </div>

              {closingTransactions.length > 0 ? (
                <Table columns={closingTransactionColumns} dataSource={closingTransactions} rowKey="id"
                  loading={loading.closing} pagination={false} size="small" />
              ) : (
                <Empty description="No closing transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              {closingTransactions.length > 0 && (
                <div className="mt-3 pt-3 border-t flex gap-4 flex-wrap text-xs text-gray-500">
                  <span>Total: <b>{closingTransactions.length} txn</b></span>
                  <span>Amount: <b className="text-purple-600">₹{closingTransactions.reduce((s,t) => s+(t.amount||t.amountPaid||0), 0).toLocaleString()}</b></span>
                  <span>Last: {closingTransactions[0] ? dayjs(closingTransactions[0].date).format('DD MMM YYYY') : 'N/A'}</span>
                  <span>Status:
                    <Badge status={(member?.closing_pendingAmount || 0) === 0 ? 'success' : 'warning'}
                      text={<span style={{fontSize:11}}>{(member?.closing_pendingAmount || 0) === 0 ? 'Fully Paid' : 'Pending'}</span>} />
                  </span>
                  <span>Methods:
                    {Object.entries(
                      closingTransactions.reduce((acc, t) => {
                        const m = t.paymentMode?.toLowerCase() || 'unknown'
                        acc[m] = (acc[m] || 0) + 1; return acc
                      }, {})
                    ).map(([mode, count], i) => (
                      <Tag key={i} color={{ cash:'green', online:'blue', cheque:'purple' }[mode] || 'default'} style={{fontSize:9, margin:0, marginLeft:4}}>
                        {mode} ×{count}
                      </Tag>
                    ))}
                  </span>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Closing Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'closing' && (
          <ClosingEntriesList
            member={member}
            closingEntries={closingEntries}
            closingTransactions={closingTransactions}
            loading={loading}
            buildPdfData={buildPdfData}
          />
        )}

        {/* ── Documents Tab ────────────────────────────────────────────────── */}
        {activeTab === 'documents' && (
          <div className="mt-2">
            <Card>
              <Row gutter={[16, 16]}>
                {documents.map((docItem, i) => (
                  <Col xs={24} sm={12} md={8} key={i}>
                    <Card className="h-full" bodyStyle={{ padding: 0 }}>
                      <div className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${docItem.color}15` }}>
                            {React.cloneElement(docItem.icon, { style: { color: docItem.color, fontSize: '20px' } })}
                          </div>
                          <div className="flex-grow">
                            <div className="font-semibold">{docItem.type}</div>
                            <div className="text-xs text-gray-500">{docItem.required ? 'Required' : 'Optional'}</div>
                          </div>
                          {docItem.url
                            ? <Badge status="success" text="Uploaded" />
                            : <Badge status="warning" text="Pending" />}
                        </div>
                        {docItem.url ? (
                          <div className="w-full h-40 border rounded-lg overflow-hidden cursor-pointer hover:opacity-90" onClick={() => handlePreview(docItem.url)}>
                            {docItem.url.includes('.pdf') ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                                <FilePdfOutlined className="text-4xl text-red-500" />
                                <div className="text-sm mt-2">PDF Document</div>
                              </div>
                            ) : (
                              <Image src={docItem.url} alt={docItem.type} className="w-full h-full object-cover" preview={false} />
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <FileTextOutlined className="text-3xl text-gray-300 mb-3" />
                            <div className="text-gray-500">Not uploaded</div>
                            <Button type="dashed" size="small" icon={<UploadOutlined />} className="mt-3">Upload</Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </div>
        )}
      </Drawer>

      {/* ── Quick Payment Modal ─────────────────────────────────────────────── */}
      <Modal
        open={paymentModalVisible}
        title={
          <div className="flex items-center gap-2">
            <DollarOutlined style={{ color: '#52c41a' }} />
            <span>Add Payment — {member?.displayName}</span>
          </div>
        }
        onCancel={() => setPaymentModalVisible(false)}
        onOk={handleSubmitPayment}
        okText="Submit Payment"
        okButtonProps={{ loading: paymentSubmitting, style: { background: '#52c41a', borderColor: '#52c41a' } }}
        cancelText="Cancel"
        width={500}
        destroyOnClose
      >
        {/* Payment type selector */}
        <div className="mb-4">
          <Radio.Group
            value={paymentType}
            onChange={e => handlePaymentTypeChange(e.target.value)}
            buttonStyle="solid"
            style={{ width: '100%' }}
          >
            <Radio.Button value="joinFee" style={{ width: '50%', textAlign: 'center' }}>
              <DollarOutlined /> Join Fee
              {(member?.pendingAmount || 0) > 0 && (
                <span className="ml-1 text-xs">(₹{(member?.pendingAmount || 0).toLocaleString()} pending)</span>
              )}
            </Radio.Button>
            <Radio.Button value="closing" style={{ width: '50%', textAlign: 'center' }}
              disabled={pendingClosingEntries.length === 0}>
              <MoneyCollectOutlined /> Closing
              {pendingClosingEntries.length > 0 && (
                <span className="ml-1 text-xs">({pendingClosingEntries.length} pending)</span>
              )}
            </Radio.Button>
          </Radio.Group>
        </div>

        <Form form={paymentForm} layout="vertical" size="small">
          {/* Closing group selector — only for closing type */}
          {paymentType === 'closing' && (
            <Form.Item label="Select Closing Group" required>
              <Select
                placeholder="Choose a pending closing group"
                onChange={handleClosingGroupSelect}
                style={{ width: '100%' }}
              >
                {pendingClosingEntries.map(entry => {
                  const groupId = entry.closingGroupId || entry.id?.split('_')[1]
                  const pending = Math.max(0, (entry.totalAmount || 0) - (entry.paidAmount || 0))
                  return (
                    <Select.Option key={groupId} value={groupId}>
                      <div className="flex justify-between items-center">
                        <span>{entry.closingGroupName || groupId?.slice(-6)}</span>
                        <span className="text-xs text-red-500 ml-2">₹{pending.toLocaleString()} pending</span>
                      </div>
                    </Select.Option>
                  )
                })}
              </Select>
            </Form.Item>
          )}

          {/* Join fee info */}
          {paymentType === 'joinFee' && (member?.pendingAmount || 0) <= 0 && (
            <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
              ✓ Join fees are fully paid for this member.
            </div>
          )}

          <Form.Item
            name="amount"
            label="Amount (₹)"
            rules={[
              { required: true, message: 'Amount is required' },
              { type: 'number', min: 1, message: 'Amount must be > 0' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={
                paymentType === 'joinFee'
                  ? (member?.pendingAmount || undefined)
                  : selectedClosingGroup
                    ? Math.max(0, (selectedClosingGroup.totalAmount || 0) - (selectedClosingGroup.paidAmount || 0))
                    : undefined
              }
              formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v.replace(/₹\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item name="paymentMode" label="Payment Mode" rules={[{ required: true }]}>
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="cash">💵 Cash</Radio.Button>
              <Radio.Button value="online">📱 Online</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={d => d && d > dayjs()} />
          </Form.Item>

          <Form.Item name="transactionId" label="Transaction / UTR ID (optional)">
            <Input placeholder="Enter UTR or reference ID" />
          </Form.Item>

          <Form.Item name="paymentNote" label="Note (optional)">
            <Input placeholder="Any note about this payment" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={previewVisible} title="Document Preview" footer={null} onCancel={() => setPreviewVisible(false)} width={800} centered>
        {previewImage?.includes('.pdf') ? (
          <div className="text-center py-8">
            <FilePdfOutlined className="text-6xl text-red-500 mb-4" />
            <Space>
              <Button type="primary" icon={<EyeOutlined />} href={previewImage} target="_blank">Open</Button>
              <Button icon={<DownloadOutlined />} href={previewImage} download>Download</Button>
            </Space>
          </div>
        ) : previewImage ? (
          <Image src={previewImage} alt="Preview" style={{ width: '100%' }} />
        ) : (
          <Empty description="No preview available" />
        )}
      </Modal>
    </>
  )
}

export default MemberDetailDrawer