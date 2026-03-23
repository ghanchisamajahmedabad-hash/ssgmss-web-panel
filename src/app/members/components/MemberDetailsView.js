"use client"
import React, { useState, useEffect } from 'react'
import {
  Drawer, Row, Col, Avatar, Tag, Descriptions, Card, Table, Tabs,
  Image, Space, Typography, Button, Divider, Badge, Progress, Tooltip,
  Statistic, Empty, Modal
} from 'antd'
import {
  UserOutlined, PhoneOutlined, IdcardOutlined, HomeOutlined,
  CalendarOutlined, WalletOutlined, FileTextOutlined, SafetyOutlined,
  TeamOutlined, EnvironmentOutlined, MailOutlined,
  DownloadOutlined, EyeOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CreditCardOutlined,
  InfoCircleOutlined, FilePdfOutlined,
  EditOutlined, PrinterOutlined, DollarOutlined,
  PercentageOutlined, HistoryOutlined, FileDoneOutlined, ProfileOutlined,
  BarcodeOutlined,
  BookOutlined, TrophyOutlined, ScheduleOutlined,
  SolutionOutlined, CrownOutlined,
  AppstoreOutlined,
  PlusOutlined, MoneyCollectOutlined, CalculatorOutlined,
  UploadOutlined
} from '@ant-design/icons'
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { db } from '../../../../lib/firbase-client'

dayjs.extend(relativeTime)

const { Title, Text } = Typography

