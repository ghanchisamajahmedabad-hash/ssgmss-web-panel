"use client"
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSelector } from 'react-redux'
import AddMember from './components/AddMember'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar,
  Badge, Tooltip, message, Dropdown, Modal, Drawer,
  Select, Form, DatePicker
} from 'antd'
import { 
  PlusOutlined, SearchOutlined, EyeOutlined, 
  EditOutlined, DeleteOutlined, MoreOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined, FilterOutlined, DownloadOutlined,
  ReloadOutlined, UserSwitchOutlined
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
import RasidDrawer from './components/RasidCom/RasidDrawer'

const { Search } = Input
const { Option } = Select

const Page = () => {
  const [openAddMember,  setOpenAddMember]  = useState(false)
  const [openEditMember, setOpenEditMember] = useState(false)
  const [editMemberId,   setEditMemberId]   = useState(null)
  const [members,        setMembers]        = useState([])
  const [loading,        setLoading]        = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [openCertificate,      setOpenCertificate]      = useState(false)
  const [detailDrawerVisible,  setDetailDrawerVisible]  = useState(false)
  const [filterModalVisible,   setFilterModalVisible]   = useState(false)
  const [rasidDrawerOpen,      setRasidDrawerOpen]      = useState(false)
  const currentUser = auth.currentUser

  const [searchMode,    setSearchMode]    = useState('paginated')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [pagination, setPagination] = useState({
    current: 1, pageSize: 10, total: 0, lastDoc: null, lastDocs: {}
  })

  const [filters, setFilters] = useState({
    search: '', programId: 'all', agentId: 'all',
    status: 'all', paymentStatus: 'all',
    fromDate: null, toDate: null,
    sortField: 'createdAt', sortOrder: 'desc'
  })

  const [stats, setStats] = useState({
    total: 0, active: 0, pendingPayments: 0, todayAdded: 0, totalRevenue: 0
  })

  const programList = useSelector((state) => state.data.programList)
  const agentList   = useSelector((state) => state.data.agentList)
  const { user }    = useAuth()
const isSuperAdmin = (user) => user?.role === 'superadmin';
  const usersPermissions = user?.permissions || {};
  const [filterForm]    = Form.useForm()
  const searchTimerRef  = useRef(null)

  const getAgentName = useCallback((agentId) => {
    if (!agentId) return 'Admin/System';
    const agent = agentList?.find(a => a.id === agentId || a.uid === agentId);
    return agent ? agent.name : 'Unknown Agent';
  }, [agentList])

  const displayedMembers = useMemo(() =>
    searchMode === 'search' ? searchResults : members
  , [searchMode, searchResults, members])

  useEffect(() => {
    if (displayedMembers.length > 0) {
      const today = dayjs().format('DD-MM-YYYY')
      setStats({
        total:           searchMode === 'search' ? searchResults.length : pagination.total,
        active:          displayedMembers.filter(m => m.active_flag).length,
        pendingPayments: displayedMembers.filter(m => m.paymentPercentage < 100).length,
        todayAdded:      displayedMembers.filter(m => m.dateJoin === today).length,
        totalRevenue:    displayedMembers.reduce((sum, m) => sum + (m.paidAmount || 0), 0)
      })
    }
  }, [displayedMembers, pagination.total, searchMode, searchResults.length])

  const fetchMembers = useCallback(async (page = 1, resetPagination = false) => {
    setLoading(true)
    setSearchMode('paginated')
    try {
      const lastDoc = resetPagination ? null : pagination.lastDocs[page - 1] || null
      const result  = await fetchMembersPaginated({ ...filters, search: '', pageSize: pagination.pageSize, lastDoc })
      setMembers(result.members)

      const newLastDocs = { ...pagination.lastDocs }
      if (result.lastDoc) newLastDocs[page] = result.lastDoc

      setPagination(prev => ({ ...prev, lastDocs: newLastDocs, hasNextPage: result.hasNextPage, current: page }))

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

  const searchMembers = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchMode('paginated'); setSearchResults([])
      fetchMembers(1, false); return
    }
    setSearchLoading(true); setSearchMode('search')
    try {
      const results = await fetchAllMembersForSearch(searchTerm, filters.agentId)
      setSearchResults(results)
      if (results.length === 0) message.info('No members found matching your search')
    } catch (error) {
      message.error('Failed to search members')
    } finally {
      setSearchLoading(false)
    }
  }, [fetchMembers, filters.agentId])

  const handleSearch = useCallback((value) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchMembers(value), 500)
  }, [searchMembers])

  const handleSearchChange = (e) => {
    const value = e.target.value
    setFilters(prev => ({ ...prev, search: value }))
    handleSearch(value)
  }

  useEffect(() => { fetchMembers(1, true) }, [])

  const handleFilterChange = (changedValues) => setFilters(prev => ({ ...prev, ...changedValues }))

  const applyFilters = () => {
    setFilterModalVisible(false)
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    fetchMembers(1, true)
  }

  const resetFilters = () => {
    const reset = { programId: 'all', agentId: 'all', status: 'all', paymentStatus: 'all', fromDate: null, toDate: null, sortField: 'createdAt', sortOrder: 'desc' }
    setFilters(prev => ({ ...prev, ...reset }))
    filterForm.resetFields()
    setSearchMode('paginated'); setSearchResults([])
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    setTimeout(() => fetchMembers(1, true), 0)
  }

  const getActiveFilterCount = () => {
    let c = 0
    if (filters.programId     !== 'all') c++
    if (filters.agentId       !== 'all') c++
    if (filters.status        !== 'all') c++
    if (filters.paymentStatus !== 'all') c++
    if (filters.fromDate) c++
    if (filters.toDate)   c++
    return c
  }

  const formatDate = (d) => d ? dayjs(d).format('DD-MM-YYYY') : null

  const handleTableChange = (paginationInfo, _, sorter) => {
    if (searchMode === 'search') {
      setPagination(prev => ({ ...prev, current: paginationInfo.current, pageSize: paginationInfo.pageSize }))
      return
    }
    if (paginationInfo.pageSize !== pagination.pageSize) {
      setPagination(prev => ({ ...prev, current: 1, pageSize: paginationInfo.pageSize, lastDocs: {} }))
      setTimeout(() => fetchMembers(1, true), 0); return
    }
    if (sorter.field && sorter.order) {
      setFilters(prev => ({ ...prev, sortField: sorter.field, sortOrder: sorter.order === 'ascend' ? 'asc' : 'desc' }))
      setPagination(prev => ({ ...prev, current: 1, lastDocs: {} }))
      setTimeout(() => fetchMembers(1, true), 0); return
    }
    if (paginationInfo.current !== pagination.current) fetchMembers(paginationInfo.current, false)
  }

  const handleViewMember    = (member) => { setSelectedMember(member); setDetailDrawerVisible(true) }

  const handleCertificateMember = (member) => {
    const agentData   = agentList?.find(a => a.id === member.agentId) || {}
    const programData = programList?.find(p => p.id === member.programId) || {}
    setSelectedMember({
      ...member,
      agentName:   agentData.displayName || agentData.name || 'Admin/System',
      agentPhone:  agentData.phone1 || '',
      programName: programData.hindiName || member.programName || ''
    })
    setOpenCertificate(true)
  }

  const handleEditMember = (member) => { setEditMemberId(member.id); setOpenEditMember(true) }
