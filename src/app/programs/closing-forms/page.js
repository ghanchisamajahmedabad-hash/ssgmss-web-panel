"use client"
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar, 
  message, Drawer, Select, Row, Col, Statistic, Tabs,
  Tooltip
} from 'antd'
import { 
  SearchOutlined, EyeOutlined, UserOutlined, 
  PlusOutlined, ArrowLeftOutlined, CloseCircleOutlined,
  TeamOutlined, CalendarOutlined, FileTextOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db, auth } from '../../../../lib/firbase-client'
import MemberDetailDrawer from '@/app/members/components/MemberDetailsView'
import MarriageClosingDrawer from './components/MarriageClosingDrawer'
import GroupClosingDetailsDrawer from './components/GroupClosingDetailsDrawer'

const { Option } = Select
const { TabPane } = Tabs

const colors = {
  primary: '#db2777',
  secondary: '#ea580c',
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  warning: '#f59e0b',
  background: '#fff8f5',
}

const ClosingMembersPage = () => {
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([])
  const [filteredGroups, setFilteredGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)
  const [groupDrawerVisible, setGroupDrawerVisible] = useState(false)
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false)
  const [activeTab, setActiveTab] = useState('1')
  
  // Add Closing Form
  const [closingFormVisible, setClosingFormVisible] = useState(false)
  
  // Search
  const [searchText, setSearchText] = useState('')
  const [programFilter, setProgramFilter] = useState('all')

  const programList = useSelector((state) => state.data.programList || [])
  const agentList = useSelector((state) => state.data.agentList || [])
  const currentUser = auth.currentUser

  // Fetch all data
  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch members
      const membersQuery = query(
        collection(db, 'members'),
        where('delete_flag', '==', false),
        where('status','==','active')
      )
      const membersSnapshot = await getDocs(membersQuery)
      const membersData = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        key: doc.id,
        ...doc.data(),
        displayName: doc.data().displayName || doc.data().name || 'Unknown',
      }))
      console.log(membersData,'membersData')
      setMembers(membersData)

      // Fetch group closings
      const groupsQuery = query(
        collection(db, 'groupClosings'),
        orderBy('closedAt', 'desc')
      )
      const groupsSnapshot = await getDocs(groupsQuery)
      const groupsData = await Promise.all(groupsSnapshot.docs.map(async (doc) => {
        const groupData = {
          id: doc.id,
          key: doc.id,
          ...doc.data(),
          closedAt: doc.data().closedAt?.toDate?.() || doc.data().closedAt,
        }

        // Fetch member details for this group
        if (groupData.memberIds && groupData.memberIds.length > 0) {
          const memberDetails = await Promise.all(
            groupData.memberIds.map(async (memberId) => {
              const member = membersData.find(m => m.id === memberId)
              if (member) {
                // Fetch individual closing record for this member
                const closingQuery = query(
                  collection(db, 'memberClosings'),
                  where('groupId', '==', doc.id),
                  where('memberId', '==', memberId)
                )
                const closingSnapshot = await getDocs(closingQuery)
                const closingData = closingSnapshot.docs[0]?.data()
                
                return {
                  ...member,
                  marriage_date: closingData?.marriageDate,
                  marriage_note: closingData?.note,
                  marriage_invitation_url: closingData?.invitationUrl,
                  closedAt: closingData?.closedAt?.toDate?.() || closingData?.closedAt
                }
              }
              return null
            })
          )
          groupData.members = memberDetails.filter(m => m !== null)
        }

        return groupData
      }))
      
      setGroups(groupsData)
      setFilteredGroups(groupsData)
    } catch (error) {
      console.error('Error fetching data:', error)
      message.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Filter groups
  useEffect(() => {
    let filtered = [...groups]

    if (programFilter !== 'all') {
      filtered = filtered.filter(group => 
        group.programId === programFilter
      )
    }

    if (searchText) {
      const searchLower = searchText.toLowerCase()
      filtered = filtered.filter(group => 
        group.id?.toLowerCase().includes(searchLower) ||
        group.closedByName?.toLowerCase().includes(searchLower) ||
        group.members?.some(m => 
          m.displayName?.toLowerCase().includes(searchLower) ||
          m.registrationNumber?.toLowerCase().includes(searchLower)
        )
      )
    }

    setFilteredGroups(filtered)
  }, [searchText, programFilter, groups])

  // Handle view group
  const handleViewGroup = (group) => {
    setSelectedGroup(group)
    setGroupDrawerVisible(true)
  }

  // Handle view member
  const handleViewMember = (member) => {
    setSelectedMember(member)
    setDetailDrawerVisible(true)
  }

  // Handle refresh after closing
  const handleClosingComplete = () => {
    fetchData()
  }

  // Columns for groups table
  const groupColumns = [
    {
      title: 'Group ID',
      key: 'id',
      width: 200,
      render: (_, record) => (
        <Tag color="purple" style={{ fontSize: 13 }}>
          GRP-{record.id.slice(-6).toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Program',
      key: 'program',
      width: 180,
      render: (_, record) => {
        const program = programList.find(p => p.id === record.programId)
        return (
          <Tag color="blue">{program?.name || 'Unknown'}</Tag>
        )
      }
    },
    {
      title: 'Members',
      key: 'members',
      width: 300,
      render: (_, record) => (
        <Avatar.Group 
          maxCount={3} 
          size="small"
          maxStyle={{ color: '#f56a00', backgroundColor: '#fde3cf' }}
        >
          {record.members?.map(member => (
            <Tooltip key={member.id} title={member.displayName}>
              <Avatar src={member.photoURL} icon={<UserOutlined />} />
            </Tooltip>
          ))}
        </Avatar.Group>
      )
    },
    {
      title: 'Total Members',
      dataIndex: 'count',
      key: 'count',
      width: 120,
      render: (count) => <Tag color="green">{count} members</Tag>
    },
    {
      title: 'Closed By',
      key: 'closedBy',
      width: 150,
      render: (_, record) => (
        <Space>
          <UserOutlined />
          <span>{record.closedByName}</span>
        </Space>
      )
    },
    {
      title: 'Closed Date',
      key: 'closedAt',
      width: 150,
      render: (_, record) => (
        <Space>
          <CalendarOutlined />
          <span>{dayjs(record.closedAt).format('DD/MM/YYYY HH:mm')}</span>
        </Space>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button 
          type="primary" 
          icon={<EyeOutlined />}
          onClick={() => handleViewGroup(record)}
          size="small"
          style={{ background: colors.primary, borderColor: colors.primary }}
        >
          View Group
        </Button>
      )
    }
  ]

  // Columns for individual members table (for closed members view)
  const memberColumns = [
    {
      title: 'Reg. No.',
      dataIndex: 'registrationNumber',
      key: 'regNo',
      width: 120,
      render: (text, record) => (
        <Tag color={record.marriage_closed ? 'red' : 'blue'}>{text}</Tag>
      )
    },
    {
      title: 'Member Name',
      key: 'name',
      width: 200,
      render: (_, record) => (
        <Space>
          <Avatar src={record.photoURL} icon={<UserOutlined />} size={32} />
          <div>
            <div>{record.displayName}</div>
            <div style={{ fontSize: 11, color: '#666' }}>{record.fatherName}</div>
          </div>
        </Space>
      )
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 120
    },
    {
      title: 'Program',
      key: 'program',
      width: 150,
      render: (_, record) => {
        const program = programList.find(p => p.id === record.member_closed_program)
        return program ? <Tag color="blue">{program.name}</Tag> : 'N/A'
      }
    },
    {
      title: 'Closed Date',
      key: 'closed_date',
      width: 120,
      render: (_, record) => (
        record.closed_date ? 
          dayjs(record.closed_date).format('DD/MM/YYYY') : 
          'N/A'
      )
    },
    {
      title: 'Invitation',
      key: 'invitation',
      width: 100,
      render: (_, record) => (
        record.closed_invitation_url ? (
          <Button 
            type="link" 
            size="small"
            onClick={() => window.open(record.closed_invitation_url)}
          >
            View Card
          </Button>
        ) : 'No'
      )
    },
    {
      title: 'Group ID',
      key: 'groupId',
      width: 150,
      render: (_, record) => (
        record.closed_group_id ? (
          <Tag color="purple">GRP-{record.closed_group_id.slice(-6).toUpperCase()}</Tag>
        ) : 'N/A'
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
          onClick={() => handleViewMember(record)}
        />
      )
    }
  ]

  // Get closed members
  const closedMembers = members.filter(m => m.member_closed)
console.log(closedMembers,'closedMembers')
  return (
    <div style={{ padding: 20, background: colors.background, minHeight: '100vh' }}>
      {/* Header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>
              <CloseCircleOutlined style={{ color: colors.error, marginRight: 8 }} />
              Marriage Closing Management
            </h2>
            <p style={{ color: '#666', marginTop: 4 }}>Manage group closings and member marriage details</p>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>
              Back
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setClosingFormVisible(true)}
              style={{ background: colors.error, borderColor: colors.error }}
            >
              New Marriage Closing
            </Button>
          </Space>
        </div>

        {/* Stats */}
        {/* <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic 
                title="Total Groups" 
                value={groups.length} 
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic 
                title="Total Closed" 
                value={closedMembers.length} 
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic 
                title="This Month" 
                value={groups.filter(g => 
                  g.closedAt && dayjs(g.closedAt).isSame(dayjs(), 'month')
                ).length} 
                prefix={<CalendarOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic 
                title="With Invitation" 
                value={closedMembers.filter(m => m.marriage_invitation_url).length} 
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
        </Row> */}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 16 }}>
          <Input
            placeholder="Search groups, members..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Select
            placeholder="Filter by Program"
            style={{ width: 200 }}
            value={programFilter}
            onChange={setProgramFilter}
            allowClear
          >
            <Option value="all">All Programs</Option>
            {programList.map(p => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Tabs for different views */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane 
            tab={<span><TeamOutlined /> Group Closings</span>} 
            key="1"
          >
            <Table
              columns={groupColumns}
              dataSource={filteredGroups}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              expandable={{
                expandedRowRender: (record) => (
                  <div style={{ margin: 0 }}>
                    <Table
                      columns={memberColumns.slice(0, 6)} // Show limited columns in expanded view
                      dataSource={record.members || []}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      showHeader={false}
                    />
                  </div>
                ),
                rowExpandable: (record) => record.members?.length > 0,
              }}
            />
          </TabPane>
          <TabPane 
            tab={<span><UserOutlined /> Individual Members</span>} 
            key="2"
          >
            <Table
              columns={memberColumns}
              dataSource={closedMembers}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* Marriage Closing Drawer */}
      <MarriageClosingDrawer
        visible={closingFormVisible}
        onClose={() => setClosingFormVisible(false)}
        members={members}
        programList={programList}
        currentUser={currentUser}
        onSuccess={handleClosingComplete}
      />

      {/* Group Closing Details Drawer */}
      {selectedGroup && (
        <GroupClosingDetailsDrawer
          group={selectedGroup}
          visible={groupDrawerVisible}
          onClose={() => {
            setGroupDrawerVisible(false)
            setSelectedGroup(null)
          }}
          programList={programList}
          onViewMember={handleViewMember}
        />
      )}

      {/* Member Detail Drawer */}
      {selectedMember && (
        <MemberDetailDrawer
          member={selectedMember}
          visible={detailDrawerVisible}
          onClose={() => {
            setDetailDrawerVisible(false)
            setSelectedMember(null)
          }}
          programList={programList}
          agentList={agentList}
        />
      )}
    </div>
  )
}

export default ClosingMembersPage