const MemberDetailDrawer = ({ member, visible, onClose, programList }) => {
  const [transactions,   setTransactions]   = useState([])
  const [programData,    setProgramData]    = useState(null)   // single object
  const [loading,        setLoading]        = useState({ transactions: false, program: false })
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage,   setPreviewImage]   = useState('')
  const [activeTab,      setActiveTab]      = useState('overview')

  useEffect(() => {
    if (member && visible) {
      setActiveTab('overview')
      fetchTransactions()
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
    { type: 'Guardian Photo',          url: member?.guardianPhotoURL,    icon: <SafetyOutlined />,  color: '#52c41a', required: true  },
    { type: 'Member Document (Front)', url: member?.documentFrontURL,    icon: <IdcardOutlined />,  color: '#faad14', required: true  },
    { type: 'Member Document (Back)',  url: member?.documentBackURL,     icon: <IdcardOutlined />,  color: '#fadb14', required: false },
    { type: 'Guardian Document',       url: member?.guardianDocumentURL, icon: <ProfileOutlined />, color: '#722ed1', required: true  },
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

  return (
    <>
      <Drawer
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar src={member?.photoURL} size={44} icon={<UserOutlined />} className="border-2 border-blue-500" />
              <div>
                <div className="font-bold text-lg">{member?.displayName} {member?.fatherName}</div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <BarcodeOutlined /> {member?.registrationNumber}
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
      >
        {/* Quick stats */}
        <Card className="mb-4" bodyStyle={{ padding: 0 }}>
          <Row gutter={0}>
            {paymentStats.map((s, i) => (
              <Col xs={24} sm={12} lg={6} key={i} className="border-r last:border-r-0">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">{s.title}</div>
                      <div className="text-2xl font-bold mt-1" style={{ color: s.color }}>
                        {s.prefix}{s.value?.toLocaleString()}{s.suffix}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{s.description}</div>
                    </div>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${s.color}20` }}>
                      {React.cloneElement(s.icon, { style: { color: s.color, fontSize: '20px' } })}
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'overview',     label: <span><UserOutlined /> Overview</span> },
          { key: 'program',      label: <span><TrophyOutlined /> Program</span> },
          { key: 'transactions', label: <span><CreditCardOutlined /> Transactions {transactions.length > 0 && `(${transactions.length})`}</span> },
          { key: 'documents',    label: <span><FileTextOutlined /> Documents ({documents.filter(d=>d.url).length}/{documents.length})</span> },
        ]} />

        {/* ── Overview ────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="mt-4 space-y-4">
            <Row gutter={[16, 16]}>
              {/* Personal info */}
              <Col xs={24} lg={12}>
                <Card title={<span><UserOutlined className="text-blue-600 mr-2" />Personal Information</span>} className="h-full">
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
                    <Col span={24}>
                      <div className="text-sm text-gray-500">Aadhaar</div>
                      <div className="font-semibold flex items-center gap-2"><IdcardOutlined className="text-green-600" />{member?.aadhaarNo || 'Not Provided'}</div>
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* Contact & Address */}
              <Col xs={24} lg={12}>
                <Card title={<span><HomeOutlined className="text-green-600 mr-2" />Contact & Address</span>} className="h-full">
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

              {/* Guardian */}
              <Col xs={24}>
                <Card title={<span><SafetyOutlined className="text-orange-600 mr-2" />Guardian Information</span>}>
                  <div className="flex items-start gap-4">
                    <Avatar src={member?.guardianPhotoURL} size={70} icon={<UserOutlined />} className="border-2 border-orange-500" />
                    <div>
                      <div className="font-bold text-lg">{member?.guardian}</div>
                      <div className="text-gray-600">{member?.guardianRelation}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            {/* Program summary on overview */}
            <Card title={<span><TrophyOutlined className="text-purple-600 mr-2" />Program</span>}>
              {renderProgramCard()}
            </Card>
          </div>
        )}

        {/* ── Program Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'program' && (
          <div className="mt-4">
            <Card>
              <div className="flex justify-between items-center mb-4">
                <Title level={4} className="mb-0">Enrolled Program</Title>
              </div>
              {renderProgramCard()}

              {/* Financial breakdown */}
              {member?.programId && (
                <div className="mt-6 pt-6 border-t">
                  <Title level={5} className="mb-4">Financial Summary</Title>
                  <Row gutter={[16, 16]}>
                    {[
                      { label: 'Total Fees',   value: member.joinFees    || 0, color: '#1890ff' },
                      { label: 'Paid',         value: member.paidAmount  || 0, color: '#52c41a' },
                      { label: 'Pending',      value: member.pendingAmount || 0, color: (member.pendingAmount||0) > 0 ? '#ff4d4f' : '#52c41a' },
                    ].map((item, i) => (
                      <Col xs={24} sm={8} key={i}>
                        <Card className="text-center" bodyStyle={{ padding: 20 }}>
                          <div className="text-2xl font-bold mb-1" style={{ color: item.color }}>₹{item.value.toLocaleString()}</div>
                          <div className="text-gray-500">{item.label}</div>
                          <Progress percent={member.joinFees ? Math.round((item.value / member.joinFees) * 100) : 0} showInfo={false} strokeColor={item.color} className="mt-2" />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Transactions Tab ─────────────────────────────────────────────── */}
        {activeTab === 'transactions' && (
          <div className="mt-4">
            <Card>
              <div className="flex justify-between items-center mb-4">
                <Title level={4} className="mb-0">Payment Transactions</Title>
                <Text type="secondary">{transactions.length} record(s) • ₹{member?.paidAmount?.toLocaleString()} paid</Text>
              </div>

              {transactions.length > 0 ? (
                <Table columns={transactionColumns} dataSource={transactions} rowKey="id"
                  loading={loading.transactions} pagination={false} size="middle" />
              ) : (
                <Empty description="No transactions found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              {transactions.length > 0 && (
                <Row gutter={[16, 16]} className="mt-6 pt-6" style={{ borderTop: '1px solid #f0f0f0' }}>
                  <Col xs={24} md={12}>
                    <Card title="Summary" size="small">
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="Total">{transactions.length} transaction(s)</Descriptions.Item>
                        <Descriptions.Item label="Total Amount"><Text strong>₹{transactions.reduce((s,t) => s+(t.amount||0), 0).toLocaleString()}</Text></Descriptions.Item>
                        <Descriptions.Item label="Last">{transactions[0] ? dayjs(transactions[0].date).format('DD MMM YYYY') : 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="Status">
                          <Badge status={member?.paymentPercentage === 100 ? 'success' : 'warning'}
                            text={member?.paymentPercentage === 100 ? 'Fully Paid' : 'Partially Paid'} />
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="Payment Methods" size="small">
                      {Object.entries(
                        transactions.reduce((acc, t) => {
                          const m = t.paymentMode?.toLowerCase() || 'unknown'
                          acc[m] = (acc[m] || 0) + 1; return acc
                        }, {})
                      ).map(([mode, count], i) => (
                        <div key={i} className="flex items-center justify-between py-2">
                          <Tag color={{ cash:'green', online:'blue', cheque:'purple' }[mode] || 'default'} className="uppercase">{mode}</Tag>
                          <span className="font-medium">{count} txn{count > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </Card>
                  </Col>
                </Row>
              )}
            </Card>
          </div>
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