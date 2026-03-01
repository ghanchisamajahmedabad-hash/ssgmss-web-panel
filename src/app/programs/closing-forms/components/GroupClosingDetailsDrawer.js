"use client"
import React, { useState } from 'react'
import {
  Drawer, Card, Table, Tag, Avatar, Space, Button,
  Typography, Descriptions, Divider, Timeline, Tooltip,
  Row, Col, Statistic, Badge, Tabs
} from 'antd'
import {
  CloseOutlined, UserOutlined, CalendarOutlined,
  FlagOutlined, FileTextOutlined, EyeOutlined,
  TeamOutlined, ClockCircleOutlined, DownloadOutlined,
  CheckCircleOutlined, HeartOutlined, LinkOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TabPane } = Tabs

const colors = {
  primary: '#db2777',
  secondary: '#ea580c',
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  warning: '#f59e0b',
  purple: '#8b5cf6',
  background: '#fff8f5',
}

const GroupClosingDetailsDrawer = ({ 
  group, 
  visible, 
  onClose, 
  programList,
  onViewMember 
}) => {
  const [activeTab, setActiveTab] = useState('1')

  const program = programList.find(p => p.id === group.programId)

  // Columns for members table in group view
  const memberColumns = [
    {
      title: 'Member',
      key: 'member',
      render: (_, record) => (
        <Space size={12}>
          <Avatar 
            src={record.photoURL} 
            icon={<UserOutlined />} 
            size={40}
            style={{ border: `2px solid ${colors.primary}` }}
          />
          <div>
            <Text strong>{record.displayName || record.name}</Text>
            <div>
              <Tag color="blue">{record.registrationNumber}</Tag>
              <Tag color="green">{record.phone}</Tag>
            </div>
          </div>
        </Space>
      )
    },
    {
      title: 'Marriage Date',
      key: 'marriageDate',
      width: 150,
      render: (_, record) => (
        <Space>
          <CalendarOutlined style={{ color: colors.success }} />
          <Text>{record.marriage_date ? dayjs(record.marriage_date).format('DD/MM/YYYY') : 'N/A'}</Text>
        </Space>
      )
    },
    {
      title: 'Invitation',
      key: 'invitation',
      width: 120,
      render: (_, record) => (
        record.marriage_invitation_url ? (
          <Button 
            type="link" 
            icon={<EyeOutlined />}
            onClick={() => window.open(record.marriage_invitation_url)}
            style={{ color: colors.info }}
          >
            View Card
          </Button>
        ) : (
          <Tag color="warning">No Invitation</Tag>
        )
      )
    },
    {
      title: 'Notes',
      key: 'notes',
      width: 200,
      render: (_, record) => (
        <Tooltip title={record.marriage_note}>
          <Text ellipsis style={{ maxWidth: 180 }}>
            {record.marriage_note || 'No notes'}
          </Text>
        </Tooltip>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button 
          type="text" 
          icon={<EyeOutlined />} 
          onClick={() => onViewMember(record)}
        />
      )
    }
  ]

  // Summary statistics
  const stats = {
    total: group.members?.length || 0,
    withInvitation: group.members?.filter(m => m.marriage_invitation_url).length || 0,
    completed: group.members?.filter(m => m.marriage_date).length || 0,
  }

  return (
    <Drawer
      open={visible}
      onClose={onClose}
      placement="right"
      width={800}
      closable={false}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Space size={12}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `linear-gradient(135deg, ${colors.purple} 0%, ${colors.primary} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <TeamOutlined style={{ color: '#fff', fontSize: 22 }} />
            </div>
            <div>
              <Title level={4} style={{ margin: 0 }}>Group Closing Details</Title>
              <Text type="secondary">ID: GRP-{group.id?.slice(-6).toUpperCase()}</Text>
            </div>
          </Space>
          <Button icon={<CloseOutlined />} onClick={onClose}>Close</Button>
        </div>
      }
      footer={
        <div style={{ textAlign: 'right' }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div style={{ padding: '20px 0' }}>
        {/* Header Information */}
        <Card style={{ marginBottom: 20, borderRadius: 12 }}>
          <Row gutter={[24, 16]}>
            <Col span={16}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Program">
                  <Tag color="blue" icon={<FlagOutlined />}>{program?.name || 'Unknown'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Closed By">
                  <Space>
                    <UserOutlined />
                    <Text>{group.closedByName}</Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Closed Date">
                  <Space>
                    <CalendarOutlined />
                    <Text>{dayjs(group.closedAt).format('DD MMM YYYY, HH:mm')}</Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Group Type">
                  <Tag color="purple">Bulk Closing</Tag>
                </Descriptions.Item>
              </Descriptions>
            </Col>
            <Col span={8}>
              <div style={{ 
                background: colors.background, 
                borderRadius: 8, 
                padding: 12,
                textAlign: 'center'
              }}>
                <Text type="secondary">Total Members</Text>
                <Title level={2} style={{ margin: 0, color: colors.primary }}>{stats.total}</Title>
              </div>
            </Col>
          </Row>
        </Card>

        {/* Statistics Cards */}
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="With Invitation"
                value={stats.withInvitation}
                suffix={`/ ${stats.total}`}
                prefix={<FileTextOutlined />}
                valueStyle={{ color: colors.success }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Completed"
                value={stats.completed}
                suffix={`/ ${stats.total}`}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: colors.info }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Completion Rate"
                value={Math.round((stats.completed / stats.total) * 100) || 0}
                suffix="%"
                prefix={<HeartOutlined />}
                valueStyle={{ color: colors.warning }}
              />
            </Card>
          </Col>
        </Row>

        {/* Tabs for different views */}
        <Card style={{ borderRadius: 12 }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab}>
            <TabPane tab="Members List" key="1">
              <Table
                columns={memberColumns}
                dataSource={group.members || []}
                rowKey="id"
                pagination={false}
                size="middle"
              />
            </TabPane>
            
            <TabPane tab="Timeline" key="2">
              <Timeline mode="left" style={{ marginTop: 20 }}>
                <Timeline.Item 
                  dot={<CalendarOutlined style={{ color: colors.success }} />}
                  color="green"
                >
                  <Text strong>Group Created</Text>
                  <div>
                    <Text type="secondary">{dayjs(group.closedAt).format('DD MMM YYYY, HH:mm')}</Text>
                  </div>
                  <div>Group closing initiated by {group.closedByName}</div>
                </Timeline.Item>
                
                {group.members?.map((member, index) => (
                  <Timeline.Item 
                    key={member.id}
                    dot={<UserOutlined style={{ color: colors.primary }} />}
                    color="blue"
                  >
                    <Space>
                      <Avatar src={member.photoURL} size={24} icon={<UserOutlined />} />
                      <Text strong>{member.displayName || member.name}</Text>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="green">Marriage Date: {dayjs(member.marriage_date).format('DD/MM/YYYY')}</Tag>
                      {member.marriage_invitation_url && (
                        <Tag color="purple" icon={<FileTextOutlined />}>Invitation Uploaded</Tag>
                      )}
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            </TabPane>

            <TabPane tab="Summary" key="3">
              <div style={{ padding: '20px 0' }}>
                <Title level={5}>Closing Summary</Title>
                <Divider />
                
                <Row gutter={[16, 16]}>
                  <Col span={24}>
                    <Card size="small" style={{ background: '#f8f9fa' }}>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Text type="secondary">Program:</Text>
                          <div><Text strong>{program?.name}</Text></div>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Total Members:</Text>
                          <div><Text strong>{stats.total}</Text></div>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">With Invitation:</Text>
                          <div><Text strong style={{ color: colors.success }}>{stats.withInvitation}</Text></div>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Without Invitation:</Text>
                          <div><Text strong style={{ color: colors.warning }}>{stats.total - stats.withInvitation}</Text></div>
                        </Col>
                      </Row>
                    </Card>
                  </Col>

                  <Col span={24}>
                    <Title level={5} style={{ marginTop: 16 }}>Member List Summary</Title>
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                      {group.members?.map(member => (
                        <Card 
                          key={member.id} 
                          size="small" 
                          style={{ marginBottom: 8, borderRadius: 8 }}
                        >
                          <Row justify="space-between" align="middle">
                            <Col>
                              <Space>
                                <Avatar src={member.photoURL} size={32} icon={<UserOutlined />} />
                                <div>
                                  <Text>{member.displayName || member.name}</Text>
                                  <div>
                                    <Tag color="blue">{member.registrationNumber}</Tag>
                                  </div>
                                </div>
                              </Space>
                            </Col>
                            <Col>
                              <Space>
                                <Tag color="green">{dayjs(member.marriage_date).format('DD/MM/YYYY')}</Tag>
                                {member.marriage_invitation_url ? (
                                  <Tag color="purple">✓ Invitation</Tag>
                                ) : (
                                  <Tag color="warning">No Invitation</Tag>
                                )}
                                <Button 
                                  type="link" 
                                  icon={<EyeOutlined />}
                                  onClick={() => onViewMember(member)}
                                  size="small"
                                />
                              </Space>
                            </Col>
                          </Row>
                        </Card>
                      ))}
                    </div>
                  </Col>
                </Row>
              </div>
            </TabPane>
          </Tabs>
        </Card>
      </div>
    </Drawer>
  )
}

export default GroupClosingDetailsDrawer