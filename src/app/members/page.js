"use client"
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSelector } from 'react-redux'
import AddMember from './components/AddMember'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar, 
  Badge, Tooltip, Row, Col, Statistic,
  Menu, message, Popover,
  Dropdown,
  Modal,
  Drawer,
  Select,
  Form,
  DatePicker
} from 'antd'
import { 
  PlusOutlined, SearchOutlined, EyeOutlined, 
  EditOutlined, DeleteOutlined, MoreOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined, FilterOutlined, DownloadOutlined,
  DollarOutlined, TeamOutlined, CalendarOutlined,
  ReloadOutlined, SettingOutlined, CloseOutlined,
  UserAddOutlined, UserSwitchOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import dayjs from 'dayjs'
import MemberDetailDrawer from './components/MemberDetailsView'
import EditMember from './components/EditMember'
import CertificateViewer from './components/MemberPdf/CertificateViewer'
import { 
  fetchMembersPaginated, 
  getTotalMembersCount,
  fetchAllMembersForSearch
} from './components/firebase-helpers'
import { auth, db } from '../../../lib/firbase-client'
import { doc, updateDoc } from 'firebase/firestore'
import { PDFDownloadLink } from '@react-pdf/renderer'
import CertificateCom from './components/MemberPdf/CertificateCom'

const { Search } = Input
const { Option } = Select

const Page = () => {
  const [openAddMember, setOpenAddMember] = useState(false)
  const [openEditMember, setOpenEditMember] = useState(false)
  const [editMemberId, setEditMemberId] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [openCertificate, setOpenCertificate] = useState(false)
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false)
  const [filterModalVisible, setFilterModalVisible] = useState(false)
  const currentUser = auth.currentUser
  
  // Search mode
  const [searchMode, setSearchMode] = useState('paginated')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  
  // Pagination state
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
    lastDoc: null,
    lastDocs: {}
  })
  
  // Filters state - Added agentId filter
  const [filters, setFilters] = useState({
    search: '',
    programId: 'all',
    agentId: 'all', // NEW: Agent filter
    status: 'all',
    paymentStatus: 'all',
    fromDate: null,
    toDate: null,
    sortField: 'createdAt',
    sortOrder: 'desc'
  })
  
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
  
  const [filterForm] = Form.useForm()
  const searchTimerRef = useRef(null)

  // Get agent name by ID - SIMPLE VERSION
  const getAgentName = useCallback((agentId) => {
    if (!agentId) return 'Admin/System';
    
    const agent = agentList?.find(a => a.id === agentId || a.uid===agentId);
    return agent ? agent.name : 'Unknown Agent';
  }, [agentList])


  // Get displayed members
  const displayedMembers = useMemo(() => {
    return searchMode === 'search' ? searchResults : members
  }, [searchMode, searchResults, members])

  // Calculate stats
  useEffect(() => {
    if (displayedMembers.length > 0) {
      const today = dayjs().format('DD-MM-YYYY')
      
      const currentStats = {
        total: searchMode === 'search' ? searchResults.length : pagination.total,
        active: displayedMembers.filter(m => m.active_flag).length,
        pendingPayments: displayedMembers.filter(m => 
          m.paymentPercentage < 100
        ).length,
        todayAdded: displayedMembers.filter(m => m.dateJoin === today).length,
        totalRevenue: displayedMembers.reduce((sum, m) => sum + (m.paidAmount || 0), 0)
      }
      
      setStats(currentStats)
    }
  }, [displayedMembers, pagination.total, searchMode, searchResults.length])

  // Fetch members with pagination
  const fetchMembers = useCallback(async (page = 1, resetPagination = false) => {
    setLoading(true)
    setSearchMode('paginated')
    
    try {
      const lastDoc = resetPagination ? null : pagination.lastDocs[page - 1] || null
      
      const fetchParams = {
        ...filters,
        search: '', // Don't use search in paginated mode
        pageSize: pagination.pageSize,
        lastDoc: lastDoc
      }
      
      const result = await fetchMembersPaginated(fetchParams)
      
      setMembers(result.members)
      
      const newLastDocs = { ...pagination.lastDocs }
      if (result.lastDoc) {
        newLastDocs[page] = result.lastDoc
      }
      
      setPagination(prev => ({
        ...prev,
        lastDocs: newLastDocs,
        hasNextPage: result.hasNextPage,
        current: page
      }))
      
      if (resetPagination) {
        const totalCount = await getTotalMembersCount(filters)
        setPagination(prev => ({ ...prev, total: totalCount }))
      }
      
    } catch (error) {
      console.error('Error fetching members:', error)
      message.error('Failed to load members data')
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.pageSize, pagination.lastDocs])

  // Search members
  const searchMembers = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchMode('paginated')
      setSearchResults([])
      fetchMembers(1, false)
      return
    }

    setSearchLoading(true)
    setSearchMode('search')
    
    try {
      const results = await fetchAllMembersForSearch(searchTerm, filters.agentId)
      setSearchResults(results)
      
      if (results.length === 0) {
        message.info('No members found matching your search')
      }
    } catch (error) {
      console.error('Error searching members:', error)
      message.error('Failed to search members')
    } finally {
      setSearchLoading(false)
    }
  }, [fetchMembers, filters.agentId])

  // Debounced search handler
  const handleSearch = useCallback((value) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    searchTimerRef.current = setTimeout(() => {
      searchMembers(value)
    }, 500)
  }, [searchMembers])

  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value
    setFilters(prev => ({ ...prev, search: value }))
    handleSearch(value)
  }

  // Initial load
  useEffect(() => {
    fetchMembers(1, true)
  }, [])

  // Handle filter form changes
  const handleFilterChange = (changedValues, allValues) => {
    setFilters(prev => ({ ...prev, ...changedValues }))
  }

  // Apply filters
  const applyFilters = () => {
    setFilterModalVisible(false)
    setPagination(prev => ({ 
      ...prev, 
      current: 1, 
      lastDoc: null,
      lastDocs: {} 
    }))
    fetchMembers(1, true)
  }

  // Reset filters
  const resetFilters = () => {
    const resetValues = {
      programId: 'all',
      agentId: 'all',
      status: 'all',
      paymentStatus: 'all',
      fromDate: null,
      toDate: null,
      sortField: 'createdAt',
      sortOrder: 'desc'
    }
    setFilters(prev => ({ ...prev, ...resetValues }))
    filterForm.resetFields()
    setSearchMode('paginated')
    setSearchResults([])
    setPagination(prev => ({ 
      ...prev, 
      current: 1, 
      lastDoc: null,
      lastDocs: {} 
    }))
    setTimeout(() => fetchMembers(1, true), 0)
  }

  // Get active filter count
  const getActiveFilterCount = () => {
    let count = 0
    if (filters.programId !== 'all') count++
    if (filters.agentId !== 'all') count++
    if (filters.status !== 'all') count++
    if (filters.paymentStatus !== 'all') count++
    if (filters.fromDate) count++
    if (filters.toDate) count++
    return count
  }

  // Format date
  const formatDate = (date) => {
    return date ? dayjs(date).format('DD-MM-YYYY') : null
  }

  // Handle table pagination change
  const handleTableChange = (paginationInfo, filtersInfo, sorter) => {
    if (searchMode === 'search') {
      setPagination(prev => ({
        ...prev,
        current: paginationInfo.current,
        pageSize: paginationInfo.pageSize
      }))
      return
    }

    const pageChanged = paginationInfo.current !== pagination.current
    const pageSizeChanged = paginationInfo.pageSize !== pagination.pageSize
    
    if (pageSizeChanged) {
      setPagination(prev => ({
        ...prev,
        current: 1,
        pageSize: paginationInfo.pageSize,
        lastDocs: {}
      }))
      setTimeout(() => fetchMembers(1, true), 0)
      return
    }

    if (sorter.field && sorter.order) {
      setFilters(prev => ({
        ...prev,
        sortField: sorter.field,
        sortOrder: sorter.order === 'ascend' ? 'asc' : 'desc'
      }))
      setPagination(prev => ({ 
        ...prev, 
        current: 1,
        lastDocs: {} 
      }))
      setTimeout(() => fetchMembers(1, true), 0)
      return
    }

    if (pageChanged) {
      fetchMembers(paginationInfo.current, false)
    }
  }

  const handleViewMember = async (member) => {
    setSelectedMember(member)
    setDetailDrawerVisible(true)
  }
  
  const handleCertificateMember = async (member) => {


      const agentData=agentList?.find(agent=>agent.id===member.agentId)||{}

    setSelectedMember({
      ...member,
      agentName: agentData.name||'Admin/System',
      agentPhone: agentData.phone1||'',
    })
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
          await updateDoc(doc(db, 'members', member.id), {
            delete_flag: true,
            deleted_at: new Date(),
            deleted_by: user?.uid
          })
          
          message.success('Member deleted successfully')
          
          if (searchMode === 'search' && filters.search) {
            searchMembers(filters.search)
          } else {
            fetchMembers(pagination.current, false)
          }
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
      
      if (searchMode === 'search' && filters.search) {
        searchMembers(filters.search)
      } else {
        fetchMembers(pagination.current, false)
      }
    } catch (error) {
      console.error('Error toggling member status:', error)
      message.error('Failed to update member status')
    }
  }

  const columns = [
    {
      title: 'Reg. No.',
      dataIndex: 'registrationNumber',
      key: 'registrationNumber',
      width: 130,
      fixed: 'left',
      sorter: searchMode === 'paginated',
      render: (text) => (
        <Tag color="blue" style={{ fontWeight: 'bold', fontSize: '12px' }}>
          {text}
        </Tag>
      ),
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
      title: 'Aadhaar',
      dataIndex: 'aadhaarNo',
      key: 'aadhaarNo',
      width: 130,
      render: (text) => <span className="text-sm">{text}</span>,
    },
    // NEW: Agent Column
    {
      title: 'Agent',
      key: 'agent',
      width: 120,
      render: (_, record) => {
        const agentName = getAgentName(record.agentId)
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1">
              <UserSwitchOutlined style={{ fontSize: '11px', color: '#1890ff' }} />
              <span className="font-medium truncate" title={agentName}>
                {agentName}
              </span>
            </div>
            {record.agentId && agentName === 'Unknown Agent' && (
              <div className="text-gray-500 text-xs truncate" title={record.agentId}>
                ID: {record.agentId.substring(0, 8)}...
              </div>
            )}
          </div>
        )
      },
    },
   {
  title: 'Yojna',
  key: 'programs',
  width: 200,
  render: (_, record) => {
    if (!record.programIds || record.programIds.length === 0) {
      return <span className="text-gray-400 text-xs">No Program</span>
    }

    return (
      <div className='flex items-center gap-1 flex-wrap'>
        {record.programIds.map((id) => {
          const program = programList?.find(p => p.id === id)
          return program ? (
             <Tag color="pink" style={{ fontWeight: 'bold', fontSize: '10px' }}>
               {program.name}
             </Tag>
           
          ) : null
        })}
      </div>
    )
  },
},
    {
      title: 'Join Fees',
      key: 'payment',
      width: 140,
      sorter: searchMode === 'paginated',
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
            <div className="flex items-center gap-1 text-sm">
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
      sorter: searchMode === 'paginated',
      render: (text) => (
        <div className="text-sm">
          <div>{text}</div>
          {text && dayjs(text, 'DD-MM-YYYY').isSame(dayjs(), 'day') && (
            <Tag color="green" size="small" className="text-xs">Today</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_, record) => (
        <Tag 
          color={record.active_flag ? 'green' : 'red'}
          icon={record.active_flag ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          size="small"
          className="text-xs"
        >
          {record.active_flag ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
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
            key: 'certificate',
            label: 'Certificate',
            icon: <FileTextOutlined />,
            onClick: () => handleCertificateMember(record),
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
                className="text-xs"
              />
            </Tooltip>
            <Dropdown menu={{ items }} trigger={['click']}>
              <Tooltip title="More Options">
                <Button
                  type="text"
                  icon={<MoreOutlined />}
                  size="small"
                  className="text-xs"
                />
              </Tooltip>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  const exportToCSV = () => {
    const headers = [
      'Registration No', 'Name', 'Father Name', 'Phone', 'Aadhaar',
      'Village', 'City', 'Join Date', 'Status', 'Payment %', 'Paid Amount',
      'Agent Name'
    ]
    
    const csvData = displayedMembers.map(member => [
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
      member.paidAmount || 0,
      getAgentName(member.agentId)
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

  const fileName = selectedMember?.displayName?.replace(/\s+/g,'_')+"_"+selectedMember?.registrationNumber+"_certificate"||'certificate.pdf'

  return (
    <div className="">
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

        {/* Stats Row */}
      

        {/* Search and Filters Bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2 items-center">
            <Search
              placeholder="Search by name, fatherName,reg no,phone,aadhaar,village..."
              prefix={<SearchOutlined />}
              style={{ width: 450 }}
              onChange={handleSearchChange}
              value={filters.search}
              allowClear
              loading={searchLoading}
            />
            {searchMode === 'search' && (
              <Tag color="blue" className="text-xs">
                Search Mode - {searchResults.length} results
              </Tag>
            )}
          </div>
          
          <div className="flex gap-2">
            {/* Active Filters Display */}
            <div className="flex gap-1 items-center">
              {getActiveFilterCount() > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {filters.programId !== 'all' && (
                    <Tag color="blue" closable onClose={() => {
                      setFilters(prev => ({...prev, programId: 'all'}))
                      fetchMembers(1, true)
                    }}>
                      Program: {programList?.find(p => p.id === filters.programId)?.name || filters.programId}
                    </Tag>
                  )}
                  {filters.agentId !== 'all' && (
                    <Tag color="purple" closable onClose={() => {
                      setFilters(prev => ({...prev, agentId: 'all'}))
                      fetchMembers(1, true)
                    }}>
                      Agent: {getAgentName(filters.agentId)}
                    </Tag>
                  )}
                  {filters.status !== 'all' && (
                    <Tag color="green" closable onClose={() => {
                      setFilters(prev => ({...prev, status: 'all'}))
                      fetchMembers(1, true)
                    }}>
                      Status: {filters.status}
                    </Tag>
                  )}
                  {filters.paymentStatus !== 'all' && (
                    <Tag color="orange" closable onClose={() => {
                      setFilters(prev => ({...prev, paymentStatus: 'all'}))
                      fetchMembers(1, true)
                    }}>
                      Payment: {filters.paymentStatus}
                    </Tag>
                  )}
                  {filters.fromDate && (
                    <Tag color="purple" closable onClose={() => {
                      setFilters(prev => ({...prev, fromDate: null}))
                      fetchMembers(1, true)
                    }}>
                      From: {formatDate(filters.fromDate)}
                    </Tag>
                  )}
                  {filters.toDate && (
                    <Tag color="cyan" closable onClose={() => {
                      setFilters(prev => ({...prev, toDate: null}))
                      fetchMembers(1, true)
                    }}>
                      To: {formatDate(filters.toDate)}
                    </Tag>
                  )}
                </div>
              )}
            </div>
            
            <Button 
              icon={<FilterOutlined />}
              onClick={() => setFilterModalVisible(true)}
              className={getActiveFilterCount() > 0 ? 'text-primary border-primary' : ''}
            >
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Button>
            
            <Tooltip title="Export to CSV">
              <Button 
                icon={<DownloadOutlined />} 
                onClick={exportToCSV}
              >
                Export
              </Button>
            </Tooltip>
            
            <Tooltip title="Refresh">
              <Button 
                icon={<ReloadOutlined />} 
                onClick={() => {
                  if (searchMode === 'search' && filters.search) {
                    searchMembers(filters.search)
                  } else {
                    fetchMembers(pagination.current, false)
                  }
                }}
                loading={loading || searchLoading}
              >
                Refresh
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Members Table */}
        <Table
          columns={columns}
          dataSource={displayedMembers}
          rowKey="id"
          loading={loading || searchLoading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: searchMode === 'search' ? searchResults.length : pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} members`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1300, y: '50vh' }}
          sticky
          size="small"
          className="compact-table"
          rowClassName="text-xs"
        />
      </Card>

      {/* Filter Modal - Updated with Agent Filter */}
      <Modal
        title={
          <div className="flex justify-between items-center">
            <span>
              <FilterOutlined className="mr-2" />
              Advanced Filters
            </span>
            <div className="flex gap-2">
              {getActiveFilterCount() > 0 && (
                <Button 
                  type="link" 
                  danger 
                  onClick={resetFilters}
                  size="small"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
        }
        open={filterModalVisible}
        onCancel={() => setFilterModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setFilterModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="reset" onClick={resetFilters}>
            Reset
          </Button>,
          <Button key="apply" type="primary" onClick={applyFilters}>
            Apply Filters
          </Button>,
        ]}
        width={600}
      >
        <Form
          form={filterForm}
          layout="vertical"
          onValuesChange={handleFilterChange}
          initialValues={filters}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Yojna" name="programId">
                <Select placeholder="Select Yojna">
                  <Option value="all">All Yojna</Option>
                  {programList?.map(program => (
                    <Option key={program.id} value={program.id}>
                      {program.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item label="Agent" name="agentId">
           <Select
  placeholder="Select Agent"
  showSearch={{
    optionFilterProp: 'children',
    filterOption: (input, option) =>
      option?.children
        ?.toString()
        .toLowerCase()
        .includes(input.toLowerCase())
  }}
>
  <Select.Option value="all">All Agents</Select.Option>

  {agentList?.map(agent => (
    <Select.Option key={agent.id} value={agent.id}>
      {agent.name} ({agent.phone1 || 'No phone'})
    </Select.Option>
  ))}
</Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Status" name="status">
                <Select placeholder="Select Status">
                  <Option value="all">All Status</Option>
                  <Option value="active">Active</Option>
                  <Option value="inactive">Inactive</Option>
                </Select>
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item label="Payment Status" name="paymentStatus">
                <Select placeholder="Select Payment Status">
                  <Option value="all">All Payments</Option>
                  <Option value="paid">Paid</Option>
                  <Option value="partial">Partial</Option>
                  <Option value="pending">Pending</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="From Date" name="fromDate">
                <DatePicker 
                  format="DD-MM-YYYY"
                  placeholder="Select From Date"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item label="To Date" name="toDate">
                <DatePicker 
                  format="DD-MM-YYYY"
                  placeholder="Select To Date"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          
          <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded">
            <div className="font-medium mb-1">Currently Applied Filters:</div>
            <div className="space-y-1">
              <div>• Program: {filters.programId === 'all' ? 'All' : (programList?.find(p => p.id === filters.programId)?.name || filters.programId)}</div>
              <div>• Agent: {filters.agentId === 'all' ? 'All' : getAgentName(filters.agentId)}</div>
              <div>• Status: {filters.status === 'all' ? 'All' : filters.status}</div>
              <div>• Payment: {filters.paymentStatus === 'all' ? 'All' : filters.paymentStatus}</div>
              <div>• Date Range: {filters.fromDate ? formatDate(filters.fromDate) : 'Any'} - {filters.toDate ? formatDate(filters.toDate) : 'Any'}</div>
              <div>• Sort By: {filters.sortField === 'createdAt' ? 'Registration Date' : 
                filters.sortField === 'displayName' ? 'Name' : 
                filters.sortField === 'paymentPercentage' ? 'Payment %' : 'Join Date'} ({filters.sortOrder})
              </div>
            </div>
          </div>
        </Form>
      </Modal>

      {/* Add Member Drawer */}
      <AddMember
        programs={programList || []}
        agents={agentList || []}
        open={openAddMember}
        setOpen={setOpenAddMember}
        currentUser={user}
        onSuccess={() => {
          if (searchMode === 'search' && filters.search) {
            searchMembers(filters.search)
          } else {
            fetchMembers(pagination.current, false)
          }
        }}
      />
      
      <EditMember
        programs={programList || []}
        agents={agentList || []}
        open={openEditMember}
        setOpen={setOpenEditMember}
        currentUser={user}
        memberId={editMemberId}
        onSuccess={() => {
          if (searchMode === 'search' && filters.search) {
            searchMembers(filters.search)
          } else {
            fetchMembers(pagination.current, false)
          }
        }}
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
          agentList={agentList}
        />
      )}
      
      {openCertificate && (
        <Drawer
          open={openCertificate}
          onClose={() => setOpenCertificate(false)}
          title={fileName}
          size={800}
          destroyOnClose={true}
          footer={
            <div className='flex justify-end gap-3'>
              <Button 
                type="default" 
                onClick={() => setOpenCertificate(false)}
              >
                Close
              </Button>
              <PDFDownloadLink
                document={<CertificateCom data={selectedMember} />}
                fileName={fileName}
              >
                {({ loading }) => (
                  <Button
                    type="primary"
                    loading={loading}
                    disabled={loading}
                    onClick={() => {
                      setTimeout(() => setOpenCertificate(false), 500);
                    }}
                  >
                    {loading ? "Preparing PDF..." : "Download PDF"}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          }
        >
          <CertificateViewer memberData={selectedMember}  />
        </Drawer>
      )}
    </div>
  )
}

export default Page