"use client"
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar, 
  Badge, Tooltip, Row, Col, Statistic,
  Menu, message, Popover,
  Dropdown,
  Modal,
  Drawer,
  Select,
  Form,
  DatePicker,
  Descriptions,
  Progress,
  Divider,
  Tabs
} from 'antd'
import { 
  SearchOutlined, EyeOutlined, 
  CheckCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, MoreOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  FileTextOutlined, FilterOutlined, DownloadOutlined,
  ClockCircleOutlined, CalendarOutlined,
  ReloadOutlined, MailOutlined,
  ExclamationCircleOutlined,
  UserSwitchOutlined,
  SafetyCertificateOutlined,
  HistoryOutlined,
  EditOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import dayjs from 'dayjs'
import {auth, db, storage } from '../../../lib/firbase-client'
import { 
  collection, query, where, getDocs, 
  doc, updateDoc, deleteDoc, serverTimestamp,
  getDoc
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { useSelector } from 'react-redux'
import EditMember from '../members/components/EditMember'
import RejectModal from './components/RejectModal'
import ApproveModal from './components/ApproveModal'
import ViewRequests from './components/ViewRequests'
import { generateRegistrationNumber } from '../members/components/components/firebaseUtils'

const { Search } = Input
const { Option } = Select
const { TabPane } = Tabs

// Firestore helper functions
const fetchPendingMembers = async (agentId = null) => {
  try {
    let q
    if (agentId) {
      q = query(
        collection(db, 'members'),
        where('status', '==', 'pending_approval'),
        where('agentId', '==', agentId),
        where('delete_flag', '!=', true)
      )
    } else {
      q = query(
        collection(db, 'members'),
        where('status', '==', 'pending_approval'),
        where('delete_flag', '!=', true)
      )
    }
    
    const snapshot = await getDocs(q)
    const pendingMembers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      requestedAt: doc.data().requestedAt?.toDate?.() || new Date()
    }))
    
    return pendingMembers.sort((a, b) => b.requestedAt - a.requestedAt)
  } catch (error) {
    console.error('Error fetching pending members:', error)
    return []
  }
}

const fetchRejectedMembers = async (agentId = null) => {
  try {
    let q
    if (agentId) {
      q = query(
        collection(db, 'members'),
        where('status', '==', 'rejected'),
        where('agentId', '==', agentId),
        where('delete_flag', '!=', true)
      )
    } else {
      q = query(
        collection(db, 'members'),
        where('status', '==', 'rejected'),
        where('delete_flag', '!=', true)
      )
    }
    
    const snapshot = await getDocs(q)
    const rejectedMembers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      requestedAt: doc.data().requestedAt?.toDate?.() || new Date(),
      rejectedAt: doc.data().rejectedAt?.toDate?.() || new Date()
    }))
    
    return rejectedMembers.sort((a, b) => b.rejectedAt - a.rejectedAt)
  } catch (error) {
    console.error('Error fetching rejected members:', error)
    return []
  }
}

const getAgentName = (agentId, agentList) => {
  if (!agentId) return 'Admin/System'
  const agent = agentList?.find(a => a.id === agentId || a.uid === agentId)
  return agent ? agent.name : 'Unknown Agent'
}

const getProgramNames = (programIds, programList) => {
  if (!programIds || !programList) return []
  return programIds
    .map(id => {
      const program = programList.find(p => p.id === id)
      return program ? program.name : null
    })
    .filter(Boolean)
}

// Delete member files from storage
const deleteMemberFiles = async (member) => {
  try {
    const filesToDelete = []
    
    if (member.photoURL && member.photoURL.includes('firebasestorage')) {
      const photoRef = ref(storage, member.photoURL)
      filesToDelete.push(deleteObject(photoRef))
    }
    
    if (member.guardianPhotoURL && member.guardianPhotoURL.includes('firebasestorage')) {
      const guardianPhotoRef = ref(storage, member.guardianPhotoURL)
      filesToDelete.push(deleteObject(guardianPhotoRef))
    }
    
    if (member.documentFrontURL && member.documentFrontURL.includes('firebasestorage')) {
      const docFrontRef = ref(storage, member.documentFrontURL)
      filesToDelete.push(deleteObject(docFrontRef))
    }
    
    if (member.documentBackURL && member.documentBackURL.includes('firebasestorage')) {
      const docBackRef = ref(storage, member.documentBackURL)
      filesToDelete.push(deleteObject(docBackRef))
    }
    
    if (member.guardianDocumentURL && member.guardianDocumentURL.includes('firebasestorage')) {
      const guardianDocRef = ref(storage, member.guardianDocumentURL)
      filesToDelete.push(deleteObject(guardianDocRef))
    }
    
    await Promise.allSettled(filesToDelete)
  } catch (error) {
    console.error('Error deleting files:', error)
    // Don't throw error, continue with member deletion
  }
}

