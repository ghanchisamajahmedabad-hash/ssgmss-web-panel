"use client"
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import {
  Button, Card, Table, Space, Input, Tag, Avatar,
  message, Select, Row, Col, Statistic, Tabs, Modal,
  Tooltip, Badge, Descriptions, List, Typography
} from 'antd'
import {
  SearchOutlined, EyeOutlined, UserOutlined,
  PlusOutlined, ArrowLeftOutlined, CloseCircleOutlined,
  TeamOutlined, CalendarOutlined, FileTextOutlined,
  RollbackOutlined, ExclamationCircleOutlined,
  HeartFilled, ClockCircleOutlined, CheckCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  collection, query, where, getDocs, orderBy, limit
} from 'firebase/firestore'
import { db, auth } from '../../../../lib/firbase-client'
import MemberDetailDrawer from '@/app/members/components/MemberDetailsView'
import MarriageClosingDrawer from './components/MarriageClosingDrawer'
import { paymentApi } from '@/utils/api'

dayjs.extend(relativeTime)

const { Option }  = Select
const { confirm } = Modal
const { Text }    = Typography

const colors = {
  primary:    '#db2777', secondary: '#ea580c',
  success:    '#16a34a', error: '#dc2626',
  info:       '#2563eb', warning: '#f59e0b',
  background: '#fff8f5', surface: '#ffffff',
  border:     '#fce7f3', muted: '#9ca3af', fg: '#111827',
}
const gradPrimary = `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`