const callDeleteMemberApi = async (memberId, currentUserId, token) => {
  const res = await fetch('/api/members/delete-restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ memberId, deletedBy: currentUserId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Delete API failed');
  return data;
};
const handleDeleteMember = (member) => {
  Modal.confirm({
    title: 'Confirm Delete',
    content: `Are you sure you want to delete ${member.displayName}?`,
    okText: 'Yes, Delete', okType: 'danger', cancelText: 'Cancel',
    onOk: async () => {
      try {
        // Call API — it soft-deletes + decrements all counters atomically
        const token = await currentUser?.getIdToken();
        await callDeleteMemberApi(member.id, currentUser?.uid, token);
        message.success('Member deleted successfully');
        searchMode === 'search' && filters.search
          ? searchMembers(filters.search)
          : fetchMembers(pagination.current, false);
      } catch (e) {
        console.error(e);
        message.error('Failed to delete member: ' + e.message);
      }
    }
  });
};

  const handleToggleStatus = async (member) => {
    try {
      await updateDoc(doc(db, 'members', member.id), { active_flag: !member.active_flag, updated_at: new Date() })
      message.success(`Member ${!member.active_flag ? 'activated' : 'deactivated'} successfully`)
      searchMode === 'search' && filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current, false)
    } catch { message.error('Failed to update member status') }
  }

  const columns = [
    {
      title: 'Reg. No.',
      dataIndex: 'registrationNumber',
      key: 'registrationNumber',
      width: 130, fixed: 'left',
      sorter: searchMode === 'paginated',
      render: (text) => <Tag color="blue" style={{ fontWeight: 'bold', fontSize: '12px' }}>{text}</Tag>,
    },
    {
      title: 'Member', key: 'member', width: 180,
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <Avatar src={r.photoURL} icon={<UserOutlined />} size="small" />
          <div>
            <div className="font-medium text-sm">{r.displayName}</div>
            <div className="text-xs text-gray-500">{r.fatherName} • {r.surname}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact', key: 'contact', width: 140,
      render: (_, r) => (
        <div>
          <div className="flex items-center gap-1 text-sm"><PhoneOutlined style={{ fontSize: '11px' }} /><span>{r.phone}</span></div>
          {r.phoneAlt && <div className="text-xs text-gray-500">Alt: {r.phoneAlt}</div>}
        </div>
      ),
    },
    {
      title: 'Aadhaar', dataIndex: 'aadhaarNo', key: 'aadhaarNo', width: 130,
      render: (text) => <span className="text-sm">{text}</span>,
    },
    {
      title: 'Agent', key: 'agent', width: 120,
      render: (_, r) => {
        const name = getAgentName(r.agentId)
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1">
              <UserSwitchOutlined style={{ fontSize: '11px', color: '#1890ff' }} />
              <span className="font-medium truncate" title={name}>{name}</span>
            </div>
          </div>
        )
      },
    },
    {
      // ── Single program — read flat programName from member doc ──────────────
      title: 'Yojna', key: 'program', width: 160,
      render: (_, r) => {
        if (!r.programId) return <span className="text-gray-400 text-xs">No Program</span>
        const prog = programList?.find(p => p.id === r.programId)
        const name = prog?.name || r.programName || r.programId
        return <Tag color="pink" style={{ fontWeight: 'bold', fontSize: '10px' }}>{name}</Tag>
      },
    },
    {
      title: 'Join Fees', key: 'payment', width: 140,
      sorter: searchMode === 'paginated',
      render: (_, r) => {
        const pct   = r.paymentPercentage || 0
        const color = pct === 100 ? 'green' : pct > 0 ? 'orange' : 'red'
        const icon  = pct === 100 ? <CheckCircleOutlined /> : <ClockCircleOutlined />
        return (
          <div>
            <div className="flex items-center gap-1 text-sm">
              {icon}<span style={{ color, fontWeight: 'bold' }}>{pct}%</span>
            </div>
            <div className="text-xs">₹{r.paidAmount || 0}/₹{r.joinFees || 0}</div>
          </div>
        )
      },
    },
    {
      title: 'Join Date', dataIndex: 'dateJoin', key: 'dateJoin', width: 110,
      sorter: searchMode === 'paginated',
      render: (text) => (
        <div className="text-sm">
          <div>{text}</div>
          {text && dayjs(text, 'DD-MM-YYYY').isSame(dayjs(), 'day') && (
            <Tag color="green" className="text-xs">Today</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_, r) => (
        <Tag color={r.active_flag ? 'green' : 'red'}
          icon={r.active_flag ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          size="small" className="text-xs">
          {r.active_flag ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 90, fixed: 'right',
      render: (_, record) => {
        const can = (perm) => isSuperAdmin(user) || usersPermissions?.actions?.[perm];
    const items = [
  can('view') && {
    key: 'view',
    label: 'View Details',
    icon: <EyeOutlined />,
    onClick: () => handleViewMember(record)
  },

  can('download') && {
    key: 'cert',
    label: 'Certificate',
    icon: <FileTextOutlined />,
    onClick: () => handleCertificateMember(record)
  },

  can('edit') && {
    key: 'edit',
    label: 'Edit',
    icon: <EditOutlined />,
    onClick: () => handleEditMember(record)
  },

  can('approve') && {
    key: 'toggle',
    label: record.active_flag ? 'Deactivate' : 'Activate',
    onClick: () => handleToggleStatus(record)
  },

  can('delete') && { type: 'divider' },

  can('delete') && {
    key: 'delete',
    label: 'Delete',
    icon: <DeleteOutlined style={{ color: 'red' }} />,
    onClick: () => handleDeleteMember(record)
  }
].filter(Boolean);
        return (
          <Space>
            {
              (isSuperAdmin(user) || usersPermissions?.actions?.view) && <Tooltip title="View Details">
              <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewMember(record)} size="small" />
            </Tooltip>
            }
         
            <Dropdown menu={{ items }} trigger={['click']}>
              <Tooltip title="More Options">
                <Button type="text" icon={<MoreOutlined />} size="small" />
              </Tooltip>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  const exportToCSV = () => {
    const headers = ['Registration No','Name','Father Name','Phone','Aadhaar','Village','City','Program','Join Date','Status','Payment %','Paid Amount','Agent Name']
    const rows = displayedMembers.map(m => [
      m.registrationNumber, m.displayName, m.fatherName, m.phone, m.aadhaarNo,
      m.village, m.city,
      m.programName || (programList?.find(p => p.id === m.programId)?.name || ''),
      m.dateJoin,
      m.active_flag ? 'Active' : 'Inactive',
      m.paymentPercentage || 0, m.paidAmount || 0,
      getAgentName(m.agentId)
    ])
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `members_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  }

  const fileName = selectedMember
    ? `${selectedMember.displayName?.replace(/\s+/g,'_')}_${selectedMember.registrationNumber}_certificate`
    : 'certificate.pdf'

  return (
    <div>
      <Card className="mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Members Management</h1>
            <p className="text-gray-500">Manage all member registrations and information</p>
          </div>
          {
            isSuperAdmin(user) || usersPermissions?.actions?.add_member ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenAddMember(true)} size="large">
                Add New Member
              </Button>
            ) : null
          }
        </div>

        {/* Search + Filter bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2 items-center">
            <Search
              placeholder="Search by name, reg no, phone, aadhaar, village..."
              prefix={<SearchOutlined />}
              style={{ width: 450 }}
              onChange={handleSearchChange}
              value={filters.search}
              allowClear loading={searchLoading}
            />
            {searchMode === 'search' && (
              <Tag color="blue" className="text-xs">Search Mode — {searchResults.length} results</Tag>
            )}
          </div>

          <div className="flex gap-2">
            {/* Active filter tags */}
            <div className="flex gap-1 items-center flex-wrap">
              {filters.programId !== 'all' && (
                <Tag color="blue" closable onClose={() => { setFilters(p => ({...p, programId:'all'})); fetchMembers(1,true) }}>
                  Yojna: {programList?.find(p => p.id === filters.programId)?.name || filters.programId}
                </Tag>
              )}
              {filters.agentId !== 'all' && (
                <Tag color="purple" closable onClose={() => { setFilters(p => ({...p, agentId:'all'})); fetchMembers(1,true) }}>
                  Agent: {getAgentName(filters.agentId)}
                </Tag>
              )}
              {filters.status !== 'all' && (
                <Tag color="green" closable onClose={() => { setFilters(p => ({...p, status:'all'})); fetchMembers(1,true) }}>
                  Status: {filters.status}
                </Tag>
              )}
              {filters.paymentStatus !== 'all' && (
                <Tag color="orange" closable onClose={() => { setFilters(p => ({...p, paymentStatus:'all'})); fetchMembers(1,true) }}>
                  Payment: {filters.paymentStatus}
                </Tag>
              )}
              {filters.fromDate && (
                <Tag color="purple" closable onClose={() => { setFilters(p => ({...p, fromDate:null})); fetchMembers(1,true) }}>
                  From: {formatDate(filters.fromDate)}
                </Tag>
              )}
              {filters.toDate && (
                <Tag color="cyan" closable onClose={() => { setFilters(p => ({...p, toDate:null})); fetchMembers(1,true) }}>
                  To: {formatDate(filters.toDate)}
                </Tag>
              )}
            </div>

            <Button icon={<FilterOutlined />} onClick={() => setFilterModalVisible(true)}>
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Button>
            {
              isSuperAdmin(user) || usersPermissions?.actions?.download && ( <Tooltip title="Export to CSV">
              <Button icon={<DownloadOutlined />} onClick={exportToCSV}>Export</Button>
            </Tooltip>)
            }
           
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} loading={loading || searchLoading}
                onClick={() => searchMode === 'search' && filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current, false)}>
                Refresh
              </Button>
            </Tooltip>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={displayedMembers}
          rowKey="id"
          loading={loading || searchLoading}
          pagination={{
            current:  pagination.current,
            pageSize: pagination.pageSize,
            total:    searchMode === 'search' ? searchResults.length : pagination.total,
            showSizeChanger: true, showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} members`,
            pageSizeOptions: ['10','20','50','100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1300, y: '50vh' }}
          sticky size="small" rowClassName="text-xs"
        />
      </Card>

      {/* Filter Modal */}
      <Modal
        title={<span><FilterOutlined className="mr-2" />Advanced Filters</span>}
        open={filterModalVisible}
        onCancel={() => setFilterModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setFilterModalVisible(false)}>Cancel</Button>,
          <Button key="reset"  onClick={resetFilters}>Reset</Button>,
          <Button key="apply"  type="primary" onClick={applyFilters}>Apply Filters</Button>,
        ]}
        width={600}
      >
        <Form form={filterForm} layout="vertical" onValuesChange={handleFilterChange} initialValues={filters}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Program — single select */}
            <Form.Item label="Yojna" name="programId">
              <Select placeholder="Select Yojna" showSearch optionFilterProp="children">
                <Option value="all">All Yojna</Option>
                {programList?.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
              </Select>
            </Form.Item>

            <Form.Item label="Agent" name="agentId">
              <Select placeholder="Select Agent" showSearch optionFilterProp="children">
                <Option value="all">All Agents</Option>
                {agentList?.map(a => <Option key={a.id} value={a.id}>{a.name} ({a.phone1 || 'No phone'})</Option>)}
              </Select>
            </Form.Item>

            <Form.Item label="Status" name="status">
              <Select placeholder="Select Status">
                <Option value="all">All Status</Option>
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Payment Status" name="paymentStatus">
              <Select placeholder="Select Payment Status">
                <Option value="all">All Payments</Option>
                <Option value="paid">Paid</Option>
                <Option value="partial">Partial</Option>
                <Option value="pending">Pending</Option>
              </Select>
            </Form.Item>

            <Form.Item label="From Date" name="fromDate">
              <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="To Date" name="toDate">
              <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="text-xs text-gray-500 mt-2 p-3 bg-gray-50 rounded">
            <div className="font-medium mb-1">Active Filters:</div>
            <div>• Yojna: {filters.programId === 'all' ? 'All' : (programList?.find(p => p.id === filters.programId)?.name || filters.programId)}</div>
            <div>• Agent: {filters.agentId === 'all' ? 'All' : getAgentName(filters.agentId)}</div>
            <div>• Status: {filters.status === 'all' ? 'All' : filters.status}</div>
            <div>• Payment: {filters.paymentStatus === 'all' ? 'All' : filters.paymentStatus}</div>
            <div>• Dates: {filters.fromDate ? formatDate(filters.fromDate) : 'Any'} → {filters.toDate ? formatDate(filters.toDate) : 'Any'}</div>
          </div>
        </Form>
      </Modal>

      {/* Drawers & Modals */}
      <AddMember programs={programList||[]} agents={agentList||[]} open={openAddMember} setOpen={setOpenAddMember} currentUser={user}
        onSuccess={() => searchMode==='search'&&filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current,false)} />

      <EditMember programs={programList||[]} agents={agentList||[]} open={openEditMember} setOpen={setOpenEditMember}
        currentUser={user} memberId={editMemberId}
        onSuccess={() => searchMode==='search'&&filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current,false)} />

      {selectedMember && (
        <MemberDetailDrawer member={selectedMember} visible={detailDrawerVisible}
          onClose={() => { setDetailDrawerVisible(false); setSelectedMember(null) }}
          programList={programList} agentList={agentList} />
      )}

      {openCertificate && (
        <Drawer open={openCertificate} onClose={() => setOpenCertificate(false)} title={fileName} size={800} destroyOnClose
          footer={
            <div className="flex justify-end gap-3">
              <Button onClick={() => setOpenCertificate(false)}>Close</Button>
              <PDFDownloadLink document={<CertificateCom data={selectedMember} />} fileName={fileName}>
                {({ loading: pdfLoading }) => (
                  <Button type="primary" loading={pdfLoading} disabled={pdfLoading}
                    onClick={() => setTimeout(() => setOpenCertificate(false), 500)}>
                    {pdfLoading ? 'Preparing PDF...' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          }>
          <CertificateViewer memberData={selectedMember} />
        </Drawer>
      )}

      {rasidDrawerOpen && <RasidDrawer open={rasidDrawerOpen} setOpen={setRasidDrawerOpen} member={selectedMember} />}
    </div>
  )
}

export default Page