const Page = () => {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [pendingMembers, setPendingMembers] = useState([])
  const [rejectedMembers, setRejectedMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false)
  const [approvalModalVisible, setApprovalModalVisible] = useState(false)
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false)
  const [selectedAction, setSelectedAction] = useState(null)
  const [openEditMember, setOpenEditMember] = useState(false)
  const [editMemberId, setEditMemberId] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    agentId: 'all',
    programId: 'all'
  })
  const [stats, setStats] = useState({
    pending: {
      total: 0,
      todayRequests: 0,
      weekRequests: 0,
      agentRequests: {}
    },
    rejected: {
      total: 0,
      todayRequests: 0,
      weekRequests: 0,
      agentRequests: {}
    }
  })
  const programList = useSelector((state) => state.data.programList)
  const agentList = useSelector((state) => state.data.agentList)

  const { user } = useAuth()

  // Fetch all data
  useEffect(() => {
    fetchAllData()
    generateRegistrationNumber()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
     setDetailDrawerVisible(false)
    try {
      // Fetch pending and rejected members
      const [pending, rejected] = await Promise.all([
        fetchPendingMembers(),
        fetchRejectedMembers()
      ])
      
      setPendingMembers(pending)
      setRejectedMembers(rejected)
      
      // Calculate stats for pending
      const today = dayjs().startOf('day')
      const weekAgo = dayjs().subtract(7, 'day')
      
      const pendingTodayRequests = pending.filter(m => 
        dayjs(m.requestedAt).isSame(today, 'day')
      ).length
      
      const pendingWeekRequests = pending.filter(m => 
        dayjs(m.requestedAt).isAfter(weekAgo)
      ).length
      
      const pendingAgentRequests = {}
      pending.forEach(member => {
        if (member.agentId) {
          pendingAgentRequests[member.agentId] = (pendingAgentRequests[member.agentId] || 0) + 1
        }
      })
      
      // Calculate stats for rejected
      const rejectedTodayRequests = rejected.filter(m => 
        dayjs(m.rejectedAt).isSame(today, 'day')
      ).length
      
      const rejectedWeekRequests = rejected.filter(m => 
        dayjs(m.rejectedAt).isAfter(weekAgo)
      ).length
      
      const rejectedAgentRequests = {}
      rejected.forEach(member => {
        if (member.agentId) {
          rejectedAgentRequests[member.agentId] = (rejectedAgentRequests[member.agentId] || 0) + 1
        }
      })
      
      setStats({
        pending: {
          total: pending.length,
          todayRequests: pendingTodayRequests,
          weekRequests: pendingWeekRequests,
          agentRequests: pendingAgentRequests
        },
        rejected: {
          total: rejected.length,
          todayRequests: rejectedTodayRequests,
          weekRequests: rejectedWeekRequests,
          agentRequests: rejectedAgentRequests
        }
      })
      
    } catch (error) {
      console.error('Error fetching data:', error)
      message.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Get current members based on active tab
  const getCurrentMembers = () => {
    return activeTab === 'pending' ? pendingMembers : rejectedMembers
  }

  // Get current stats based on active tab
  const getCurrentStats = () => {
    return activeTab === 'pending' ? stats.pending : stats.rejected
  }

  // Filter members - based on active tab
  const filteredMembers = useMemo(() => {
    const members = getCurrentMembers()
    let filtered = [...members]
    
    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()
      filtered = filtered.filter(member => 
        member.displayName?.toLowerCase().includes(searchTerm) ||
        member.fatherName?.toLowerCase().includes(searchTerm) ||
        member.surname?.toLowerCase().includes(searchTerm) ||
        member.phone?.includes(searchTerm) ||
        member.aadhaarNo?.includes(searchTerm) ||
        member.registrationNumber?.toLowerCase().includes(searchTerm) ||
        member.village?.toLowerCase().includes(searchTerm) ||
        member.city?.toLowerCase().includes(searchTerm)
      )
    }
    
    // Agent filter
    if (filters.agentId !== 'all') {
      filtered = filtered.filter(member => member.agentId === filters.agentId)
    }
    
    // Program filter
    if (filters.programId !== 'all') {
      filtered = filtered.filter(member => 
        member.programIds && member.programIds.includes(filters.programId)
      )
    }
    
    return filtered
  }, [activeTab, pendingMembers, rejectedMembers, filters])

  // Handle view member details
  const handleViewMember = (member) => {
    setSelectedMember(member)
    setDetailDrawerVisible(true)
  }

  // Handle approve member
  const handleApproveMember = (member) => {
    setSelectedMember(member)
    setSelectedAction('approve')
    setApprovalModalVisible(true)

  }

  // Handle reject member
  const handleRejectMember = (member) => {
    setSelectedMember(member)
    setRejectionModalVisible(true)
  }

  // Handle delete member (permanent)
  const handleDeleteMember = async (member) => {
    Modal.confirm({
      title: 'Permanently Delete Request',
      content: (
        <div>
          <div className="text-red-600 mb-2">
            <ExclamationCircleOutlined className="mr-2" />
            This action cannot be undone!
          </div>
          <p>Are you sure you want to permanently delete this member request?</p>
          <p className="text-gray-500 text-sm mt-2">
            This will delete all uploaded files and remove the request completely from the system.
          </p>
        </div>
      ),
      okText: 'Yes, Delete Permanently',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // Delete all uploaded files
          await deleteMemberFiles(member)
          
          // Delete member document
          await deleteDoc(doc(db, 'members', member.id))
          
          // Delete member programs subcollection
          const programsRef = collection(db, 'members', member.id, 'memberPrograms')
          const programsSnap = await getDocs(programsRef)
          const deletePromises = programsSnap.docs.map(doc => deleteDoc(doc.ref))
          await Promise.all(deletePromises)
          
          // Delete payment summary if exists
          try {
            const paymentSummaryQuery = query(
              collection(db, 'memberPaymentSummaries'),
              where('memberId', '==', member.id)
            )
            const paymentSummarySnap = await getDocs(paymentSummaryQuery)
            paymentSummarySnap.forEach(async (doc) => {
              await deleteDoc(doc.ref)
            })
          } catch (error) {
            console.error('Error deleting payment summary:', error)
          }
          
          message.success('Member request permanently deleted')
          fetchAllData()
        } catch (error) {
          console.error('Error deleting member:', error)
          message.error('Failed to delete member request')
        }
      }
    })
  }

  // Execute approval




  // Generate final registration number
  const generateFinalRegistrationNumber = async () => {
    try {
      const year = dayjs().format('YYYY')
      const month = dayjs().format('MM')
      const prefix = 'MEM'
      
      // Count active members for current month
      const startDate = `01-${month}-${year}`
      const endDate = `31-${month}-${year}`
      
      const q = query(
        collection(db, 'members'),
        where('dateJoin', '>=', startDate),
        where('dateJoin', '<=', endDate),
        where('status', '==', 'active')
      )
      
      const snapshot = await getDocs(q)
      const count = snapshot.size + 1
      
      return `${prefix}${year}${month}${count.toString().padStart(4, '0')}`
    } catch (error) {
      console.error('Error generating registration number:', error)
      return `MEM${dayjs().format('YYYYMMDDHHmmss')}`
    }
  }

  // Export to CSV
  const exportToCSV = () => {
    const members = filteredMembers
    const status = activeTab === 'pending' ? 'Pending' : 'Rejected'
    
    const headers = [
      'Sr No', 'Registration No', 'Name', 'Phone', 'Aadhaar',
      'Village', 'City', 'Agent', 'Programs', 
      activeTab === 'pending' ? 'Requested Date' : 'Rejected Date',
      activeTab === 'pending' ? 'Days Pending' : 'Rejection Reason'
    ]
    
    const csvData = members.map((member, index) => [
      index + 1,
      member.registrationNumber,
      `${member.displayName} ${member.fatherName} ${member.surname}`,
      member.phone,
      member.aadhaarNo,
      member.village,
      member.city,
      getAgentName(member.agentId, agentList),
      getProgramNames(member.programIds, programList).join(', '),
      activeTab === 'pending' 
        ? dayjs(member.requestedAt).format('DD-MM-YYYY HH:mm')
        : dayjs(member.rejectedAt).format('DD-MM-YYYY HH:mm'),
      activeTab === 'pending'
        ? dayjs().diff(dayjs(member.requestedAt), 'day')
        : member.rejectionReason || 'No reason provided'
    ])
    
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${status.toLowerCase()}_members_${dayjs().format('YYYY-MM-DD')}.csv`
    a.click()
  }

  // Reset filters
  const resetFilters = () => {
    setFilters({
      search: '',
      agentId: 'all',
      programId: 'all'
    })
  }

  // Check if any filter is active
  const isFilterActive = () => {
    return filters.search || 
           filters.agentId !== 'all' || 
           filters.programId !== 'all'
  }

  const handleEditMember = (member) => {
    setEditMemberId(member.id)
    setOpenEditMember(true)
  }

  // Columns for pending members
  const pendingColumns = [
    {
      title: 'Sr No.',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (_, record, index) => index + 1
    },
    {
      title: 'Member',
      key: 'member',
      width: 180,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Avatar 
            src={record.photoURL} 
            icon={<UserOutlined />}
            size="small"
          />
          <div>
            <div className="font-medium text-sm">{record.displayName}</div>
            <div className="text-xs text-gray-500">
              {record.fatherName} • {record.surname}
            </div>
            <div className="text-xs text-gray-400">
              Age: {record.age || 'N/A'}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 140,
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-1 text-sm">
            <PhoneOutlined style={{ fontSize: '11px' }} />
            <span>{record.phone}</span>
          </div>
          {record.phoneAlt && (
            <div className="text-xs text-gray-500">
              Alt: {record.phoneAlt}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Aadhaar No.',
      key: 'aadhaarNo',
      width: 140,
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-1 text-sm">
            <UserOutlined style={{ fontSize: '11px' }} />
            <span>{record.aadhaarNo}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Agent',
      key: 'agent',
      width: 120,
      render: (_, record) => {
        const agentName = getAgentName(record.agentId, agentList)
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1">
              <UserSwitchOutlined style={{ fontSize: '11px', color: '#1890ff' }} />
              <span className="font-medium truncate" title={agentName}>
                {agentName}
              </span>
            </div>
          </div>
        )
      },
    },
    {
      title: 'Yojna',
      key: 'programs',
      width: 140,
      render: (_, record) => (
        <div className=''>
          {record.programIds?.map((id, idx) => {
            const program = programList?.find(p => p.id === id)
            return program ? (
              <Tag key={idx} color={'geekblue'}>{program.name}</Tag>
            ) : null
          })}
        </div>
      ),
    },
    {
      title: 'Requested',
      key: 'requestedAt',
      width: 140,
      render: (_, record) => (
        <div className="text-sm">
          <div>{dayjs(record.requestedAt).format('DD-MM-YYYY')}</div>
          <div className="text-xs text-gray-500">
            {dayjs(record.requestedAt).format('hh:mm A')}
          </div>
        </div>
      ),
    },
    {
      title: 'Days Pending',
      key: 'daysPending',
      width: 100,
      render: (_, record) => {
        const days = dayjs().diff(dayjs(record.requestedAt), 'day')
        let color = 'green'
        if (days > 7) color = 'orange'
        if (days > 14) color = 'red'
        
        return (
          <Tag color={color}>
            {days} day{days !== 1 ? 's' : ''}
          </Tag>
        )
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button 
              type="text" 
              icon={<EyeOutlined />} 
              onClick={() => handleViewMember(record)}
              size="small"
            />
          </Tooltip>
          
          <Dropdown
            menu={{
              items: [
                {
                  key: 'approve',
                  label: 'Approve',
                  icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
                  onClick: () => handleApproveMember(record),
                },
                {
                  key: 'reject',
                  label: 'Reject',
                  icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
                  onClick: () => handleRejectMember(record),
                },
                { type: 'divider' },
                {
                  key: 'edit',
                  label: 'Edit',
                  icon: <EditOutlined />,
                  onClick: () => handleEditMember(record),
                },
                {
                  key: 'delete',
                  label: 'Delete Permanently',
                  icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                  danger: true,
                  onClick: () => handleDeleteMember(record),
                },
              ]
            }}
            trigger={['click']}
          >
            <Tooltip title="More Actions">
              <Button
                type="text"
                icon={<MoreOutlined />}
                size="small"
              />
            </Tooltip>
          </Dropdown>
        </Space>
      ),
    },
  ]

  // Columns for rejected members
  const rejectedColumns = [
    {
      title: 'Sr No.',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (_, record, index) => index + 1
    },
    {
      title: 'Member',
      key: 'member',
      width: 180,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Avatar 
            src={record.photoURL} 
            icon={<UserOutlined />}
            size="small"
          />
          <div>
            <div className="font-medium text-sm">{record.displayName}</div>
            <div className="text-xs text-gray-500">
              {record.fatherName} • {record.surname}
            </div>
            <div className="text-xs text-gray-400">
              Age: {record.age || 'N/A'}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 140,
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-1 text-sm">
            <PhoneOutlined style={{ fontSize: '11px' }} />
            <span>{record.phone}</span>
          </div>
          {record.phoneAlt && (
            <div className="text-xs text-gray-500">
              Alt: {record.phoneAlt}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Rejection Reason',
      key: 'rejectionReason',
      width: 200,
      render: (_, record) => (
        <Tooltip title={record.rejectionReason}>
          <div className="text-sm text-red-600 max-w-[180px] truncate">
            <CloseCircleOutlined className="mr-1" />
            {record.rejectionReason || 'No reason provided'}
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Rejected By',
      key: 'rejectedBy',
      width: 120,
      render: (_, record) => (
        <div className="text-xs">
          <div className="font-medium">{record.rejectedByName || 'Unknown'}</div>
        </div>
      ),
    },
    {
      title: 'Rejected On',
      key: 'rejectedAt',
      width: 140,
      render: (_, record) => (
        <div className="text-sm">
          <div>{dayjs(record.rejectedAt).format('DD-MM-YYYY')}</div>
          <div className="text-xs text-gray-500">
            {dayjs(record.rejectedAt).format('hh:mm A')}
          </div>
        </div>
      ),
    },
    {
      title: 'Agent',
      key: 'agent',
      width: 120,
      render: (_, record) => {
        const agentName = getAgentName(record.agentId, agentList)
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1">
              <UserSwitchOutlined style={{ fontSize: '11px', color: '#1890ff' }} />
              <span className="font-medium truncate" title={agentName}>
                {agentName}
              </span>
            </div>
          </div>
        )
      },
    },
    {
      title: 'Yojna',
      key: 'programs',
      width: 140,
      render: (_, record) => (
        <div className=''>
          {record.programIds?.map((id, idx) => {
            const program = programList?.find(p => p.id === id)
            return program ? (
              <Tag key={idx} color={'geekblue'}>{program.name}</Tag>
            ) : null
          })}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button 
              type="text" 
              icon={<EyeOutlined />} 
              onClick={() => handleViewMember(record)}
              size="small"
            />
          </Tooltip>
          
          <Dropdown
            menu={{
              items: [
                {
                  key: 'edit',
                  label: 'Edit',
                  icon: <EditOutlined />,
                  onClick: () => handleEditMember(record),
                },
                {
                  key: 'delete',
                  label: 'Delete Permanently',
                  icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                  danger: true,
                  onClick: () => handleDeleteMember(record),
                },
              ]
            }}
            trigger={['click']}
          >
            <Tooltip title="More Actions">
              <Button
                type="text"
                icon={<MoreOutlined />}
                size="small"
              />
            </Tooltip>
          </Dropdown>
        </Space>
      ),
    },
  ]

  return (
    <div className="">
      <Card className="mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClockCircleOutlined className="text-orange-500" />
              Member Requests Management
            </h1>
            <p className="text-gray-500">
              Manage pending and rejected member registration requests
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchAllData}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              icon={<DownloadOutlined />} 
              onClick={exportToCSV}
              disabled={filteredMembers.length === 0}
            >
              Export CSV
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          className="mb-4"
        >
          <TabPane 
            tab={
              <span>
                <ClockCircleOutlined />
                Pending Requests ({stats.pending.total})
              </span>
            } 
            key="pending"
          />
          <TabPane 
            tab={
              <span>
                <CloseCircleOutlined />
                Rejected Requests ({stats.rejected.total})
              </span>
            } 
            key="rejected"
          />
        </Tabs>

        {/* Stats Row - Dynamic based on active tab */}
        <Row gutter={16} className="mb-4">
          <Col span={8}>
            <Card size="small">
              <Statistic
                title={`Total ${activeTab === 'pending' ? 'Pending' : 'Rejected'} Requests`}
                value={activeTab === 'pending' ? stats.pending.total : stats.rejected.total}
                prefix={activeTab === 'pending' ? <ClockCircleOutlined /> : <CloseCircleOutlined />}
                valueStyle={{ color: activeTab === 'pending' ? '#fa8c16' : '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Today's Requests"
                value={activeTab === 'pending' ? stats.pending.todayRequests : stats.rejected.todayRequests}
                prefix={<CalendarOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Last 7 Days"
                value={activeTab === 'pending' ? stats.pending.weekRequests : stats.rejected.weekRequests}
                prefix={<HistoryOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* Filters Bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2 items-center flex-wrap">
            <Search
              placeholder={`Search ${activeTab} requests...`}
              prefix={<SearchOutlined />}
              style={{ width: 300 }}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              value={filters.search}
              allowClear
            />
            
            {/* Agent Filter */}
            <Select
              placeholder="Filter by Agent"
              style={{ width: 200 }}
              value={filters.agentId}
              onChange={(value) => setFilters(prev => ({ ...prev, agentId: value || 'all' }))}
              allowClear
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              <Option value="all">All Agents</Option>
              {agentList && agentList.map(agent => (
                <Option key={agent.id} value={agent.uid}>
                  {agent.name} ({
                    activeTab === 'pending' 
                      ? (stats.pending.agentRequests[agent.uid] || 0)
                      : (stats.rejected.agentRequests[agent.uid] || 0)
                  })
                </Option>
              ))}
            </Select>
            
            {/* Program Filter */}
            <Select
              placeholder="Filter by Program"
              style={{ width: 200 }}
              value={filters.programId}
              onChange={(value) => setFilters(prev => ({ ...prev, programId: value || 'all' }))}
              allowClear
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              <Option value="all">All Programs</Option>
              {programList && programList.map(program => (
                <Option key={program.id} value={program.id}>
                  {program.name}
                </Option>
              ))}
            </Select>
            
            {/* Clear Filters Button */}
            {isFilterActive() && (
              <Button 
                type="link" 
                onClick={resetFilters}
                icon={<ReloadOutlined />}
              >
                Clear Filters
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            <span className="text-gray-500 text-sm">
              Showing {filteredMembers.length} of {getCurrentMembers().length} {activeTab} requests
            </span>
          </div>
        </div>

        {/* Main Table - Dynamic columns based on active tab */}
        <Table
          columns={activeTab === 'pending' ? pendingColumns : rejectedColumns}
          dataSource={filteredMembers}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} ${activeTab} requests`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 1400 }}
          size="small"
        />
      </Card>
