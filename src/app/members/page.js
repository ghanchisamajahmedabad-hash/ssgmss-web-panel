"use client"
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import AddMember from './components/AddMember'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar, 
  Badge, Tooltip, Row, Col, Statistic,
   Menu, message, Popover,
   Dropdown,
   Modal,
   Drawer
} from 'antd'
import { 
  PlusOutlined, SearchOutlined, EyeOutlined, 
  EditOutlined, DeleteOutlined, MoreOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined, FilterOutlined, DownloadOutlined,
  DollarOutlined, TeamOutlined, CalendarOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import { collection, query, getDocs, doc, updateDoc, orderBy, where } from 'firebase/firestore'
import dayjs from 'dayjs'
import MemberDetailDrawer from './components/MemberDetailsView'
import { db } from '../../../lib/firbase-client'
import EditMember from './components/EditMember'
import CertificateViewer from './components/MemberPdf/CertificateViewer'

const { Search } = Input

const Page = () => {
  const [openAddMember, setOpenAddMember] = useState(false)
   const [openEditMember, setOpenEditMember] = useState(false) // Add this state
  const [editMemberId, setEditMemberId] = useState(null) // Add this state
  const [searchText, setSearchText] = useState('')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const[openCertificate,setOpenCertificate]=useState(false)
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pendingPayments: 0,
    todayAdded: 0,
    totalRevenue: 0
  })
  const programList = useSelector((state) => state.data.programList)
  const agentList = useSelector((state) => state.data.agentList)
  const { user } = useAuth()
  
  // Fetch members data
  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const membersRef = collection(db, 'members')
      const q = query(membersRef,where('delete_flag', '==', false), orderBy('createdAt', 'desc'))
      const querySnapshot = await getDocs(q)
      
      const membersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Format timestamps
        createdAt: doc.data().createdAt?.toDate?.() || null,
        updated_at: doc.data().updated_at?.toDate?.() || null
      }))
      
      setMembers(membersData)
      calculateStats(membersData)
    } catch (error) {
      console.error('Error fetching members:', error)
      message.error('Failed to load members data')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (membersData) => {
    const today = dayjs().format('DD-MM-YYYY')
    
    const stats = {
      total: membersData.length,
      active: membersData.filter(m => m.active_flag && !m.delete_flag).length,
      pendingPayments: membersData.filter(m => m.hasPendingPayments).length,
      todayAdded: membersData.filter(m => m.dateJoin === today).length,
      totalRevenue: membersData.reduce((sum, m) => sum + (m.paidAmount || 0), 0)
    }
    
    setStats(stats)
  }

  const handleSearch = (value) => {
    setSearchText(value)
  }

  const filteredMembers = members.filter(member => {
    if (!searchText) return true
    
    const searchLower = searchText.toLowerCase()
    
    // Search across multiple fields
    return (
      (member.displayName?.toLowerCase() || '').includes(searchLower) ||
      (member.fatherName?.toLowerCase() || '').includes(searchLower) ||
      (member.phone?.includes(searchText)) ||
      (member.registrationNumber?.toLowerCase() || '').includes(searchLower) ||
      (member.aadhaarNo?.includes(searchText)) ||
      (member.village?.toLowerCase() || '').includes(searchLower) ||
      (member.search_keywords?.some(keyword => 
        keyword.toLowerCase().includes(searchLower)
      )) ||
      false
    )
  })

  const handleViewMember = async (member) => {
    setSelectedMember(member)
    // setDetailDrawerVisible(true)
    setOpenCertificate(true)
  }


 const handleEditMember = (member) => {
    setEditMemberId(member.id)
    setOpenEditMember(true)
  }
  const handleDeleteMember = async (member) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Are you sure you want to delete member ${member.displayName}?`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // Soft delete - set delete_flag to true
          await updateDoc(doc(db, 'members', member.id), {
            delete_flag: true,
            deleted_at: new Date(),
            deleted_by: user?.uid
          })
          
          message.success('Member deleted successfully')
          fetchMembers() // Refresh the list
        } catch (error) {
          console.error('Error deleting member:', error)
          message.error('Failed to delete member')
        }
      }
    })
  }

  const handleToggleStatus = async (member) => {
    try {
      await updateDoc(doc(db, 'members', member.id), {
        active_flag: !member.active_flag,
        updated_at: new Date()
      })
      
      message.success(`Member ${!member.active_flag ? 'activated' : 'deactivated'} successfully`)
      fetchMembers() // Refresh the list
    } catch (error) {
      console.error('Error toggling member status:', error)
      message.error('Failed to update member status')
    }
  }

  // Columns for member table
  const columns = [
    {
      title: 'Reg. No.',
      dataIndex: 'registrationNumber',
      key: 'registrationNumber',
      width: 120,
      fixed: 'left',
      sorter: (a, b) => a.registrationNumber?.localeCompare(b.registrationNumber),
      render: (text) => (
        <Tag color="blue" style={{ fontWeight: 'bold' }}>
          {text}
        </Tag>
      ),
    },
    {
      title: 'Member',
      key: 'member',
      width: 200,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Avatar 
            src={record.photoURL} 
            icon={<UserOutlined />}
            size="small"
          />
          <div>
            <div className="font-medium">{record.displayName}</div>
            <div className="text-xs text-gray-500">
              {record.fatherName} • {record.surname}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 150,
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-1">
            <PhoneOutlined style={{ fontSize: '12px' }} />
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
      title: 'Aadhaar',
      dataIndex: 'aadhaarNo',
      key: 'aadhaarNo',
      width: 140,
     
    },
    {
      title: 'Programs',
      key: 'programs',
      width: 120,
      render: (_, record) => (
        <Popover 
          title="Programs" 
          content={
            <div>
              {record.programIds?.map((id, idx) => {
                const program = programList?.find(p => p.id === id)
                return program ? (
                  <div key={idx} className="text-xs py-1 text-primary">{program.name}</div>
                ) : null
              })}
            </div>
          }
        >
          <div>
            <Badge 
              count={record.programIds?.length || 0} 
              showZero 
              color={record.programIds?.length > 0 ? 'blue' : 'gray'}
            />
            <div className="text-xs text-gray-500 mt-1">
              {record.programPaymentSummary?.fullyPaidPrograms || 0} paid
            </div>
          </div>
        </Popover>
      ),
    },
    {
      title: 'Payment',
      key: 'payment',
      width: 150,
      sorter: (a, b) => (a.paymentPercentage || 0) - (b.paymentPercentage || 0),
      render: (_, record) => {
        const percentage = record.paymentPercentage || 0
        let color = 'red'
        let icon = <ClockCircleOutlined />
        
        if (percentage === 100) {
          color = 'green'
          icon = <CheckCircleOutlined />
        } else if (percentage > 0) {
          color = 'orange'
        }
        
        return (  
          <div>
            <div className="flex items-center gap-1">
              {icon}
              <span style={{ color, fontWeight: 'bold' }}>
                {percentage}%
              </span>
            </div>
            <div className="text-xs">
              ₹{record.paidAmount || 0}/₹{record.joinFees || 0}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Join Date',
      dataIndex: 'dateJoin',
      key: 'dateJoin',
      width: 110,
      sorter: (a, b) => dayjs(a.dateJoin, 'DD-MM-YYYY').unix() - dayjs(b.dateJoin, 'DD-MM-YYYY').unix(),
      render: (text) => (
        <div>
          <div>{text}</div>
          {dayjs(text, 'DD-MM-YYYY').isSame(dayjs(), 'day') && (
            <Tag color="green" size="small">Today</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      filters: [
        { text: 'Active', value: 'active' },
        { text: 'Inactive', value: 'inactive' },
        { text: 'Pending Payment', value: 'pending_payment' },
      ],
      onFilter: (value, record) => {
        if (value === 'active') return record.active_flag
        if (value === 'inactive') return !record.active_flag
        if (value === 'pending_payment') return record.hasPendingPayments
        return true
      },
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Tag 
            color={record.active_flag ? 'green' : 'red'}
            icon={record.active_flag ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          >
            {record.active_flag ? 'Active' : 'Inactive'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => {
       const items = [
  {
    key: 'view',
    label: 'View Details',
    icon: <EyeOutlined />,
    onClick: () => handleViewMember(record),
  },
  {
    key: 'edit',
    label: 'Edit',
    icon: <EditOutlined />,
    onClick: () => handleEditMember(record),
  },
  {
    key: 'toggle',
    label: record.active_flag ? 'Deactivate' : 'Activate',
    onClick: () => handleToggleStatus(record),
  },
  { type: 'divider' },
  {
    key: 'delete',
    label: 'Delete',
    icon: <DeleteOutlined style={{ color: 'red' }} />,
    onClick: () => handleDeleteMember(record),
  },
]
        return (
          <Space>
            <Tooltip title="View Details">
              <Button 
                type="text" 
                icon={<EyeOutlined />} 
                onClick={() => handleViewMember(record)}
                size="small"
              />
            </Tooltip>
     <Dropdown menu={{ items }} trigger={['click']}>
  <Tooltip title="More Options">
    <Button
      type="text"
      icon={<MoreOutlined />}
      size="small"
    />
  </Tooltip>
</Dropdown>
          </Space>
        )
      },
    },
  ]

  const exportToCSV = () => {
    // Simple CSV export implementation
    const headers = [
      'Registration No', 'Name', 'Father Name', 'Phone', 'Aadhaar',
      'Village', 'City', 'Join Date', 'Status', 'Payment %', 'Paid Amount'
    ]
    
    const csvData = members.map(member => [
      member.registrationNumber,
      member.displayName,
      member.fatherName,
      member.phone,
      member.aadhaarNo,
      member.village,
      member.city,
      member.dateJoin,
      member.active_flag ? 'Active' : 'Inactive',
      member.paymentPercentage || 0,
      member.paidAmount || 0
    ])
    
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `members_${dayjs().format('YYYY-MM-DD')}.csv`
    a.click()
  }

  return (
    <div className="">


      {/* Main Card */}
      <Card className="mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Members Management</h1>
            <p className="text-gray-500">Manage all member registrations and information</p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpenAddMember(true)}
            size="large"
          >
            Add New Member
          </Button>
        </div>

        {/* Search and Actions Bar */}
        <div className="flex justify-between items-center mb-4">
          <Search
            placeholder="Search by name, phone, aadhaar, village..."
            prefix={<SearchOutlined />}
            style={{ width: 400 }}
            onSearch={handleSearch}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            enterButton
          />
          <div className="flex gap-2">
            <Tooltip title="Export to CSV">
              <Button 
                icon={<DownloadOutlined />} 
                onClick={exportToCSV}
              >
                Export
              </Button>
            </Tooltip>
            <Tooltip title="Filter Options">
              <Button icon={<FilterOutlined />}>
                Filter
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Members Table */}
        <Table
          columns={columns}
          dataSource={filteredMembers}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} members`,
          }}
          scroll={{ x: 1300 }}
          sticky
          onChange={(pagination, filters, sorter) => {
            console.log('Table changed:', { pagination, filters, sorter })
          }}
        />
      </Card>

      {/* Add Member Drawer */}
      <AddMember
        programs={programList || []}
        agents={agentList || []}
        open={openAddMember}
        setOpen={setOpenAddMember}
        currentUser={user}
        onSuccess={fetchMembers} // Refresh table after adding member
      />
       <EditMember
        programs={programList || []}
        agents={agentList || []}
        open={openEditMember}
        setOpen={setOpenEditMember}
        currentUser={user}
        memberId={editMemberId}
        onSuccess={fetchMembers}
      />

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
        />
      )}
      {
        openCertificate && <Drawer
open={openCertificate}
onClose={()=>{
  setOpenCertificate(false)
}}
title={"Member Certificates"}
size={800}
destroyOnHidden
>
<CertificateViewer memberData={selectedMember}/>
</Drawer>
      }


    </div>
  )
}

export default Page