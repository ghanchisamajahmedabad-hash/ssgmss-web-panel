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
  CheckCircleOutlined, ClockCircleOutlined, StopOutlined,
  FileTextOutlined, FilterOutlined, DownloadOutlined,
  ReloadOutlined, UserSwitchOutlined, PrinterOutlined,
  TableOutlined, DollarOutlined, MoneyCollectOutlined, WalletOutlined
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
import { doc, updateDoc, query, where, orderBy, collection, getDocs } from 'firebase/firestore'
import { BlobProvider, PDFDownloadLink } from '@react-pdf/renderer'
import CertificateCom from './components/MemberPdf/CertificateCom'
import MemberListPdf from './components/MemberPdf/MemberListPdf'
import RasidDrawer from './components/RasidCom/RasidDrawer'
import PaymentDetailsDrawer from './components/PaymentDetailsDrawer'

// ── Helper: auto-download PDF when blob is ready ──
const PdfAutoDownloader = ({ pdfMeta, onDone }) => {
  const [generating, setGenerating] = useState(false)
  useEffect(() => {
    if (pdfMeta && !generating) setGenerating(true)
  }, [pdfMeta, generating])

  if (!pdfMeta) return null
  return (
    <>
      {generating && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:1000, background:'#D3292F', color:'#fff', padding:'10px 20px', borderRadius:8, fontWeight:'bold', fontSize:14, boxShadow:'0 4px 12px rgba(0,0,0,0.15)' }}>
          Generating PDF...
        </div>
      )}
      <BlobProvider document={<MemberListPdf members={pdfMeta.data} filters={pdfMeta.filters} programList={pdfMeta.programList} agentList={pdfMeta.agentList} />}>
        {({ blob, url, loading, error }) => {
          if (error) {
            setTimeout(() => { message.error('PDF error: ' + (error.message || error)); onDone() }, 0)
            return null
          }
          if (!loading && blob && generating) {
            setTimeout(() => {
              const a = document.createElement('a')
              a.href = url
              a.download = `member_list_${dayjs().format('YYYY-MM-DD')}.pdf`
              document.body.appendChild(a)
              a.click()
              // Don't revoke immediately — browser needs the blob URL to start the download
              setTimeout(() => {
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }, 2000)
              message.success(`Downloaded ${pdfMeta.data.length} members`)
              onDone()
            }, 0)
          }
          return null
        }}
      </BlobProvider>
    </>
  )
}

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
  const [rasidDrawerOpen,         setRasidDrawerOpen]         = useState(false)
  const [allMembersForExport,     setAllMembersForExport]     = useState(null)
  const [allMembersExportLoading, setAllMembersExportLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [isCertDownloading, setIsCertDownloading] = useState(false)
  const [pdfMeta, setPdfMeta] = useState(null) // { data, filters, programList }
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
    closingPaymentStatus: 'all',
    fromDate: null, toDate: null,
    sortField: 'createdAt', sortOrder: 'desc'
  })

  const [stats, setStats] = useState({
    total: 0, active: 0, pendingPayments: 0, todayAdded: 0, totalRevenue: 0
  })

  const programList = useSelector((state) => state.data.programList)
  const agentList   = useSelector((state) => state.data.agentList)
  const { user }    = useAuth()
  console.log('User permissions:', user)
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

  // Clear export cache whenever filters change so downloads always use fresh data
  useEffect(() => { setAllMembersForExport(null) }, [filters])

  const handleFilterChange = (changedValues) => setFilters(prev => ({ ...prev, ...changedValues }))

  const applyFilters = () => {
    setFilterModalVisible(false)
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    setAllMembersForExport(null)
    setTimeout(() => fetchMembers(1, true), 0)
  }

  const resetFilters = () => {
    const reset = { programId: 'all', agentId: 'all', status: 'all', paymentStatus: 'all', closingPaymentStatus: 'all', fromDate: null, toDate: null, sortField: 'createdAt', sortOrder: 'desc' }
    setFilters(prev => ({ ...prev, ...reset }))
    filterForm.resetFields()
    setSearchMode('paginated'); setSearchResults([])
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    setTimeout(() => fetchMembers(1, true), 0)
  }

  const getActiveFilterCount = () => {
    let c = 0
    if (filters.programId          !== 'all') c++
    if (filters.agentId            !== 'all') c++
    if (filters.status             !== 'all') c++
    if (filters.paymentStatus      !== 'all') c++
    if (filters.closingPaymentStatus !== 'all') c++
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
  const [paymentDetailsMember, setPaymentDetailsMember] = useState(null)
  const [paymentDetailsVisible, setPaymentDetailsVisible] = useState(false)
  const handlePaymentDetails = (member) => { setPaymentDetailsMember(member); setPaymentDetailsVisible(true) }

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

  const downloadMultipleCertificates = async (membersArray) => {
    if (!membersArray || membersArray.length === 0) {
      message.warning('No members selected for certificate download');
      return;
    }
    setIsCertDownloading(true);
    const loadingMessage = message.loading('Generating certificates, please wait...', 0);
    const membersData = membersArray.map(member => {
      const agentData   = agentList?.find(a => a.id === member.agentId) || {}
      const programData = programList?.find(p => p.id === member.programId) || {}
      return {
        ...member,
        ageGroupName:  member.ageGroupName || member.memberGroupName || member.ageGroup || '',
        agentName:     agentData.displayName || agentData.name || 'Admin/System',
        agentPhone:    agentData.phone1 || '',
        programName:   programData.hindiName || member.programName || ''
      }
    });
    const memberProgram = programList?.find(p => p.id === filters.programId) ||
      programList?.find(p => p.id === membersArray[0]?.programId) || {}
    try {
      const response = await fetch('/api/certificate-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberData: membersData, memberProgram }),
      });
      const data = await response.json();
      const binaryString = atob(data.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 100);
      message.success('Certificate generated successfully!');
    } catch (error) {
      console.error('Error:', error);
      message.error('Failed to generate certificates. Please try again.');
    } finally {
      loadingMessage();
      setIsCertDownloading(false);
    }
  }

  const handleBatchCertSelected = () => {
    const selected = selectedRowKeys.map(id => displayedMembers.find(m => m.id === id)).filter(Boolean)
    downloadMultipleCertificates(selected)
  }

  const handleBatchCertAll = async () => {
    const data = allMembersForExport || await fetchAllMembersForExport()
    if (!data || data.length === 0) { message.warning('No members found'); return }
    downloadMultipleCertificates(data)
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
      title: 'Sr.',
      dataIndex: 'srNo',
      key: 'srNo',
      width: 60, fixed: 'left',
      sorter: searchMode === 'paginated',
      render: (v) => <span className="text-sm font-semibold text-gray-600">{v ?? '—'}</span>,
    },
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
      title: 'Age Group', key: 'ageGroup', width: 90,
      render: (_, r) => {
        const age = r.ageGroupName || r.memberGroupName || r.ageGroup || '-'
        return <Tag color="cyan" style={{ fontSize: '10px' }}>{age}</Tag>
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
      title: 'Closing', key: 'closing', width: 130,
      render: (_, r) => {
        const total = r.closing_totalAmount || 0
        const paid = r.closing_paidAmount || 0
        const pending = r.closing_pendingAmount || 0
        if (!total) return <span className="text-gray-300 text-xs">—</span>
        return (
          <div>
            <div className="flex items-center gap-1 text-xs">
              <MoneyCollectOutlined style={{ color: '#722ed1', fontSize: 10 }} />
              <span style={{ color: '#722ed1', fontWeight: 600 }}>₹{total.toLocaleString()}</span>
            </div>
            <div className="text-[10px]">
              <span style={{ color: '#52c41a' }}>₹{paid.toLocaleString()}</span>
              <span className="text-gray-300 mx-0.5">/</span>
              <span style={{ color: pending > 0 ? '#ff4d4f' : '#52c41a' }}>₹{pending.toLocaleString()}</span>
            </div>
            <div className="text-[9px] text-gray-400">{r.paidClosingCount || 0}/{r.totalClosingCount || 0} ev</div>
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
      render: (_, r) => {
        if (r.member_closed) return <Tag color="purple" icon={<StopOutlined />} size="small" className="text-xs">Closed</Tag>
        return (
          <Tag color={r.active_flag ? 'green' : 'red'}
            icon={r.active_flag ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
            size="small" className="text-xs">
            {r.active_flag ? 'Active' : 'Inactive'}
          </Tag>
        )
      },
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

          {
            key: 'payment',
            label: 'Payment Details',
            icon: <WalletOutlined />,
            onClick: () => handlePaymentDetails(record)
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

  const exportToCSV = (data) => {
    const list = data || displayedMembers
    const headers = ['Registration No','Name','Father Name','Phone','Aadhaar','Village','City','Program','Age Group','Join Date','Status','Payment %','Paid Amount','Pending Amount','Agent Name']
    const rows = list.map(m => [
      m.registrationNumber, m.displayName, m.fatherName, m.phone, m.aadhaarNo,
      m.village, m.city,
      m.programName || (programList?.find(p => p.id === m.programId)?.name || ''),
      m.ageGroupName || m.memberGroupName || m.ageGroup || '',
      m.dateJoin,
      m.active_flag ? 'Active' : 'Inactive',
      m.paymentPercentage || 0, m.paidAmount || 0, m.pendingAmount || 0,
      getAgentName(m.agentId)
    ])
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = window.URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `members_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  }

  const fetchAllMembersForExport = async () => {
    setAllMembersExportLoading(true)
    try {
      let q = collection(db, 'members')
      const constraints = []
      if (filters.programId !== 'all') constraints.push(where('programId', '==', filters.programId))
      if (filters.status === 'active') constraints.push(where('active_flag', '==', true))
      else if (filters.status === 'inactive') constraints.push(where('active_flag', '==', false))
      else if (filters.status === 'closed') constraints.push(where('member_closed', '==', true))
      if (filters.paymentStatus === 'paid') constraints.push(where('paymentPercentage', '==', 100))
      else if (filters.paymentStatus === 'partial') constraints.push(where('paymentPercentage', '>', 0), where('paymentPercentage', '<', 100))
      else if (filters.paymentStatus === 'pending') constraints.push(where('paymentPercentage', '==', 0))
      if (filters.agentId !== 'all') constraints.push(where('agentId', '==', filters.agentId))
      if (filters.fromDate) constraints.push(where('createdAt', '>=', dayjs(filters.fromDate).startOf('day').toDate()))
      if (filters.toDate) constraints.push(where('createdAt', '<=', dayjs(filters.toDate).endOf('day').toDate()))
      constraints.push(orderBy('createdAt', 'desc'))
      q = query(q, ...constraints)
      let snap = await getDocs(q)
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Client-side closing payment filter
      if (filters.closingPaymentStatus === 'closedPaid') {
        data = data.filter(m => (m.closing_paymentPercentage || 0) === 100 || ((m.closing_totalAmount || 0) > 0 && (m.closing_pendingAmount || 0) === 0))
      } else if (filters.closingPaymentStatus === 'closedPending') {
        data = data.filter(m => (m.closing_totalAmount || 0) > 0 && (m.closing_paidAmount || 0) === 0)
      } else if (filters.closingPaymentStatus === 'closedPartial') {
        data = data.filter(m => {
          const pct = m.closing_paymentPercentage || 0
          return pct > 0 && pct < 100
        })
      }
      setAllMembersForExport(data)
      return data
    } catch (err) {
      console.error('Error fetching all members for export:', err)
      message.error('Failed to fetch all members for export')
      return null
    } finally {
      setAllMembersExportLoading(false)
    }
  }

  // Like fetchAllMembersForExport but with base filters (delete_flag, status)
  // so it only fetches active/non-deleted members — faster & avoids network timeouts
  const fetchFilteredMembersForExport = async () => {
    setAllMembersExportLoading(true)
    try {
      let q = collection(db, 'members')
      const constraints = [
        where("delete_flag", "==", false),
        where("status",      "==", "active")
      ]
      if (filters.programId !== 'all') constraints.push(where('programId', '==', filters.programId))
      if (filters.status === 'active') constraints.push(where('active_flag', '==', true))
      else if (filters.status === 'inactive') constraints.push(where('active_flag', '==', false))
      else if (filters.status === 'closed') constraints.push(where('member_closed', '==', true))
      if (filters.paymentStatus === 'paid') constraints.push(where('paymentPercentage', '==', 100))
      else if (filters.paymentStatus === 'partial') constraints.push(where('paymentPercentage', '>', 0), where('paymentPercentage', '<', 100))
      else if (filters.paymentStatus === 'pending') constraints.push(where('paymentPercentage', '==', 0))
      if (filters.agentId !== 'all') constraints.push(where('agentId', '==', filters.agentId))
      if (filters.fromDate) constraints.push(where('createdAt', '>=', dayjs(filters.fromDate).startOf('day').toDate()))
      if (filters.toDate) constraints.push(where('createdAt', '<=', dayjs(filters.toDate).endOf('day').toDate()))
      constraints.push(orderBy('createdAt', 'desc'))
      q = query(q, ...constraints)
      let snap = await getDocs(q)
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Client-side closing payment filter
      if (filters.closingPaymentStatus === 'closedPaid') {
        data = data.filter(m => (m.closing_paymentPercentage || 0) === 100 || ((m.closing_totalAmount || 0) > 0 && (m.closing_pendingAmount || 0) === 0))
      } else if (filters.closingPaymentStatus === 'closedPending') {
        data = data.filter(m => (m.closing_totalAmount || 0) > 0 && (m.closing_paidAmount || 0) === 0)
      } else if (filters.closingPaymentStatus === 'closedPartial') {
        data = data.filter(m => {
          const pct = m.closing_paymentPercentage || 0
          return pct > 0 && pct < 100
        })
      }

      setAllMembersForExport(data)
      return data
    } catch (err) {
      console.error('Error fetching filtered members:', err)
      throw err
    } finally {
      setAllMembersExportLoading(false)
    }
  }

  const exportAllToCSV = async () => {
    const data = allMembersForExport || await fetchAllMembersForExport()
    if (data && data.length > 0) {
      exportToCSV(data)
      message.success(`Exported ${data.length} members to CSV`)
    } else {
      message.warning('No members found to export')
    }
  }

  const printMembers = async () => {
    const data = allMembersForExport || await fetchAllMembersForExport()
    if (!data || data.length === 0) {
      message.warning('No members found to print')
      return
    }

    const filterParts = []
    if (filters.programId !== 'all') filterParts.push(`Yojna: ${programList?.find(p => p.id === filters.programId)?.name || filters.programId}`)
    if (filters.agentId !== 'all') filterParts.push(`Agent: ${getAgentName(filters.agentId)}`)
    if (filters.status !== 'all') filterParts.push(`Status: ${filters.status}`)
    if (filters.paymentStatus !== 'all') filterParts.push(`Payment: ${filters.paymentStatus}`)
    if (filters.fromDate) filterParts.push(`From: ${formatDate(filters.fromDate)}`)
    if (filters.toDate) filterParts.push(`To: ${formatDate(filters.toDate)}`)
    if (filters.search) filterParts.push(`Search: ${filters.search}`)
    const filterHtml = filterParts.length > 0
      ? `<div class="filters">Filters: ${filterParts.map(f => `<span class="filter-tag">${f}</span>`).join('')}</div>`
      : ''

    const rowsHtml = data.map((m, i) => {
      const progName = m.programName || (programList?.find(p => p.id === m.programId)?.name || '-')
      const ageGroup = m.ageGroupName || m.memberGroupName || m.ageGroup || '-'
      return `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="reg">${m.registrationNumber || ''}</td>
        <td class="l"><b>${m.displayName || ''}</b><div class="sub">${m.fatherName || ''}</div></td>
        <td class="c">${m.phone || '-'}</td>
        <td class="c mono">${m.aadhaarNo || '-'}</td>
        <td class="c">${progName}</td>
        <td class="c">${ageGroup}</td>
        <td class="c">${m.village || '-'}</td>
        <td class="amt">₹${(m.payAmount || 0).toLocaleString()}</td>
      </tr>`
    }).join('')

    const printWindow = window.open('', '_blank')
    printWindow.document.write(`<!DOCTYPE html><html lang="hi"><head>
<meta charset="utf-8">
<title>Member List — SSGMS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 5mm 4mm 16mm 4mm; @bottom-center { content: "Page " counter(page); font-size: 8px; color: #9ca3af; font-family: 'Noto Sans Devanagari', sans-serif; } }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Sans Devanagari',sans-serif;background:#fff;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}

  .bless{display:flex;justify-content:space-between;padding:0 6px;margin-bottom:6px}
  .bless span{font-size:10px;color:#D3292F;font-weight:700;font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px}

  .hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
  .logo-box{width:70px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .logo-fb{width:55px;height:50px;border-radius:4px;background:linear-gradient(135deg,#E8EFF7,#d0dcec);border:2px solid #b5c5d8;display:flex;align-items:center;justify-content:center;font-size:9px;color:#1B385A;font-weight:700;text-align:center;line-height:1.3;font-family:'Noto Serif Devanagari',serif}
  .logo-fb2{background:linear-gradient(135deg,#f5ece0,#ede0cc)!important;border-color:#c9a87a!important;color:#7a4a1e!important}
  .logo{width:55px;height:50px;border-radius:4px;object-fit:cover}
  .center-block{flex:1;text-align:center;padding:0 6px}
  .org-title{font-size:20px;font-weight:700;color:#1B385A;font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px;line-height:1.3}
  .org-sub{font-size:15px;font-weight:700;color:#1B385A;margin-bottom:2px}
  .org-addr{font-size:10px;color:#000;line-height:1.5;margin-bottom:2px}
  .org-contact{font-size:10px;color:#000;line-height:1.5}
  .org-contact .blue{color:#1B385A;font-weight:700}

  .since-bar{display:flex;justify-content:space-between;border-bottom:1.5px solid #1B385A;padding:4px 6px 6px;margin-bottom:5px}
  .since-bar span{font-size:10px;font-weight:700;color:#1B385A;letter-spacing:.6px}

  .title-area{text-align:center;margin:8px 0}
  .title-area .title{display:inline-block;border:2px solid #D3292F;border-radius:6px;padding:5px 30px;font-size:14px;font-weight:700;color:#D3292F;font-family:'Noto Serif Devanagari',serif;letter-spacing:.6px}

  .filters{margin:5px 0 6px;font-size:10px;color:#6b7280;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .filter-tag{background:#fef2f2;color:#D3292F;padding:2px 8px;border-radius:3px;border:1px solid #fecaca;font-size:9px}

  .summary{display:flex;gap:12px;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:10px}
  .summary .count{background:#1B385A;color:#fff;padding:4px 16px;border-radius:4px;font-weight:700;font-size:11px}
  .summary .date{color:#9ca3af;font-size:9px}

  table{width:100%;border-collapse:collapse;font-size:9px;border:1.5px solid #bbb}
  thead th{background:#1B385A;color:#fff;padding:6px 4px;border:1px solid #2a4a6a;text-align:center;font-size:9px;font-weight:700;letter-spacing:.4px;font-family:'Noto Serif Devanagari',serif;white-space:nowrap}
  tbody td{padding:5px 4px;border:0.8px solid #d1d5db;vertical-align:middle}
  tbody tr:nth-child(even){background:#f8fafc}
  td.c{text-align:center}
  td.l{text-align:left;padding-left:8px;word-break:break-word}
  td.reg{font-weight:700;color:#1e3a8a;text-align:center;font-size:10px}
  td.amt{text-align:right;font-weight:700;font-size:10px;padding-right:6px}
  td.mono{font-family:monospace;font-size:9px}
  .sub{font-size:8px;color:#6b7280}

  .footer{text-align:center;margin-top:8px;padding-top:6px;border-top:1px solid #D3292F;font-size:8px;color:#9ca3af}

  @media print{body{background:#fff}.no-print{display:none!important}}
</style></head><body>

<div class="bless">
  <span>॥ श्री गणेशाय नमः ॥</span>
  <span>॥ श्री शनिदेवाय नमः ॥</span>
  <span>॥ श्री सांवलाजी महाराज नमः ॥</span>
</div>

<div class="hdr">
  <div class="logo-box"><img src="/Images/logoT.png" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt=""></div>
  <div class="center-block">
    <div class="org-title">श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</div>
    <div class="org-sub">अहमदाबाद, गुजरात</div>
    <div class="org-addr"><b>हेड ऑफिस :</b> 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास, चांदखेडा, साबरमती, अहमदाबाद - 382424 &nbsp; (O) 9898535345</div>
    <div class="org-contact"><b>संपर्क सूत्र :</b> <span class="blue">अध्यक्ष श्री वोरारामजी टी. बोराणा</span></div>
    <div class="org-contact"><span class="blue">9374934004</span> &nbsp;&nbsp; <b>ऑफिस :</b> <span class="blue"> 9898535345</span></div>
  </div>
   <div class="logo-box"><img src="/Images/sanidevImg.jpeg" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt=""></div>
</div>

<div class="since-bar">
  <span>SINCE : 2024</span>
  <span>Reg. No: A/5231</span>
</div>

<div class="title-area">
  <div class="title">सदस्य सूची</div>
</div>

${filterHtml}

<div class="summary">
  <span class="count">कुल सदस्य: ${data.length}</span>
  <span class="date">${new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' })}</span>
</div>

<table>
  <thead><tr>
    <th style="width:18px">#</th>
    <th style="width:54px">Reg No</th>
    <th style="width:160px">नाम / पिता</th>
    <th style="width:64px">फोन</th>
    <th style="width:78px">आधार</th>
    <th style="width:90px">योजना</th>
    <th style="width:54px">आयु वर्ग</th>
    <th style="width:64px">गाँव</th>
    <th style="width:54px">राशि</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>

<div style="text-align:center;margin-top:6px;font-size:7px;color:#9ca3af">
  Generated by SSGMS Web Panel • ${new Date().toLocaleString('en-IN')}
</div>

<script>
  (function(){var p=document.querySelectorAll('.logo');p.forEach(function(i){if(i.naturalWidth===0){i.style.display='none';var fb=i.nextElementSibling;if(fb)fb.style.display='flex'}});
  setTimeout(function(){window.print()},400)})();
</script>
</body></html>`)
    printWindow.document.close()
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
                <Tag color="blue" closable onClose={() => { setFilters(p => ({...p, programId:'all'})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  Yojna: {programList?.find(p => p.id === filters.programId)?.name || filters.programId}
                </Tag>
              )}
              {filters.agentId !== 'all' && (
                <Tag color="purple" closable onClose={() => { setFilters(p => ({...p, agentId:'all'})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  Agent: {getAgentName(filters.agentId)}
                </Tag>
              )}
              {filters.status !== 'all' && (
                <Tag color={filters.status === 'closed' ? 'purple' : 'green'} closable onClose={() => { setFilters(p => ({...p, status:'all'})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  Status: {filters.status === 'closed' ? 'Closed' : filters.status}
                </Tag>
              )}
              {filters.paymentStatus !== 'all' && (
                <Tag color="orange" closable onClose={() => { setFilters(p => ({...p, paymentStatus:'all'})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  Join Fees: {filters.paymentStatus}
                </Tag>
              )}
              {filters.closingPaymentStatus !== 'all' && (
                <Tag color="purple" closable onClose={() => { setFilters(p => ({...p, closingPaymentStatus:'all'})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  Closing: {filters.closingPaymentStatus.replace('closed', '')}
                </Tag>
              )}
              {filters.fromDate && (
                <Tag color="purple" closable onClose={() => { setFilters(p => ({...p, fromDate:null})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  From: {formatDate(filters.fromDate)}
                </Tag>
              )}
              {filters.toDate && (
                <Tag color="cyan" closable onClose={() => { setFilters(p => ({...p, toDate:null})); setTimeout(() => fetchMembers(1,true), 0) }}>
                  To: {formatDate(filters.toDate)}
                </Tag>
              )}
            </div>

            <Button icon={<FilterOutlined />} onClick={() => setFilterModalVisible(true)}>
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Button>
            {
              (isSuperAdmin(user) || usersPermissions?.actions?.download) && (
              <Dropdown
                menu={{
                  items: [
                    { key: 'csv_current', icon: <TableOutlined />, label: 'CSV (Current View)', onClick: () => exportToCSV() },
                    { key: 'csv_all', icon: <TableOutlined />, label: 'CSV (All Members)', onClick: exportAllToCSV, disabled: allMembersExportLoading },
                    { type: 'divider' },
                    { key: 'pdf', icon: <FileTextOutlined />, label: 'PDF (All Members)', onClick: async () => {
                      setAllMembersExportLoading(true)
                      try {
                        // Use cached data if available, otherwise fetch
                        const data = allMembersForExport || await fetchAllMembersForExport()
                        if (!data || data.length === 0) {
                          message.warning('No members found')
                          return
                        }
                        setPdfMeta({ data, filters, programList, agentList })
                      } catch (err) {
                        console.error('PDF error:', err)
                        message.error('Failed: ' + (err.message || 'unknown'))
                      } finally {
                        setAllMembersExportLoading(false)
                      }
                    } },
                    { type: 'divider' },
                    { key: 'print', icon: <PrinterOutlined />, label: 'Print List (A4)', onClick: printMembers },
                    { type: 'divider' },
                    { key: 'cert_selected', icon: <FileTextOutlined />, label: `Certificate (${selectedRowKeys.length} selected)`, onClick: handleBatchCertSelected, disabled: selectedRowKeys.length === 0 || isCertDownloading },
                    { key: 'cert_all', icon: <FileTextOutlined />, label: 'Certificate (All Filtered)', onClick: handleBatchCertAll, disabled: isCertDownloading },
                  ]
                }}
                trigger={['click']}
              >
                <Button icon={<DownloadOutlined />} loading={allMembersExportLoading}>
                  Download
                </Button>
              </Dropdown>
            )
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
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            preserveSelectedRowKeys: true,
          }}
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
                <Option value="closed">Closed (Marriage)</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Join Fees" name="paymentStatus">
              <Select placeholder="Select Join Fees Payment">
                <Option value="all">All</Option>
                <Option value="paid">Paid</Option>
                <Option value="partial">Partial</Option>
                <Option value="pending">Pending</Option>
              </Select>
            </Form.Item>

            <Form.Item label="Closing Payment" name="closingPaymentStatus">
              <Select placeholder="Select Closing Payment">
                <Option value="all">All</Option>
                <Option value="closedPaid">Paid</Option>
                <Option value="closedPending">Pending</Option>
                <Option value="closedPartial">Partial</Option>
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
              <PDFDownloadLink document={<CertificateCom data={selectedMember} memberProgram={programList?.find(p => p.id === selectedMember?.programId) || {}} />} fileName={fileName}>
                {({ loading: pdfLoading }) => (
                  <Button type="primary" loading={pdfLoading} disabled={pdfLoading}
                    onClick={() => setTimeout(() => setOpenCertificate(false), 500)}>
                    {pdfLoading ? 'Preparing PDF...' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          }>
          <CertificateViewer memberData={selectedMember}  />
        </Drawer>
      )}

      {rasidDrawerOpen && <RasidDrawer open={rasidDrawerOpen} setOpen={setRasidDrawerOpen} member={selectedMember} />}

      {paymentDetailsMember && (
        <PaymentDetailsDrawer
          member={paymentDetailsMember}
          visible={paymentDetailsVisible}
          onClose={() => { setPaymentDetailsVisible(false); setPaymentDetailsMember(null) }}
        />
      )}

      <PdfAutoDownloader pdfMeta={pdfMeta} onDone={() => setPdfMeta(null)} />
    </div>
  )
}

export default Page