<ViewRequests 
activeTab={activeTab}
open={detailDrawerVisible}
setOpen={setDetailDrawerVisible}
handleRejectMember={handleRejectMember}
handleApproveMember={handleApproveMember}
selectedMember={selectedMember}
     getProgramNames={getProgramNames}
      setSelectedMember={setSelectedMember}
          fetchAllData={fetchAllData}
          programList={programList}
          user={user}
          getAgentName={getAgentName}
          agentList={agentList}
/>
      {/* Member Detail Drawer */}

  {approvalModalVisible && <ApproveModal
  open={approvalModalVisible}
  setOpen={setApprovalModalVisible}
  selectedMember={selectedMember}
     getProgramNames={getProgramNames}
      setSelectedMember={setSelectedMember}
          fetchAllData={fetchAllData}
          programList={programList}
          user={user}
  />}
 

      {/* Rejection Modal */}
      {rejectionModalVisible && (
        <RejectModal
          open={rejectionModalVisible}
          setOpen={setRejectionModalVisible}
          setSelectedMember={setSelectedMember}
          selectedMember={selectedMember}
          getProgramNames={getProgramNames}
          fetchAllData={fetchAllData}
          programList={programList}
          user={user}
        />
      )}
     
      {/* Edit Member Modal */}
      <EditMember
        programs={programList || []}
        agents={agentList || []}
        open={openEditMember}
        setOpen={setOpenEditMember}
        currentUser={user}
        memberId={editMemberId}
        onSuccess={() => {
          fetchAllData()
             
        }}
      />
    </div>
  )
}

export default Page