"use client"
import React, { useState, useEffect } from 'react'
import {
  Drawer, Row, Col, Avatar, Tag, Descriptions, Card, Table, Tabs,
  Image, Space, Typography, Button, Divider, Badge, Progress, Tooltip,
  Timeline, Statistic, List, Collapse, Modal, Empty, TimelineProps,
  Segmented, Alert
} from 'antd'
import {
  UserOutlined, PhoneOutlined, IdcardOutlined, HomeOutlined,
  CalendarOutlined, WalletOutlined, FileTextOutlined, SafetyOutlined,
  BankOutlined, TeamOutlined, EnvironmentOutlined, MailOutlined,
  DownloadOutlined, EyeOutlined, CheckCircleOutlined, ClockCircleOutlined,
  ArrowRightOutlined, CreditCardOutlined, TransactionOutlined,
  InfoCircleOutlined, FilePdfOutlined, PictureOutlined,
  EditOutlined, PrinterOutlined, ShareAltOutlined, DollarOutlined,
  PercentageOutlined, HistoryOutlined, FileDoneOutlined, ProfileOutlined,
  SecurityScanOutlined, AuditOutlined, BarcodeOutlined, QrcodeOutlined,
  BookOutlined, TrophyOutlined, ScheduleOutlined, TagOutlined,
  GlobalOutlined, SolutionOutlined, CrownOutlined, GiftOutlined,
  FireOutlined, StarOutlined, GroupOutlined, PartitionOutlined,
  AppstoreOutlined, DatabaseOutlined, ContainerOutlined,
  PlusOutlined, MinusOutlined, MoneyCollectOutlined, CalculatorOutlined,
  UploadOutlined
} from '@ant-design/icons'
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { db } from '../../../../lib/firbase-client'

dayjs.extend(relativeTime)

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs
const { Panel } = Collapse