// ── Closing Group Detail Modal ─────────────────────────────────────────────────
const ClosingGroupModal = ({ group, visible, onClose, programList }) => {
  if (!group) return null
  const program = programList.find(p => p.id === group.programId)
  return (
    <Modal open={visible} onCancel={onClose} footer={null} width={720}
      title={<Space><HeartFilled style={{ color: colors.primary }} /><span style={{ fontWeight: 700 }}>Closing Group Detail</span><Tag color={group.status === 'reversed' ? 'red' : 'green'}>{group.status === 'reversed' ? 'Reversed' : 'Active'}</Tag></Space>}>
      <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Group ID"><Text copyable style={{ fontSize: 11 }}>{group.id}</Text></Descriptions.Item>
        <Descriptions.Item label="Program">{program?.name || group.programId}</Descriptions.Item>
        <Descriptions.Item label="Closed By">{group.closedByName || '—'}</Descriptions.Item>
        <Descriptions.Item label="Closed At">{group.closedDate ? dayjs(group.closedDate).format('DD/MM/YYYY HH:mm') : '—'}</Descriptions.Item>
        <Descriptions.Item label="Member Count"><Tag color="blue">{group.memberCount}</Tag></Descriptions.Item>
        <Descriptions.Item label="Total Amount"><span style={{ fontWeight: 700, color: colors.success }}>₹{group.totalAmount?.toLocaleString()}</span></Descriptions.Item>
        {group.status === 'reversed' && (
          <>
            <Descriptions.Item label="Reversed By">{group.reversedByName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Reversal Reason">{group.reversalReason || '—'}</Descriptions.Item>
          </>
        )}
      </Descriptions>
      <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Members ({group.members?.length || 0})</div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        <List size="small" dataSource={group.members || []}
          renderItem={m => (
            <List.Item extra={<Space>{m.invitationUrl && <Button size="small" type="link" onClick={() => window.open(m.invitationUrl)}>View Card</Button>}<Tag color="blue">₹{m.amount}</Tag></Space>}>
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} size={30} style={{ background: colors.primary + '30', color: colors.primary }} />}
                title={<Space size={4}><span style={{ fontWeight: 600, fontSize: 13 }}>{m.memberName}</span><Tag style={{ fontSize: 10 }}>{m.registrationNumber}</Tag></Space>}
                description={<Space size={4} style={{ fontSize: 11, color: colors.muted }}>{m.phone && <span>{m.phone}</span>}{m.marriageDate && <span>• {dayjs(m.marriageDate).format('DD/MM/YYYY')}</span>}{m.note && <span>• {m.note}</span>}</Space>}
              />
            </List.Item>
          )} />
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
const ClosingMembersPage = () => {
  const [loading,              setLoading]              = useState(false)
  const [members,              setMembers]              = useState([])
  const [selectedMember,       setSelectedMember]       = useState(null)
  const [detailDrawerVisible,  setDetailDrawerVisible]  = useState(false)
  const [closingFormVisible,   setClosingFormVisible]   = useState(false)
  const [activeTab,            setActiveTab]            = useState('closed')
  const [closingGroups,        setClosingGroups]        = useState([])
  const [groupsLoading,        setGroupsLoading]        = useState(false)
  const [reversingId,          setReversingId]          = useState(null)
  const [selectedGroup,        setSelectedGroup]        = useState(null)
  const [groupModalVisible,    setGroupModalVisible]    = useState(false)
  const [searchText,           setSearchText]           = useState('')
  const [programFilter,        setProgramFilter]        = useState('all')
  const [groupProgramFilter,   setGroupProgramFilter]   = useState('all')

  const programList = useSelector((s) => s.data.programList || [])
  const agentList   = useSelector((s) => s.data.agentList   || [])
  const currentUser = auth.currentUser

  // ── Fetch all active members (single programId flat field) ─────────────────
  const fetchData = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'members'),
        where('delete_flag', '==', false),
        where('status',      '==', 'active')
      ))
      setMembers(snap.docs.map(d => ({
        id: d.id, key: d.id, ...d.data(),
        displayName: d.data().displayName || d.data().name || 'Unknown',
      })))
    } catch (e) { console.error(e); message.error('Failed to load data') }
    finally { setLoading(false) }
  }

  const fetchClosingGroups = async () => {
    setGroupsLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'groupClosings'), orderBy('closedAt', 'desc'), limit(100)))
      setClosingGroups(snap.docs.map(d => ({
        id: d.id, key: d.id, ...d.data(),
        closedDate: d.data().closedDate || (d.data().closedAt?.toDate?.()?.toISOString()) || null,
      })))
    } catch (e) { console.error(e); message.error('Failed to load closing history') }
    finally { setGroupsLoading(false) }
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (activeTab === 'history') fetchClosingGroups() }, [activeTab])

  // ── Derived lists — use flat member.programId ──────────────────────────────
  const closedMembers = members.filter(m => m.member_closed)

  const filteredClosedMembers = closedMembers.filter(m => {
    // member_closed_program is a single programId string
    if (programFilter !== 'all' && m.member_closed_program !== programFilter) return false
    if (!searchText) return true
    const s = searchText.toLowerCase()
    return (
      m.displayName?.toLowerCase().includes(s) ||
      m.registrationNumber?.toLowerCase().includes(s) ||
      m.phone?.toLowerCase().includes(s)
    )
  })

  const filteredGroups   = closingGroups.filter(g => groupProgramFilter === 'all' || g.programId === groupProgramFilter)
  const activeMembers    = members.filter(m => !m.member_closed)

  // ── Reverse ────────────────────────────────────────────────────────────────
  const handleReverseGroup = (group) => {
    let reason = ''
    confirm({
      title: 'Reverse Closing Group?',
      icon: <ExclamationCircleOutlined style={{ color: colors.error }} />,
      content: (
        <div>
          <p style={{ marginBottom: 12 }}>Un-close <strong>{group.memberCount} member(s)</strong> and reverse all counters for group:</p>
          <Tag style={{ marginBottom: 12, fontFamily: 'monospace', fontSize: 11 }}>{group.id}</Tag>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Reason:</div>
          <Input.TextArea rows={2} placeholder="Enter reason…" onChange={e => { reason = e.target.value }} style={{ borderColor: colors.primary }} />
        </div>
      ),
      okText: 'Yes, Reverse', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        setReversingId(group.id)
        try {
          const res = await paymentApi.reverseClosing({
            closingGroupId: group.id, programId: group.programId,
            reason: reason || 'No reason provided',
            reversedBy: currentUser?.uid, reversedByName: currentUser?.displayName || 'Unknown',
          })
          if (res?.success) {
            message.success(`Reversed! ${res.summary?.membersRestored} members restored.`)
            fetchData(); fetchClosingGroups()
          } else { message.error(res?.message || 'Reversal failed') }
        } catch (e) { console.error(e); message.error('Reversal request failed') }
        finally { setReversingId(null) }
      }
    })
  }

  const handleViewMember       = (m) => { setSelectedMember(m); setDetailDrawerVisible(true) }
  const handleClosingComplete  = () => { fetchData(); if (activeTab === 'history') fetchClosingGroups() }

  // ── Columns: Closed Members ────────────────────────────────────────────────
  const memberColumns = [
    { title: 'Reg. No.', dataIndex: 'registrationNumber', key: 'regNo', width: 120, render: t => <Tag color="blue">{t}</Tag> },
    {
      title: 'Member', key: 'name', width: 220,
      render: (_, r) => <Space><Avatar src={r.photoURL} icon={<UserOutlined />} size={36} /><div><div style={{ fontWeight: 600 }}>{r.displayName}</div><div style={{ fontSize: 11, color: '#666' }}>{r.fatherName}</div></div></Space>
    },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      // Single program — member_closed_program is a flat string
      title: 'Program', key: 'programName', width: 160,
      render: (_, r) => {
        
        return  <Tag color="blue">{r.programName}</Tag> 
      }
    },
    { title: 'Closed Date', key: 'closed_date', width: 130, render: (_, r) => r.closed_date ? dayjs(r.closed_date).format('DD/MM/YYYY') : 'N/A' },
    {
      title: 'Group', key: 'closingGroupId', width: 140,
      render: (_, r) => r.closingGroupId ? (
        <Tooltip title={r.closingGroupId}>
          <Tag icon={<TeamOutlined />} color="purple" style={{ cursor: 'pointer', fontSize: 10 }}
            onClick={() => { const g = closingGroups.find(g => g.id === r.closingGroupId); if (g) { setSelectedGroup(g); setGroupModalVisible(true) } }}>
            {r.closingGroupId.slice(-6)}
          </Tag>
        </Tooltip>
      ) : <Tag>—</Tag>
    },
    {
      title: 'Invitation', key: 'invitation', width: 110,
      render: (_, r) => r.closed_invitation_url ? <Button type="link" size="small" onClick={() => window.open(r.closed_invitation_url)}>View Card</Button> : <Tag color="warning">No Card</Tag>
    },
    { title: 'Note', key: 'note', width: 200, render: (_, r) => <span style={{ fontSize: 12, color: '#555' }}>{r.closed_note || '—'}</span> },
    { title: 'Action', key: 'action', width: 80, render: (_, r) => <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewMember(r)} /> },
  ]

  // ── Columns: History ───────────────────────────────────────────────────────
  const historyColumns = [
    {
      title: 'Closed At', key: 'closedDate', width: 170,
      sorter: (a, b) => new Date(b.closedDate) - new Date(a.closedDate), defaultSortOrder: 'ascend',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.closedDate ? dayjs(r.closedDate).format('DD MMM YYYY') : '—'}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>{r.closedDate ? dayjs(r.closedDate).format('hh:mm A') : ''}</div>
          <div style={{ fontSize: 10, color: colors.muted }}>{r.closedDate ? dayjs(r.closedDate).fromNow() : ''}</div>
        </div>
      )
    },
    {
      title: 'Group ID', key: 'id', width: 130,
      render: (_, r) => <Tooltip title={r.id}><Tag style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }} onClick={() => { setSelectedGroup(r); setGroupModalVisible(true) }}>{r.id.slice(-8)}</Tag></Tooltip>
    },
    {
      title: 'Program', key: 'program', width: 160,
      render: (_, r) => { const p = programList.find(p => p.id === r.programId); return p ? <Tag color="blue">{p.name}</Tag> : <Tag>{r.programId?.slice(-6)}</Tag> }
    },
    {
      title: 'Members', key: 'memberCount', width: 100,
      render: (_, r) => <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: colors.primary, lineHeight: '24px' }}>{r.memberCount}</div><div style={{ fontSize: 10, color: colors.muted }}>members</div></div>
    },
    { title: 'Total Amount', key: 'totalAmount', width: 130, render: (_, r) => <span style={{ fontWeight: 700, color: colors.success, fontSize: 15 }}>₹{(r.totalAmount || 0).toLocaleString()}</span> },
    { title: 'Closed By', key: 'closedByName', width: 150, render: (_, r) => <div style={{ fontWeight: 600, fontSize: 12 }}>{r.closedByName || '—'}</div> },
    {
      title: 'Status', key: 'status', width: 120,
      render: (_, r) => r.status === 'reversed'
        ? <div><Tag icon={<RollbackOutlined />} color="red">Reversed</Tag>{r.reversedByName && <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>by {r.reversedByName}</div>}</div>
        : <Tag icon={<CheckCircleOutlined />} color="green">Active</Tag>
    },
    {
      title: 'Actions', key: 'actions', width: 130,
      render: (_, r) => (
        <Space>
          <Tooltip title="View detail"><Button type="text" size="small" icon={<InfoCircleOutlined />} onClick={() => { setSelectedGroup(r); setGroupModalVisible(true) }} /></Tooltip>
          {r.status !== 'reversed' && <Tooltip title="Reverse"><Button type="text" size="small" danger icon={<RollbackOutlined />} loading={reversingId === r.id} onClick={() => handleReverseGroup(r)} /></Tooltip>}
        </Space>
      )
    },
  ]

  const tabItems = [
    {
      key: 'closed',
      label: <Space><CloseCircleOutlined />Closed Members<Badge count={closedMembers.length} style={{ backgroundColor: colors.error }} /></Space>,
      children: (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Input placeholder="Search by name, reg. no, phone..." prefix={<SearchOutlined />} style={{ width: 300 }}
              onChange={e => setSearchText(e.target.value)} allowClear />
            <Select style={{ width: 200 }} value={programFilter} onChange={setProgramFilter}>
              <Option value="all">All Programs</Option>
              {programList.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </div>
          <Table columns={memberColumns} dataSource={filteredClosedMembers} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} size="small" />
        </>
      )
    },
    {
      key: 'history',
      label: <Space><ClockCircleOutlined />Closing History<Badge count={closingGroups.filter(g => g.status === 'active').length} style={{ backgroundColor: colors.primary }} /></Space>,
      children: (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <Select style={{ width: 220 }} value={groupProgramFilter} onChange={setGroupProgramFilter} placeholder="Filter by program">
              <Option value="all">All Programs</Option>
              {programList.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Tag color="green" icon={<CheckCircleOutlined />}>Active: {closingGroups.filter(g => g.status === 'active').length}</Tag>
              <Tag color="red"   icon={<RollbackOutlined />}>Reversed: {closingGroups.filter(g => g.status === 'reversed').length}</Tag>
              <Tag color="blue"  icon={<TeamOutlined />}>Total closed: {closingGroups.filter(g => g.status === 'active').reduce((s, g) => s + (g.memberCount || 0), 0)}</Tag>
            </div>
          </div>
          <Table columns={historyColumns} dataSource={filteredGroups} rowKey="id" loading={groupsLoading} pagination={{ pageSize: 20 }} size="small" rowClassName={r => r.status === 'reversed' ? 'row-reversed' : ''} />
        </>
      )
    }
  ]

  return (
    <div style={{ padding: 20, background: colors.background, minHeight: '100vh' }}>
      <style>{`.row-reversed td { opacity: 0.55; }`}</style>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}><HeartFilled style={{ color: colors.primary, marginRight: 8 }} />Marriage Closing Management</h2>
            <p style={{ color: '#666', marginTop: 4 }}>Manage member marriage closings & track batch history</p>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setClosingFormVisible(true)}
              style={{ background: gradPrimary, border: 'none', fontWeight: 700 }}>
              New Marriage Closing
            </Button>
          </Space>
        </div>
        <Row gutter={16}>
          {[
            { title: 'Total Members',   value: members.length,                                                              prefix: <TeamOutlined />,         color: colors.info    },
            { title: 'Closed Members',  value: closedMembers.length,                                                        prefix: <CloseCircleOutlined />,  color: colors.error   },
            { title: 'Active Members',  value: activeMembers.length,                                                        prefix: <UserOutlined />,         color: colors.success },
            { title: 'Closing Batches', value: closingGroups.filter(g => g.status === 'active').length,                    prefix: <CalendarOutlined />,     color: colors.primary },
            { title: 'With Invitation', value: closedMembers.filter(m => m.closed_invitation_url).length,                  prefix: <FileTextOutlined />,     color: colors.warning },
          ].map(s => <Col span={4} key={s.title}><Card size="small"><Statistic title={s.title} value={s.value} prefix={s.prefix} valueStyle={{ color: s.color }} /></Card></Col>)}
        </Row>
      </Card>

      <Card><Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} /></Card>

      <ClosingGroupModal group={selectedGroup} visible={groupModalVisible} onClose={() => { setGroupModalVisible(false); setSelectedGroup(null) }} programList={programList} />

      <MarriageClosingDrawer
        visible={closingFormVisible} onClose={() => setClosingFormVisible(false)}
        members={members} programList={programList} currentUser={currentUser}
        onSuccess={() => { setClosingFormVisible(false); handleClosingComplete() }}
      />

      {selectedMember && (
        <MemberDetailDrawer member={selectedMember} visible={detailDrawerVisible}
          onClose={() => { setDetailDrawerVisible(false); setSelectedMember(null) }}
          programList={programList} agentList={agentList} />
      )}
    </div>
  )
}

export default ClosingMembersPage