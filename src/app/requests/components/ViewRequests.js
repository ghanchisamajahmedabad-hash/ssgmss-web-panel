import React, { useState, useEffect } from 'react'
import { 
  Button, Card, Space, Input, Tag, Avatar, 
  Badge, Tooltip, Row, Col,
  message, Modal, Drawer, Descriptions,
  Divider, Tabs, Timeline, Alert,
  Image, Typography, Empty, Collapse,
  Table, Statistic, Progress,
  Spin
} from 'antd'
import { 
  CheckCircleOutlined, CloseCircleOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  FileTextOutlined, CalendarOutlined,
  MailOutlined, HomeOutlined, EnvironmentOutlined,
  SafetyCertificateOutlined, VerifiedOutlined,
  EyeOutlined, DownloadOutlined, 
  SwapOutlined, CheckOutlined,
  WarningOutlined, InfoCircleOutlined,
  UserSwitchOutlined, BankOutlined,
  CreditCardOutlined, WalletOutlined,
  PercentageOutlined,
  HistoryOutlined,
  LeftOutlined ,
  RightOutlined, 
  ClockCircleOutlined,
  TeamOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { collection, doc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'

const { Text, Title, Paragraph } = Typography
const { TabPane } = Tabs
const { Panel } = Collapse

const ViewRequests = ({
  activeTab,
  open,
  setOpen,
  selectedMember,
  setSelectedMember,
  handleApproveMember,
  handleRejectMember,
  getProgramNames,
  programList,
  getAgentName,
  agentList
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [previewImages, setPreviewImages] = useState([])
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [verificationNotes, setVerificationNotes] = useState({})

  if (!selectedMember) return null

  // Helper function to format date
  const formatDate = (date) => {
    return date ? dayjs(date, 'DD-MM-YYYY').format('DD MMM YYYY') : 'N/A'
  }

  // Helper function to format time
  const formatDateTime = (date) => {
    return date ? dayjs(date).format('DD MMM YYYY, hh:mm A') : 'N/A'
  }

  // Document verification with side-by-side comparison
  const DocumentVerificationView = () => {
    const documents = [
      {
        key: 'member',
        title: 'Member Photo',
        url: selectedMember.photoURL,
        type: 'photo',
        field: 'photo'
      },
      {
        key: 'document',
        title: 'ID Proof (Aadhaar Front)',
        url: selectedMember.documentFrontURL,
        type: 'document',
        field: 'aadhaar'
      },
            {
        key: 'document',
        title: 'ID Proof (Aadhaar Back)',
        url: selectedMember.documentBackURL,
        type: 'document',
        field: 'aadhaar'
      },
      {
        key: 'guardian',
        title: 'Guardian Photo',
        url: selectedMember.guardianPhotoURL,
        type: 'photo',
        field: 'guardian'
      }
    ].filter(doc => doc.url)

    // Extract info from document (simulated - in real app, you might use OCR)
    const extractedInfo = {
      name: selectedMember.displayName + ' ' + selectedMember.fatherName + ' ' + selectedMember.surname,
      dob: formatDate(selectedMember.dobDate),
      aadhaar: selectedMember.aadhaarNo,
      guardian: selectedMember.guardian
    }

    const handleViewDocument = (doc) => {
      setSelectedDocument(doc)
      setPreviewImages(documents.map(d => d.url))
      setActiveImageIndex(documents.findIndex(d => d.key === doc.key))
      setImagePreviewVisible(true)
    }

    return (
      <div className="document-verification">
        <Row gutter={[16, 16]}>
          {/* Document Images */}
          <Col span={24}>
            <Row gutter={[16, 16]}>
              {documents.map((doc, index) => (
                <Col span={8} key={doc.key}>
                  <Card 
                    size="small"
                    className={`document-card cursor-pointer! ${selectedDocument?.key === doc.key ? 'selected' : ''}`}
                    cover={
                      <div 
                        className="document-image-container"
                        onClick={() => handleViewDocument(doc)}
                      >
                        <img 
                          src={doc.url} 
                          alt={doc.title}
                          className="document-image"
                        />
                        <div className="image-overlay">
                          <EyeOutlined /> Click to Inspect
                        </div>
                      </div>
                    }
                  >
                    <Card.Meta 
                      title={doc.title}
                      description={
                        <Tag color={doc.type === 'photo' ? 'blue' : 'green'}>
                          {doc.type === 'photo' ? '📸 Photo' : '📄 Document'}
                        </Tag>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </Col>

          {/* Document Inspector */}
          {selectedDocument && (
            <Col span={24}>
              <Card 
                title={
                  <Space>
                    <FileTextOutlined />
                    <span>Document Inspector: {selectedDocument.title}</span>
                  </Space>
                }
                extra={
                  <Button 
                    type="link" 
                    onClick={() => setSelectedDocument(null)}
                  >
                    Close Inspector
                  </Button>
                }
                className="document-inspector"
              >
                <Row gutter={24}>
                  <Col span={12}>
                    <div className="inspector-image">
                      <img 
                        src={selectedDocument.url} 
                        alt="Document" 
                        style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }}
                      />
                    </div>
                  </Col>
                  <Col span={12}>
                    <div className="inspector-details">
                      <Title level={5}>Verify Information</Title>
                      
                      {/* Name Verification */}
                      <div className="verification-item">
                        <div className="verification-label">
                          <UserOutlined /> Name on Document:
                        </div>
                        <Input 
                          placeholder="Enter name shown on document"
                          defaultValue={extractedInfo.name}
                          suffix={
                            <Tooltip title="Verify if name matches">
                              {extractedInfo.name ? (
                                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                              ) : (
                                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                              )}
                            </Tooltip>
                          }
                        />
                      </div>

                      {/* DOB Verification */}
                      <div className="verification-item">
                        <div className="verification-label">
                          <CalendarOutlined /> Date of Birth:
                        </div>
                        <Input 
                          placeholder="Enter DOB from document"
                          defaultValue={extractedInfo.dob}
                          suffix={
                            <Tooltip title="Verify if DOB matches">
                              {extractedInfo.dob !== 'N/A' ? (
                                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                              ) : (
                                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                              )}
                            </Tooltip>
                          }
                        />
                      </div>

                      {/* Aadhaar Verification (for ID proof) */}
                      {selectedDocument.field === 'aadhaar' && (
                        <div className="verification-item">
                          <div className="verification-label">
                            <IdcardOutlined /> Aadhaar Number:
                          </div>
                          <Input 
                            placeholder="Enter Aadhaar number from document"
                            defaultValue={extractedInfo.aadhaar}
                            suffix={
                              <Tooltip title="Verify if Aadhaar matches">
                                {extractedInfo.aadhaar?.length === 12 ? (
                                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                ) : (
                                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                )}
                              </Tooltip>
                            }
                          />
                        </div>
                      )}

                      {/* Guardian Verification (for guardian photo) */}
                      {selectedDocument.field === 'guardian' && (
                        <div className="verification-item">
                          <div className="verification-label">
                            <SafetyCertificateOutlined /> Guardian Name:
                          </div>
                          <Input 
                            placeholder="Enter guardian name from document"
                            defaultValue={extractedInfo.guardian}
                            suffix={
                              <Tooltip title="Verify if guardian name matches">
                                {extractedInfo.guardian ? (
                                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                ) : (
                                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                )}
                              </Tooltip>
                            }
                          />
                        </div>
                      )}

                      <Divider />

                      {/* <div className="verification-actions">
                        <Button 
                          type="primary" 
                          icon={<CheckOutlined />}
                          onClick={() => {
                            message.success('Document verified successfully')
                            setSelectedDocument(null)
                          }}
                        >
                          Mark as Verified
                        </Button>
                        <Button 
                          danger 
                          icon={<CloseCircleOutlined />}
                          onClick={() => {
                            message.warning('Document marked for review')
                          }}
                        >
                          Report Issue
                        </Button>
                      </div> */}
                    </div>
                  </Col>
                </Row>
              </Card>
            </Col>
          )}
        </Row>

        {/* Image Slider Modal */}
        <Modal
          open={imagePreviewVisible}
          footer={null}
          onCancel={() => setImagePreviewVisible(false)}
          width="90%"
          centered
          className="image-slider-modal"
        >
          <div className="image-slider-container">
            <Button 
              className="slider-nav prev"
              icon={<LeftOutlined />}
              onClick={() => setActiveImageIndex(prev => 
                prev > 0 ? prev - 1 : previewImages.length - 1
              )}
              disabled={previewImages.length <= 1}
            />
            <div className="slider-image">
              <img 
                src={previewImages[activeImageIndex]} 
                alt={`Document ${activeImageIndex + 1}`}
                style={{ maxWidth: '100%', maxHeight: '80vh' }}
              />
            </div>
            <Button 
              className="slider-nav next"
              icon={<RightOutlined />}
              onClick={() => setActiveImageIndex(prev => 
                prev < previewImages.length - 1 ? prev + 1 : 0
              )}
              disabled={previewImages.length <= 1}
            />
          </div>
          <div className="image-counter">
            {activeImageIndex + 1} / {previewImages.length}
          </div>
        </Modal>

        <style jsx>{`
          .document-card {
            cursor: pointer;
            transition: all 0.3s;
            border: 2px solid transparent;
          }
          .document-card.selected {
            border-color: #1890ff;
            box-shadow: 0 4px 12px rgba(24,144,255,0.2);
          }
          .document-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .document-image-container {
            position: relative;
            height: 180px;
            overflow: hidden;
          }
          .document-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .image-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s;
          }
          .document-card:hover .image-overlay {
            opacity: 1;
          }
          .document-inspector {
            margin-top: 16px;
            background: #fafafa;
          }
          .verification-item {
            margin-bottom: 16px;
          }
          .verification-label {
            margin-bottom: 8px;
            color: #666;
          }
          .verification-actions {
            display: flex;
            gap: 8px;
          }
          .image-slider-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
          }
          .slider-nav {
            border: none;
            background: rgba(0,0,0,0.5);
            color: white;
          }
          .slider-nav:hover {
            background: rgba(0,0,0,0.7);
            color: white;
          }
          .image-counter {
            text-align: center;
            margin-top: 16px;
            color: #999;
          }
        `}</style>
      </div>
    )
  }

// Program Details Component with your structure
const ProgramDetailsView = () => {
  const [memberPrograms, setMemberPrograms] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchMemberPrograms = async () => {
      if (!selectedMember?.id) return
      
      setLoading(true)
      try {
        const memberRef = doc(db, 'members', selectedMember.id)
        const memberProgramsRef = collection(memberRef, 'memberPrograms')
        const q = query(memberProgramsRef, orderBy('joinDate', 'desc'))
        const querySnapshot = await getDocs(q)
        
        const programs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        setMemberPrograms(programs)
      } catch (error) {
        console.error('Error fetching member programs:', error)
        message.error('Failed to load program details')
      } finally {
        setLoading(false)
      }
    }

    fetchMemberPrograms()
  }, [selectedMember?.id])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!memberPrograms || memberPrograms.length === 0) {
    return (
      <Empty 
        description="No program details available" 
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  const getPaymentStatusColor = (status) => {
    switch(status) {
      case 'paid': return 'success'
      case 'partial': return 'warning'
      case 'pending': return 'error'
      default: return 'default'
    }
  }

  // Calculate total payments
  const totals = memberPrograms.reduce((acc, p) => ({
    joinFees: acc.joinFees + (p.joinFees || 0),
    paid: acc.paid + (p.paidAmount || 0),
    pending: acc.pending + (p.pendingAmount || 0)
  }), { joinFees: 0, paid: 0, pending: 0 })

  const overallPercentage = totals.joinFees > 0 
    ? Math.round((totals.paid / totals.joinFees) * 100) 
    : 0

  const columns = [
    {
      title: 'Program',
      dataIndex: 'programName',
      key: 'programName',
      fixed: 'left',
      width: 180,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          {record.ageGroupName && (
            <Tag color="blue" style={{ marginTop: 4, fontSize: '11px' }}>
              {record.ageGroupName}
            </Tag>
          )}
        </div>
      )
    },
    {
      title: 'Period',
      key: 'period',
      width: 150,
      render: (_, record) => (
        record.periodStartDate && record.periodEndDate ? (
          <span style={{ fontSize: '12px' }}>
            {formatDate(record.periodStartDate)} - {formatDate(record.periodEndDate)}
          </span>
        ) : '—'
      )
    },
     {
      title: 'Pay Amount (₹)',
      dataIndex: 'payAmount',
      key: 'payAmount',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '0'
    },
    {
      title: 'Join Fees (₹)',
      dataIndex: 'joinFees',
      key: 'joinFees',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '0'
    },
       
    {
      title: 'Paid (₹)',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      width: 100,
      align: 'right',
      render: (val) => <span style={{ color: '#52c41a', fontWeight: 500 }}>₹{val?.toLocaleString() || 0}</span>
    },
    {
      title: 'Pending (₹)',
      dataIndex: 'pendingAmount',
      key: 'pendingAmount',
      width: 100,
      align: 'right',
      render: (val) => <span style={{ color: '#ff4d4f', fontWeight: 500 }}>₹{val?.toLocaleString() || 0}</span>
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Tag color={getPaymentStatusColor(record.paymentStatus)}>
          {record.paymentStatus?.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Group',
      key: 'group',
      width: 120,
      render: (_, record) => {
        if (!record.memberGroupName) return '—'
        
        return (
          <Tooltip title={`Group Code: ${record.memberGroupCode || 'N/A'}`}>
            <Tag color="purple" style={{ cursor: 'pointer' }}>
              <TeamOutlined /> {record.memberGroupName}
            </Tag>
          </Tooltip>
        )
      }
    }
  ]

  // Group programs by member group
  const groupWisePrograms = memberPrograms.reduce((acc, program) => {
    const groupName = program.memberGroupName || 'Ungrouped'
    if (!acc[groupName]) {
      acc[groupName] = {
        programs: [],
        totalJoinFees: 0,
        totalPaid: 0,
        totalPending: 0
      }
    }
    acc[groupName].programs.push(program)
    acc[groupName].totalJoinFees += program.joinFees || 0
    acc[groupName].totalPaid += program.paidAmount || 0
    acc[groupName].totalPending += program.pendingAmount || 0
    return acc
  }, {})

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic 
              title="Total Join Fees" 
              value={totals.joinFees} 
              prefix="₹" 
              precision={2}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic 
              title="Total Paid" 
              value={totals.paid} 
              prefix="₹" 
              precision={2}
              valueStyle={{ color: '#52c41a', fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic 
              title="Total Pending" 
              value={totals.pending} 
              prefix="₹" 
              precision={2}
              valueStyle={{ color: '#ff4d4f', fontSize: 18 }}
            />
          </Card>
        </Col>
      </Row>




      {/* Programs Table */}
      <Table
        columns={columns}
        dataSource={memberPrograms}
        rowKey="id"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: 1000 }}
        summary={() => (
          <Table.Summary.Row style={{ background: '#fafafa' }}>
            <Table.Summary.Cell index={0} colSpan={3}>
              <Text strong>Total</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>₹{totals.joinFees.toLocaleString()}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">
              <Text strong style={{ color: '#52c41a' }}>₹{totals.paid.toLocaleString()}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">
              <Text strong style={{ color: '#ff4d4f' }}>₹{totals.pending.toLocaleString()}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="center">
              <Tag color={overallPercentage === 100 ? 'success' : 'processing'}>
                {overallPercentage}%
              </Tag>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="center">
              <Tag color="purple">{Object.keys(groupWisePrograms).length} Groups</Tag>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  )
}


  return (
    <Drawer
      title={
        <div className="drawer-header">
          <Space align="center">
            <Avatar 
              icon={<UserOutlined />} 
              src={selectedMember.photoURL}
              size={40}
            />
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}
              </Title>
              <Space size={4} wrap>
                <Badge 
                  status={activeTab === 'pending' ? 'processing' : 'error'} 
                  text={
                    <Text type="secondary">
                      {activeTab === 'pending' ? 'Pending Approval' : 'Rejected'}
                    </Text>
                  } 
                />
                <Divider type="vertical" />
                <Text type="secondary" copyable>
                  Reg: {selectedMember.registrationNumber}
                </Text>
              </Space>
            </div>
          </Space>
        </div>
      }
      placement="right"
      width={1000}
      onClose={() => {
        setOpen(false)
        setSelectedMember(null)
      }}
      open={open}
      extra={
        activeTab === 'pending' ? (
          <Space>
            <Button 
              onClick={() => handleRejectMember(selectedMember)} 
              danger
              icon={<CloseCircleOutlined />}
              size="large"
            >
              Reject
            </Button>
            <Button 
              type="primary" 
              onClick={() => handleApproveMember(selectedMember)}
              icon={<CheckCircleOutlined />}
              size="large"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              Approve
            </Button>
          </Space>
        ) : null
      }
      className="member-request-drawer"
    >
      {/* Main Content Tabs */}
      <Tabs defaultActiveKey="details" type="card" size="large">
        <TabPane 
          tab={<span><UserOutlined />Personal Details</span>}
          key="details"
        >
          {/* Personal details section remains same as before */}
          <Card title="Basic Information" size="small">
            <Descriptions column={2} bordered>
              <Descriptions.Item label="Full Name" span={2}>
                <Text strong>
                  {selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                <PhoneOutlined /> {selectedMember.phone}
                {selectedMember.phoneAlt && <>, {selectedMember.phoneAlt}</>}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                <MailOutlined /> {selectedMember.email || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Date of Birth">
                <CalendarOutlined /> {formatDate(selectedMember.dobDate)} (Age: {selectedMember.age})
              </Descriptions.Item>
              <Descriptions.Item label="Aadhaar">
                <IdcardOutlined /> {selectedMember.aadhaarNo}
              </Descriptions.Item>
              <Descriptions.Item label="Caste">
                <Tag color="purple">{selectedMember.caste || 'N/A'}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Address Information" size="small" style={{ marginTop: 16 }}>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="Address" span={2}>
                <EnvironmentOutlined /> {selectedMember.currentAddress}
              </Descriptions.Item>
              <Descriptions.Item label="Village">{selectedMember.village || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="City">{selectedMember.city}</Descriptions.Item>
              <Descriptions.Item label="District">{selectedMember.district}</Descriptions.Item>
              <Descriptions.Item label="State">{selectedMember.state}</Descriptions.Item>
              <Descriptions.Item label="PIN Code" span={2}>
                {selectedMember.pinCode}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Guardian Information" size="small" style={{ marginTop: 16 }}>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="Guardian Name" span={2}>
                <SafetyCertificateOutlined /> {selectedMember.guardian}
              </Descriptions.Item>
              <Descriptions.Item label="Relation">
                <Tag color="cyan">{selectedMember.guardianRelation}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </TabPane>

        <TabPane 
          tab={<span><BankOutlined />Program Details</span>}
          key="programs"
        >
          <ProgramDetailsView />
        </TabPane>

        <TabPane 
          tab={<span><FileTextOutlined />Documents</span>}
          key="documents"
        >
          <DocumentVerificationView />
        </TabPane>

        <TabPane 
          tab={<span><HistoryOutlined />Request History</span>}
          key="history"
        >
          <Card title="Request Timeline" size="small">
            <Timeline mode="left">
              <Timeline.Item 
                dot={<UserSwitchOutlined style={{ color: '#1890ff' }} />}
                color="blue"
              >
                <Text strong>Request Created</Text>
                <br />
                <Text type="secondary">
                  By: {selectedMember.requestedByName} ({selectedMember.requestedByEmail})
                </Text>
                <br />
                <Text type="secondary">{formatDateTime(selectedMember.requestedAt)}</Text>
              </Timeline.Item>

              {selectedMember.agentId && (
                <Timeline.Item 
                  dot={<UserOutlined style={{ color: '#52c41a' }} />}
                  color="green"
                >
                  <Text strong>Assigned to Agent</Text>
                  <br />
                  <Text type="secondary">
                    Agent: {getAgentName(selectedMember.agentId, agentList)}
                  </Text>
                </Timeline.Item>
              )}

              {selectedMember.status === 'rejected' && (
                <Timeline.Item 
                  dot={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                  color="red"
                >
                  <Text strong type="danger">Request Rejected</Text>
                  <br />
                  <Text type="secondary">
                    By: {selectedMember.rejectedByName || 'Unknown'}
                  </Text>
                  <br />
                  <Text type="secondary">{formatDateTime(selectedMember.rejectedAt)}</Text>
                  {selectedMember.rejectionReason && (
                    <Alert
                      message="Rejection Reason"
                      description={selectedMember.rejectionReason}
                      type="error"
                      showIcon
                      style={{ marginTop: 8 }}
                    />
                  )}
                </Timeline.Item>
              )}
            </Timeline>
          </Card>
        </TabPane>
      </Tabs>

      <style jsx global>{`
        .member-request-drawer .ant-drawer-body {
          padding: 20px;
          background: #f5f5f5;
        }
        .ant-descriptions-bordered .ant-descriptions-item-label {
          background-color: #fafafa;
          font-weight: 500;
          width: 140px;
        }
        .ant-tabs-card.ant-tabs-large .ant-tabs-tab {
          padding: 8px 16px;
        }
      `}</style>
    </Drawer>
  )
}

export default ViewRequests