const MemberDetailDrawer = ({ member, visible, onClose }) => {
  const [memberPrograms, setMemberPrograms] = useState([])
  const [transactions, setTransactions] = useState([])
  const [programDetails, setProgramDetails] = useState([])
  const [loading, setLoading] = useState({
    programs: false,
    transactions: false,
    details: false
  })
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [programStats, setProgramStats] = useState({
    totalPrograms: 0,
    fullyPaid: 0,
    partiallyPaid: 0,
    pending: 0,
    totalFees: 0,
    paidAmount: 0,
    pendingAmount: 0
  })

  useEffect(() => {
    if (member && visible) {
      fetchAllData()
      console.log(member,'member')
    }
  }, [member, visible])

  const fetchAllData = async () => {
    await Promise.all([
      fetchMemberPrograms(),
      fetchTransactions(),
      fetchProgramDetails()
    ])
  }

  const fetchMemberPrograms = async () => {
    if (!member?.id) return
    
    setLoading(prev => ({ ...prev, programs: true }))
    try {
      const memberProgramsRef = collection(db, 'members', member.id, 'memberPrograms')
      const q = query(memberProgramsRef)
      const querySnapshot = await getDocs(q)
      
      const programsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      console.log(programsData,'programsData')
      setMemberPrograms(programsData)
      
      // Calculate program statistics
      const stats = {
        totalPrograms: programsData.length,
        fullyPaid: programsData.filter(p => p.paymentPercentage === 100).length,
        partiallyPaid: programsData.filter(p => p.paymentPercentage > 0 && p.paymentPercentage < 100).length,
        pending: programsData.filter(p => p.paymentPercentage === 0).length,
        totalFees: programsData.reduce((sum, p) => sum + (p.joinFees || 0), 0),
        paidAmount: programsData.reduce((sum, p) => sum + (p.paidAmount || 0), 0),
        pendingAmount: programsData.reduce((sum, p) => sum + (p.pendingAmount || 0), 0)
      }
      
      setProgramStats(stats)
    } catch (error) {
      console.error('Error fetching member programs:', error)
    } finally {
      setLoading(prev => ({ ...prev, programs: false }))
    }
  }

  const fetchTransactions = async () => {
    if (!member?.id) return
    
    setLoading(prev => ({ ...prev, transactions: true }))
    try {
      // Fetch from memberJoinFees collection
      const q = query(
        collection(db, 'memberJoinFees'),
        where('memberId', '==', member.id),
        orderBy('createdAt', 'desc')
      )
      
      const querySnapshot = await getDocs(q)
      const transactionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().createdAt?.toDate?.() || new Date()
      }))
      
      // If no transactions found in memberJoinFees, create one from member data
      if (transactionsData.length === 0 && member.joinFeesDone) {
        transactionsData.push({
          id: 'initial-join-fee',
          transactionType: 'join_fee',
          amount: member.paidAmount || 0,
          paymentMode: member.paymentMode,
          transactionId: member.joinFeesTxtId || '',
          transactionDate: member.transactionDate || member.dateJoin,
          status: 'completed',
          verified: true,
          notes: 'Initial join fee payment',
          createdAt: member.createdAt?.toDate?.() || new Date(),
          date: member.createdAt?.toDate?.() || new Date()
        })
      }
      
      setTransactions(transactionsData)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(prev => ({ ...prev, transactions: false }))
    }
  }

  const fetchProgramDetails = async () => {
    if (!member?.programIds?.length) return
    
    setLoading(prev => ({ ...prev, details: true }))
    try {
      const programsData = []
      
      // Fetch details for each program ID
      for (const programId of member.programIds) {
        const programRef = doc(db, 'programs', programId)
        const programSnap = await getDoc(programRef)
        
        if (programSnap.exists()) {
          const programData = programSnap.data()
          
          // Find member's enrollment details for this program
          const memberProgram = memberPrograms.find(p => p.programId === programId)
          
          programsData.push({
            id: programId,
            ...programData,
            memberEnrollment: memberProgram
          })
        }
      }
      
      setProgramDetails(programsData)
    } catch (error) {
      console.error('Error fetching program details:', error)
    } finally {
      setLoading(prev => ({ ...prev, details: false }))
    }
  }

  const handlePreview = (url) => {
    console.log(url,"url")
    window.open(url,"_blank")
    setPreviewImage(url)
    setPreviewVisible(true)
  }

  // Program columns for table
  const programColumns = [
    {
      title: 'Program Details',
      key: 'programDetails',
      render: (_, record) => (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrophyOutlined className="text-blue-600 text-lg" />
            </div>
            <div className="flex-grow">
              <div className="font-semibold text-base flex items-center gap-2">
                {record.programName}
                {record.memberEnrollment?.ageGroupName && (
                  <Tag color="blue" size="small">{record.memberEnrollment.ageGroupName}</Tag>
                )}
              </div>
              {record.description && (
                <div className="text-xs text-gray-500 truncate">{record.description}</div>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                <span className="flex items-center gap-1">
                  <CalendarOutlined /> Started: {record.memberEnrollment?.joinDate || 'N/A'}
                </span>
                {record.memberEnrollment?.periodEndDate && (
                  <span className="flex items-center gap-1">
                    <ScheduleOutlined /> Ends: {record.memberEnrollment.periodEndDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ),
      width: 300,
    },
    {
      title: 'Fee Structure',
      key: 'feeStructure',
      render: (_, record) => (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Join Fees:</span>
            <span className="font-semibold">₹{record.memberEnrollment?.joinFees?.toLocaleString() || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Monthly Fee:</span>
            <span>₹{record.memberEnrollment?.payAmount?.toLocaleString() || '0'}</span>
          </div>
          {record.memberGroupName && (
            <div className="flex justify-between">
              <span className="text-gray-600">Group:</span>
              <Tag color="cyan" size="small">{record.memberGroupName}</Tag>
            </div>
          )}
        </div>
      ),
      width: 200,
    },
    {
      title: 'Payment Status',
      key: 'paymentStatus',
      render: (_, record) => {
        const enrollment = record.memberEnrollment || {}
        const paid = enrollment.paidAmount || 0
        const total = enrollment.joinFees || 0
        const pending = enrollment.pendingAmount || 0
        const percentage = enrollment.paymentPercentage || 0
        
        return (
          <div className="space-y-2">
            <Progress 
              percent={percentage} 
              size="small"
              strokeColor={
                percentage === 100 ? '#52c41a' :
                percentage > 0 ? '#faad14' : '#ff4d4f'
              }
              format={(percent) => `${percent}%`}
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center">
                <div className="text-green-600 font-semibold">₹{paid.toLocaleString()}</div>
                <div className="text-gray-500">Paid</div>
              </div>
              <div className="text-center">
                <div className={`font-semibold ${pending > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{pending.toLocaleString()}
                </div>
                <div className="text-gray-500">Pending</div>
              </div>
            </div>
            <div className="text-center">
              <Tag 
                color={percentage === 100 ? 'green' : percentage > 0 ? 'orange' : 'red'}
                className="font-medium"
              >
                {percentage === 100 ? 'FULLY PAID' : percentage > 0 ? 'PARTIAL' : 'PENDING'}
              </Tag>
            </div>
          </div>
        )
      },
      width: 200,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => window.open(`/programs/${record.id}`, '_blank')}
          >
            View Program
          </Button>
          <Button 
            type="link" 
            size="small" 
            icon={<MoneyCollectOutlined />}
            disabled={record.memberEnrollment?.paymentPercentage === 100}
          >
            Add Payment
          </Button>
        </Space>
      ),
      width: 150,
    },
  ]

  // Transaction columns
  const transactionColumns = [
    {
      title: 'Transaction',
      key: 'transaction',
      render: (_, record) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              record.transactionType === 'join_fee' ? 'bg-blue-50' : 'bg-green-50'
            }`}>
              {record.transactionType === 'join_fee' ? (
                <CheckCircleOutlined className="text-blue-600" />
              ) : (
                <TransactionOutlined className="text-green-600" />
              )}
            </div>
            <div>
              <div className="font-semibold">
                {record.transactionType === 'join_fee' ? 'Join Fee Payment' : 'Additional Payment'}
              </div>
              <div className="text-xs text-gray-500">
                {dayjs(record.date).format('DD MMM YYYY, hh:mm A')}
              </div>
            </div>
          </div>
          {record.notes && (
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              {record.notes}
            </div>
          )}
        </div>
      ),
      width: 250,
    },
    {
      title: 'Amount & Mode',
      key: 'amountMode',
      render: (_, record) => (
        <div className="space-y-2">
          <div className="text-2xl font-bold text-green-600">
            ₹{record.amount?.toLocaleString()}
          </div>
          <div>
            <Tag 
              color={
                record.paymentMode === 'cash' ? 'green' :
                record.paymentMode === 'online' ? 'blue' :
                record.paymentMode === 'cheque' ? 'purple' : 'default'
              }
              className="uppercase"
            >
              {record.paymentMode}
            </Tag>
          </div>
          {record.transactionId && (
            <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
              Txn ID: {record.transactionId}
            </div>
          )}
        </div>
      ),
      width: 150,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => (
        <div className="space-y-2">
          <Badge 
            status={record.status === 'completed' ? 'success' : 'processing'}
            text={
              <span className={`font-medium ${
                record.status === 'completed' ? 'text-green-600' : 'text-orange-600'
              }`}>
                {record.status?.toUpperCase()}
              </span>
            }
          />
          {record.verified && (
            <Tag color="green" icon={<CheckCircleOutlined />} size="small">
              Verified
            </Tag>
          )}
        </div>
      ),
      width: 120,
    },
  ]

  const documents = [
    { 
      type: 'Member Photo', 
      url: member?.photoURL,
      icon: <UserOutlined />,
      color: '#1890ff',
      required: true
    },
    { 
      type: 'Guardian Photo', 
      url: member?.guardianPhotoURL,
      icon: <SafetyOutlined />,
      color: '#52c41a',
      required: true
    },
    { 
      type: 'Member Document (Front)', 
      url: member?.documentFrontURL,
      icon: <IdcardOutlined />,
      color: '#faad14',
      required: true
    },
    { 
      type: 'Member Document (Back)', 
      url: member?.documentBackURL,
      icon: <IdcardOutlined />,
      color: '#fadb14',
      required: false
    },
    { 
      type: 'Guardian Document', 
      url: member?.guardianDocumentURL,
      icon: <ProfileOutlined />,
      color: '#722ed1',
      required: true
    },
  ]

  const paymentStats = [
    {
      title: 'Total Join Fees',
      value: member?.joinFees || 0,
      prefix: '₹',
      suffix: '',
      color: '#1890ff',
      icon: <WalletOutlined />,
      description: 'Total program join fees'
    },
    {
      title: 'Paid Amount',
      value: member?.paidAmount || 0,
      prefix: '₹',
      suffix: '',
      color: '#52c41a',
      icon: <CheckCircleOutlined />,
      description: 'Amount received'
    },
    {
      title: 'Pending Amount',
      value: member?.pendingAmount || 0,
      prefix: '₹',
      suffix: '',
      color: member?.pendingAmount > 0 ? '#ff4d4f' : '#52c41a',
      icon: <ClockCircleOutlined />,
      description: 'Balance to be paid'
    },
    {
      title: 'Payment Progress',
      value: member?.paymentPercentage || 0,
      prefix: '',
      suffix: '%',
      color: member?.paymentPercentage === 100 ? '#52c41a' : 
             member?.paymentPercentage > 0 ? '#faad14' : '#ff4d4f',
      icon: <PercentageOutlined />,
      description: 'Overall payment completion'
    },
  ]

  const getAgeGroupIcon = (ageGroup) => {
    switch (ageGroup?.toLowerCase()) {
      case 'minor':
        return <SolutionOutlined />;
      case 'adult':
        return <UserOutlined />;
      case 'senior':
        return <CrownOutlined />;
      default:
        return <UserOutlined />;
    }
  }

  const getAgeGroupColor = (ageGroup) => {
    switch (ageGroup?.toLowerCase()) {
      case 'minor':
        return '#ff7875';
      case 'adult':
        return '#1890ff';
      case 'senior':
        return '#722ed1';
      default:
        return '#d9d9d9';
    }
  }

  const renderProgramStatsCards = () => (
    <Row gutter={[16, 16]} className="mb-6">
      <Col xs={24} sm={12} md={6}>
        <Card className="text-center" bodyStyle={{ padding: '20px' }}>
          <div className="text-3xl font-bold text-blue-600 mb-2">
            {programStats.totalPrograms}
          </div>
          <div className="text-gray-600">Total Programs</div>
          <div className="text-xs text-gray-400 mt-1">
            <TeamOutlined className="mr-1" /> Enrolled
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card className="text-center" bodyStyle={{ padding: '20px' }}>
          <div className="text-3xl font-bold text-green-600 mb-2">
            {programStats.fullyPaid}
          </div>
          <div className="text-gray-600">Fully Paid</div>
          <div className="text-xs text-gray-400 mt-1">
            <CheckCircleOutlined className="mr-1" /> Completed
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card className="text-center" bodyStyle={{ padding: '20px' }}>
          <div className="text-3xl font-bold text-orange-600 mb-2">
            {programStats.partiallyPaid}
          </div>
          <div className="text-gray-600">Partially Paid</div>
          <div className="text-xs text-gray-400 mt-1">
            <PercentageOutlined className="mr-1" /> In Progress
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card className="text-center" bodyStyle={{ padding: '20px' }}>
          <div className="text-3xl font-bold text-red-600 mb-2">
            {programStats.pending}
          </div>
          <div className="text-gray-600">Pending</div>
          <div className="text-xs text-gray-400 mt-1">
            <ClockCircleOutlined className="mr-1" /> Not Started
          </div>
        </Card>
      </Col>
    </Row>
  )

  return (
    <>
      <Drawer
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar 
                src={member?.photoURL} 
                size={44} 
                icon={<UserOutlined />}
                className="border-2 border-blue-500"
              />
              <div>
                <div className="font-bold text-lg">{member?.displayName} {member.fatherName}</div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <BarcodeOutlined /> {member?.registrationNumber}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                status={member?.active_flag ? 'success' : 'error'} 
                text={member?.active_flag ? 'Active' : 'Inactive'}
              />
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ 
                  backgroundColor: `${getAgeGroupColor(member?.ageGroup)}20`,
                  border: `2px solid ${getAgeGroupColor(member?.ageGroup)}`
                }}
              >
                {React.cloneElement(getAgeGroupIcon(member?.ageGroup), { 
                  style: { color: getAgeGroupColor(member?.ageGroup), fontSize: '18px' } 
                })}
              </div>
            </div>
          </div>
        }
        placement="right"
        onClose={onClose}
        open={visible}
        size={1400}
        className="member-detail-drawer"
        extra={
          <Space>
            {/* <Tooltip title="Print Member Details">
              <Button icon={<PrinterOutlined />} />
            </Tooltip>
            <Tooltip title="Download PDF Report">
              <Button icon={<FilePdfOutlined />} />
            </Tooltip>
            <Tooltip title="Edit Member">
              <Button icon={<EditOutlined />} type="primary" />
            </Tooltip> */}
          </Space>
        }
      >
        {/* Quick Stats Header */}
        <Card className="mb-4" bodyStyle={{ padding: 0 }}>
          <Row gutter={0}>
            {paymentStats.map((stat, index) => (
              <Col xs={24} sm={12} lg={6} key={index} className="border-r last:border-r-0">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">{stat.title}</div>
                      <div className={`text-2xl font-bold mt-1`} style={{ color: stat.color }}>
                        {stat.prefix}{stat.value?.toLocaleString()}{stat.suffix}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{stat.description}</div>
                    </div>
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${stat.color}20` }}
                    >
                      {React.cloneElement(stat.icon, { 
                        style: { color: stat.color, fontSize: '20px' } 
                      })}
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        {/* Tabs */}
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          className="member-tabs"
          items={[
            {
              key: 'overview',
              label: (
                <span className="flex items-center gap-2">
                  <UserOutlined /> Overview
                </span>
              ),
            },
            {
              key: 'programs',
              label: (
                <span className="flex items-center gap-2">
                  <TeamOutlined /> Programs ({member?.programIds?.length || 0})
                </span>
              ),
            },
            {
              key: 'transactions',
              label: (
                <span className="flex items-center gap-2">
                  <TransactionOutlined /> Transactions
                  {transactions.length > 0 && (
                    <Badge 
                      count={transactions.length} 
                      size="small" 
                      style={{ marginLeft: 6 }} 
                    />
                  )}
                </span>
              ),
            },
            {
              key: 'documents',
              label: (
                <span className="flex items-center gap-2">
                  <FileTextOutlined /> Documents
                  <Badge 
                    count={documents.filter(d => d.url).length} 
                    size="small" 
                    style={{ marginLeft: 6 }} 
                    status="success"
                  />
                </span>
              ),
            },
          ]}
        />

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="mt-4 space-y-4">
            {/* Personal Information */}
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card 
                  title={
                    <span className="flex items-center gap-2">
                      <UserOutlined className="text-blue-600" /> Personal Information
                    </span>
                  }
                  className="h-full"
                >
                  <Row gutter={[16, 8]}>
                    <Col span={24}>
                      <div className="flex items-center gap-3 mb-4">
                        <Avatar 
                          src={member?.photoURL} 
                          size={80}
                          icon={<UserOutlined />}
                          className="border-2 border-blue-500"
                        />
                        <div>
                          <div className="font-bold text-xl">{member?.displayName}</div>
                          <div className="text-gray-500">{member?.fatherName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Tag color="blue">{member?.surname}</Tag>
                            <Tag color={member?.marriage_flag ? 'purple' : 'cyan'}>
                              {member?.marriage_flag ? 'Married' : 'Single'}
                            </Tag>
                            <Tag color={getAgeGroupColor(member?.ageGroup)} icon={getAgeGroupIcon(member?.ageGroup)}>
                              {member?.ageGroup?.toUpperCase()}
                            </Tag>
                          </div>
                        </div>
                      </div>
                    </Col>
                    
                    <Col span={12}>
                      <div className="mb-3">
                        <div className="text-sm text-gray-500">Age</div>
                        <div className="font-semibold">{member?.age} years</div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="mb-3">
                        <div className="text-sm text-gray-500">Date of Birth</div>
                        <div className="font-semibold">{member?.dobDate}</div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="mb-3">
                        <div className="text-sm text-gray-500">Caste</div>
                        <div className="font-semibold">{member?.caste}</div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="mb-3">
                        <div className="text-sm text-gray-500">Religion</div>
                        <div className="font-semibold">{member?.religion}</div>
                      </div>
                    </Col>
                    <Col span={24}>
                      <div className="mb-3">
                        <div className="text-sm text-gray-500">Aadhaar Number</div>
                        <div className="font-semibold flex items-center gap-2">
                          <IdcardOutlined className="text-green-600" />
                          {member?.aadhaarNo || 'Not Provided'}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* Contact & Address */}
              <Col xs={24} lg={12}>
                <Card 
                  title={
                    <span className="flex items-center gap-2">
                      <HomeOutlined className="text-green-600" /> Contact & Address
                    </span>
                  }
                  className="h-full"
                >
                  <div className="space-y-4">
                    {/* Contact Info */}
                    <div>
                      <div className="font-medium mb-2">Contact Information</div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <PhoneOutlined className="text-blue-600" />
                          <div>
                            <div className="font-semibold">{member?.phone}</div>
                            <div className="text-sm text-gray-500">Primary Phone</div>
                          </div>
                        </div>
                        {member?.phoneAlt && (
                          <div className="flex items-center gap-3 ml-6">
                            <PhoneOutlined className="text-gray-400 text-sm" />
                            <div>
                              <div className="text-gray-700">{member.phoneAlt}</div>
                              <div className="text-xs text-gray-500">Alternate Phone</div>
                            </div>
                          </div>
                        )}
                        {member?.email && (
                          <div className="flex items-center gap-3">
                            <MailOutlined className="text-blue-600" />
                            <div>
                              <div className="font-semibold">{member.email}</div>
                              <div className="text-sm text-gray-500">Email Address</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Address Info */}
                    <div>
                      <div className="font-medium mb-2">Address</div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="font-semibold mb-1">{member?.currentAddress}</div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Village:</span> {member?.village}
                          </div>
                          <div>
                            <span className="font-medium">City:</span> {member?.city}
                          </div>
                          <div>
                            <span className="font-medium">District:</span> {member?.district}
                          </div>
                          <div>
                            <span className="font-medium">State:</span> {member?.state}
                          </div>
                          <div>
                            <span className="font-medium">Pin Code:</span> {member?.pinCode}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>

              {/* Guardian Information */}
              <Col xs={24}>
                <Card 
                  title={
                    <span className="flex items-center gap-2">
                      <SafetyOutlined className="text-orange-600" /> Guardian Information
                    </span>
                  }
                >
                  <Row gutter={[24, 16]}>
                    <Col xs={24} md={12}>
                      <div className="flex items-start gap-4">
                        <Avatar 
                          src={member?.guardianPhotoURL} 
                          size={70}
                          icon={<UserOutlined />}
                          className="border-2 border-orange-500"
                        />
                        <div className="flex-grow">
                          <div className="font-bold text-lg">{member?.guardian}</div>
                          <div className="text-gray-600">{member?.guardianRelation}</div>
                          {member?.guardianPhone && (
                            <div className="flex items-center gap-2 mt-2">
                              <PhoneOutlined className="text-gray-400" />
                              <span className="font-medium">{member.guardianPhone}</span>
                            </div>
                          )}
                          {member?.guardianOccupation && (
                            <div className="mt-2">
                              <Tag color="blue">{member.guardianOccupation}</Tag>
                            </div>
                          )}
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} md={12}>
                      <div className="border-l-2 border-gray-200 pl-6">
                        <div className="font-medium mb-3">Document Status</div>
                        <div className="space-y-2">
                          {documents.slice(1).map((doc, index) => (
                            <div key={index} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                                  style={{ backgroundColor: `${doc.color}15` }}
                                >
                                  {React.cloneElement(doc.icon, { 
                                    style: { color: doc.color, fontSize: '18px' } 
                                  })}
                                </div>
                                <div>
                                  <div className="font-medium">{doc.type}</div>
                                  <div className="text-xs text-gray-500">
                                    {doc.required ? 'Required' : 'Optional'}
                                  </div>
                                </div>
                              </div>
                              <div>
                                {doc.url ? (
                                  <Tag color="green" icon={<CheckCircleOutlined />}>
                                    Uploaded
                                  </Tag>
                                ) : (
                                  <Tag color="orange" icon={<ClockCircleOutlined />}>
                                    Pending
                                  </Tag>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>

            {/* Program Summary */}
            {memberPrograms.length > 0 && (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <TeamOutlined className="text-purple-600" /> Program Summary
                  </span>
                }
              >
                {renderProgramStatsCards()}
                <Table
                  columns={programColumns}
                  dataSource={memberPrograms.map((mp, index) => {
                    const program = programDetails.find(p => p.id === mp.programId)
                    return {
                      ...mp,
                      ...program,
                      memberEnrollment: mp
                    }
                  })}
                  rowKey="id"
                  loading={loading.programs}
                  pagination={false}
                  size="middle"
                  className="programs-table"
                />
              </Card>
            )}
          </div>
        )}

        {/* Programs Tab */}
        {activeTab === 'programs' && (
          <div className="mt-4">
            <Card>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <Title level={4} className="mb-1">Enrolled Programs</Title>
                  <Text type="secondary">
                    {memberPrograms.length} program(s) • ₹{programStats.totalFees.toLocaleString()} total fees
                  </Text>
                </div>
                <Space>
                  <Button icon={<CalculatorOutlined />}>Payment Summary</Button>
                  <Button type="primary" icon={<PlusOutlined />}>
                    Add Program
                  </Button>
                </Space>
              </div>

              {renderProgramStatsCards()}

              <Table
                columns={programColumns}
                dataSource={memberPrograms.map((mp, index) => {
                  const program = programDetails.find(p => p.id === mp.programId)
                  return {
                    ...mp,
                    ...program,
                    memberEnrollment: mp
                  }
                })}
                rowKey="id"
                loading={loading.programs}
                pagination={false}
                size="middle"
                className="programs-table"
              />

              {/* Financial Summary */}
              {memberPrograms.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <Title level={5} className="mb-4">Financial Summary</Title>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={8}>
                      <Card className="text-center" bodyStyle={{ padding: '20px' }}>
                        <div className="text-3xl font-bold text-blue-600 mb-2">
                          ₹{programStats.totalFees.toLocaleString()}
                        </div>
                        <div className="text-gray-600">Total Program Fees</div>
                        <Progress 
                          percent={100}
                          showInfo={false}
                          strokeColor="#1890ff"
                          className="mt-2"
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card className="text-center" bodyStyle={{ padding: '20px' }}>
                        <div className="text-3xl font-bold text-green-600 mb-2">
                          ₹{programStats.paidAmount.toLocaleString()}
                        </div>
                        <div className="text-gray-600">Total Paid Amount</div>
                        <Progress 
                          percent={programStats.totalFees > 0 ? (programStats.paidAmount / programStats.totalFees) * 100 : 0}
                          showInfo={false}
                          strokeColor="#52c41a"
                          className="mt-2"
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <Card className="text-center" bodyStyle={{ padding: '20px' }}>
                        <div className="text-3xl font-bold text-red-600 mb-2">
                          ₹{programStats.pendingAmount.toLocaleString()}
                        </div>
                        <div className="text-gray-600">Total Pending Amount</div>
                        <Progress 
                          percent={programStats.totalFees > 0 ? (programStats.pendingAmount / programStats.totalFees) * 100 : 0}
                          showInfo={false}
                          strokeColor="#ff4d4f"
                          className="mt-2"
                        />
                      </Card>
                    </Col>
                  </Row>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
           <div className="mt-4">
    <Card>
      <div className="flex justify-between items-center mb-4">
        <div>
          <Title level={4} className="mb-1">Payment Transactions</Title>
          <Text type="secondary">
            {transactions.length} transaction(s) • ₹{member?.paidAmount?.toLocaleString()} total paid
          </Text>
        </div>
        <Space>
          <Button icon={<HistoryOutlined />}>View History</Button>
          <Button type="primary" icon={<CreditCardOutlined />}>
            New Payment
          </Button>
        </Space>
      </div>

      {transactions.length > 0 ? (
        <Table
          columns={transactionColumns}
          dataSource={transactions}
          rowKey="id"
          loading={loading.transactions}
          pagination={false}
          size="middle"
          className="transactions-table"
        />
      ) : (
        <Empty
          description="No transactions found"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" icon={<CreditCardOutlined />}>
            Record First Payment
          </Button>
        </Empty>
      )}

      {/* Transaction Summary */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title="Transaction Summary" size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Total Transactions">
                  {transactions.length}
                </Descriptions.Item>
                <Descriptions.Item label="Total Amount">
                  <Text strong>₹{transactions.reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Last Transaction">
                  {transactions[0] ? dayjs(transactions[0].date).format('DD MMM YYYY') : 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Payment Status">
                  <Badge 
                    status={member?.paymentPercentage === 100 ? 'success' : 'warning'}
                    text={member?.paymentPercentage === 100 ? 'Fully Paid' : 'Partially Paid'}
                  />
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Payment Methods" size="small">
              <div className="space-y-2">
                {/* Fix: Convert object to array first */}
                {(() => {
                  // Count payment methods
                  const paymentMethodCounts = transactions.reduce((acc, t) => {
                    const mode = t.paymentMode?.toLowerCase() || 'unknown'
                    acc[mode] = (acc[mode] || 0) + 1
                    return acc
                  }, {})
                  
                  // Convert to array and render
                  return Object.entries(paymentMethodCounts).map(([mode, count], index) => (
                    <div key={index} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Tag 
                          color={
                            mode === 'cash' ? 'green' :
                            mode === 'online' ? 'blue' :
                            mode === 'cheque' ? 'purple' : 
                            mode === 'card' ? 'cyan' : 'default'
                          }
                          className="uppercase"
                        >
                          {mode}
                        </Tag>
                      </div>
                      <div className="font-medium">
                        {count} transaction{count > 1 ? 's' : ''}
                      </div>
                    </div>
                  ))
                })()}
                
                {/* If no transactions */}
                {transactions.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    No payment methods recorded
                  </div>
                )}
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </Card>
  </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="mt-2">
            <Card>
              <Row gutter={[16, 16]}>
                {documents.map((doc, index) => (
                  <Col xs={24} sm={12} md={8} key={index}>
                    <Card
                      className="h-full"
                      bodyStyle={{ padding: 0 }}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div 
                            className="w-12 h-12 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${doc.color}15` }}
                          >
                            {React.cloneElement(doc.icon, { 
                              style: { color: doc.color, fontSize: '20px' } 
                            })}
                          </div>
                          <div className="flex-grow">
                            <div className="font-semibold">{doc.type}</div>
                            <div className="text-xs text-gray-500">
                              {doc.required ? 'Required Document' : 'Optional Document'}
                            </div>
                          </div>
                          <div>
                            {doc.url ? (
                              <Badge status="success" text="Uploaded" />
                            ) : (
                              <Badge status="warning" text="Pending" />
                            )}
                          </div>
                        </div>

                        {doc.url ? (
                          <div className="space-y-3">
                            <div 
                              className="w-full h-40 border rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                              // onClick={() => handlePreview(doc.url)}
                            >
                              {doc.url.includes('.pdf') ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                                  <FilePdfOutlined className="text-4xl text-red-500" />
                                  <div className="text-sm mt-2">PDF Document</div>
                                  <div className="text-xs text-gray-500">Click to view/download</div>
                                </div>
                              ) : (
                                <Image
                                  src={doc.url}
                                  alt={doc.type}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <FileTextOutlined className="text-3xl text-gray-300 mb-3" />
                            <div className="text-gray-500">Document not uploaded</div>
                            <Button 
                              type="dashed" 
                              size="small" 
                              icon={<UploadOutlined />}
                              className="mt-3"
                            >
                              Upload Now
                            </Button>
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

      {/* Preview Modal */}
      <Modal
        open={previewVisible}
        title="Document Preview"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={800}
        centered
      >
        {previewImage ? (
          previewImage.includes('.pdf') ? (
            <div className="text-center py-8">
              <FilePdfOutlined className="text-6xl text-red-500 mb-4" />
              <Title level={4} className="mb-2">PDF Document</Title>
              <Text type="secondary" className="mb-6">
                Preview not available for PDF files. Please download to view.
              </Text>
              <Space>
                <Button 
                  type="primary" 
                  icon={<EyeOutlined />}
                  href={previewImage}
                  target="_blank"
                >
                  Open in New Tab
                </Button>
                <Button 
                  icon={<DownloadOutlined />}
                  href={previewImage}
                  download
                >
                  Download PDF
                </Button>
              </Space>
            </div>
          ) : (
            <Image
              src={previewImage}
              alt="Document preview"
              style={{ width: '100%' }}
            />
          )
        ) : (
          <Empty description="No preview available" />
        )}
      </Modal>
    </>
  )
}

export default MemberDetailDrawer