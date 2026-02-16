"use client"
import React, { useState, useEffect } from 'react'
import {
  Card,
  Tabs,
  Table,
  Button,
  Space,
  Tag,
  Avatar,
  Modal,
  message,
  Input,
  Tooltip,
  Badge,
  Popconfirm,
  Empty,
  Drawer,
  Descriptions,
  Row,
  Col,
  Statistic
} from 'antd'
import {
  DeleteOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  ClearOutlined,
  WarningOutlined,
  FileTextOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  CalendarOutlined
} from '@ant-design/icons'
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  orderBy,
  writeBatch 
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '../../../lib/firbase-client'
import { useAuth } from '@/components/Base/AuthProvider'
import dayjs from 'dayjs'

const { TabPane } = Tabs
const { Search } = Input

const TrashManagementPage = () => {
  const [activeTab, setActiveTab] = useState('members')
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  
  // Data states
  const [deletedMembers, setDeletedMembers] = useState([])
  const [deletedAgents, setDeletedAgents] = useState([])
  const [deletedTransactions, setDeletedTransactions] = useState([])
  
  // View drawer states
  const [viewDrawerVisible, setViewDrawerVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [viewType, setViewType] = useState('member')
  
  // Stats
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalAgents: 0,
    totalTransactions: 0,
    totalItems: 0
  })

  const { user } = useAuth()

  // Fetch all deleted data
  useEffect(() => {
    fetchAllDeletedData()
  }, [])

  const fetchAllDeletedData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchDeletedMembers(),
        fetchDeletedAgents(),
        fetchDeletedTransactions()
      ])
    } catch (error) {
      console.error('Error fetching deleted data:', error)
      message.error('Failed to load trash data')
    } finally {
      setLoading(false)
    }
  }

  // Fetch deleted members
  const fetchDeletedMembers = async () => {
    try {
      const membersRef = collection(db, 'members')
      const q = query(
        membersRef,
        where('delete_flag', '==', true),
        orderBy('deleted_at', 'desc')
      )
      const querySnapshot = await getDocs(q)
      
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        deleted_at: doc.data().deleted_at?.toDate?.() || null,
        createdAt: doc.data().createdAt?.toDate?.() || null
      }))
      
      setDeletedMembers(data)
      updateStats('members', data.length)
    } catch (error) {
      console.error('Error fetching deleted members:', error)
    }
  }

  // Fetch deleted agents
  const fetchDeletedAgents = async () => {
    try {
      const agentsRef = collection(db, 'agents')
      const q = query(
        agentsRef,
        where('delete_flag', '==', true),
        orderBy('deleted_at', 'desc')
      )
      const querySnapshot = await getDocs(q)
      
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        deleted_at: doc.data().deleted_at?.toDate?.() || null,
        created_at: doc.data().created_at?.toDate?.() || null
      }))
      
      setDeletedAgents(data)
      updateStats('agents', data.length)
    } catch (error) {
      console.error('Error fetching deleted agents:', error)
    }
  }

  // Fetch deleted transactions
  const fetchDeletedTransactions = async () => {
    try {
      const transactionsRef = collection(db, 'transactions')
      const q = query(
        transactionsRef,
        where('delete_flag', '==', true),
        orderBy('deleted_at', 'desc')
      )
      const querySnapshot = await getDocs(q)
      
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        deleted_at: doc.data().deleted_at?.toDate?.() || null,
        created_at: doc.data().created_at?.toDate?.() || null
      }))
      
      setDeletedTransactions(data)
      updateStats('transactions', data.length)
    } catch (error) {
      console.error('Error fetching deleted transactions:', error)
    }
  }

  const updateStats = (type, count) => {
    setStats(prev => {
      const updated = { ...prev }
      if (type === 'members') updated.totalMembers = count
      if (type === 'agents') updated.totalAgents = count
      if (type === 'transactions') updated.totalTransactions = count
      updated.totalItems = updated.totalMembers + updated.totalAgents + updated.totalTransactions
      return updated
    })
  }

  // Extract storage paths from URLs
  const extractStoragePathsFromURLs = (item, type) => {
    const paths = []
    
    if (type === 'member') {
      // Extract from photoURL
      if (item.photoURL && item.photoURL.includes('firebasestorage.googleapis.com')) {
        const match = item.photoURL.match(/members%2Fphotos%2F([^?]+)/)
        if (match) {
          paths.push(`members/photos/${decodeURIComponent(match[1])}`)
        }
      }
      
      // Extract from document URLs
      if (item.documentFrontURL && item.documentFrontURL.includes('firebasestorage.googleapis.com')) {
        const match = item.documentFrontURL.match(/members%2Fdocuments%2F([^?]+)/)
        if (match) {
          paths.push(`members/documents/${decodeURIComponent(match[1])}`)
        }
      }
      
      if (item.documentBackURL && item.documentBackURL.includes('firebasestorage.googleapis.com')) {
        const match = item.documentBackURL.match(/members%2Fdocuments%2F([^?]+)/)
        if (match) {
          paths.push(`members/documents/${decodeURIComponent(match[1])}`)
        }
      }
      
      // Extract from guardian URLs
      if (item.guardianPhotoURL && item.guardianPhotoURL.includes('firebasestorage.googleapis.com')) {
        const match = item.guardianPhotoURL.match(/members%2Fguardian_photos%2F([^?]+)/)
        if (match) {
          paths.push(`members/guardian_photos/${decodeURIComponent(match[1])}`)
        }
      }
      
      if (item.guardianDocumentURL && item.guardianDocumentURL.includes('firebasestorage.googleapis.com')) {
        const match = item.guardianDocumentURL.match(/members%2Fguardian_documents%2F([^?]+)/)
        if (match) {
          paths.push(`members/guardian_documents/${decodeURIComponent(match[1])}`)
        }
      }
    } else if (type === 'agent') {
      // Extract agent URLs
      if (item.photoUrl && item.photoUrl.includes('firebasestorage.googleapis.com')) {
        const match = item.photoUrl.match(/agents%2F([^?]+)/)
        if (match) {
          paths.push(`agents/${decodeURIComponent(match[1])}`)
        }
      }
      
      if (item.documentUrl && item.documentUrl.includes('firebasestorage.googleapis.com')) {
        const match = item.documentUrl.match(/agents%2F([^?]+)/)
        if (match) {
          paths.push(`agents/${decodeURIComponent(match[1])}`)
        }
      }
    }
    
    return [...new Set(paths)] // Remove duplicates
  }

  // Delete storage files
  const deleteStorageFiles = async (item, type) => {
    try {
      // First check if we have storagePaths field
      const storagePaths = item.storagePaths || {}
      
      // Get all possible file paths
      let filePaths = []
      
      if (type === 'member') {
        filePaths = [
          storagePaths.photo,
          storagePaths.documentFront,
          storagePaths.documentBack,
          storagePaths.guardianPhoto,
          storagePaths.guardianDocument,
          ...extractStoragePathsFromURLs(item, 'member')
        ].filter(path => path && (path.startsWith('members/') || path.startsWith('agents/')))
      } else if (type === 'agent') {
        filePaths = [
          storagePaths.photo,
          storagePaths.document,
          ...extractStoragePathsFromURLs(item, 'agent')
        ].filter(path => path && (path.startsWith('members/') || path.startsWith('agents/')))
      }
      
      // Remove duplicates
      filePaths = [...new Set(filePaths)]
      
      // Delete each file
      const deletePromises = filePaths.map(async (filePath) => {
        try {
          const fileRef = ref(storage, filePath)
          await deleteObject(fileRef)
          console.log(`✅ Deleted file: ${filePath}`)
          return { success: true, path: filePath }
        } catch (error) {
          // File might not exist, ignore specific errors
          if (error.code === 'storage/object-not-found') {
            console.log(`ℹ️ File not found: ${filePath}`)
            return { success: false, path: filePath, error: 'Not found' }
          }
          console.error(`❌ Error deleting file ${filePath}:`, error)
          return { success: false, path: filePath, error: error.message }
        }
      })

      const results = await Promise.all(deletePromises)
      const successful = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      
      console.log(`Storage cleanup: ${successful} files deleted, ${failed} failed`)
      
      return {
        success: failed === 0,
        total: results.length,
        deleted: successful,
        failed: failed
      }
    } catch (error) {
      console.error('Error in deleteStorageFiles:', error)
      return {
        success: false,
        total: 0,
        deleted: 0,
        failed: 0,
        error: error.message
      }
    }
  }

  // Restore item
  const handleRestore = async (item, type) => {
    Modal.confirm({
      title: 'Confirm Restore',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to restore this ${type}? It will be available again in the system.`,
      okText: 'Yes, Restore',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const collectionName = type === 'member' ? 'members' : type === 'agent' ? 'agents' : 'transactions'
          const docRef = doc(db, collectionName, item.id)
          
          await updateDoc(docRef, {
            delete_flag: false,
            deleted_at: null,
            deleted_by: null,
            restored_at: new Date(),
            restored_by: user?.uid
          })
          
          message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} restored successfully!`)
          fetchAllDeletedData()
        } catch (error) {
          console.error('Error restoring item:', error)
          message.error('Failed to restore item')
        }
      }
    })
  }

  // Delete related transactions
  const deleteRelatedTransactions = async (id, type) => {
    try {
      const transactionsRef = collection(db, 'transactions')
      const field = type === 'member' ? 'memberId' : 'agentId'
      const q = query(transactionsRef, where(field, '==', id))
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.size > 0) {
        const batch = writeBatch(db)
        querySnapshot.forEach((docSnap) => {
          batch.delete(docSnap.ref)
        })
        await batch.commit()
        console.log(`🗑️ Deleted ${querySnapshot.size} related transactions`)
        return querySnapshot.size
      }
      return 0
    } catch (error) {
      console.error('Error deleting related transactions:', error)
      throw error
    }
  }

  // Permanent delete with storage cleanup
  const handlePermanentDelete = async (item, type) => {
    Modal.confirm({
      title: 'Permanent Delete',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p className="text-red-600 font-semibold mb-2">
            ⚠️ This action is irreversible!
          </p>
          <p>
            Are you sure you want to permanently delete this {type}? 
            {type === 'member' && ' All associated photos, documents, and related transactions will also be deleted.'}
            {type === 'agent' && ' All associated photos, documents, and related transactions will also be deleted.'}
          </p>
          {type === 'member' && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">
                <strong>Will delete:</strong>
              </p>
              <ul className="text-xs text-red-600 list-disc ml-4">
                <li>Member profile</li>
                <li>Profile photo</li>
                <li>Identity documents</li>
                <li>Guardian photos/documents</li>
                <li>All related transactions</li>
              </ul>
            </div>
          )}
        </div>
      ),
      okText: 'Yes, Delete Permanently',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true)
          
          let storageResult = null
          let transactionsDeleted = 0
          
          // Delete storage files for members and agents
          if (type === 'member' || type === 'agent') {
            storageResult = await deleteStorageFiles(item, type)
            
            if (!storageResult.success && storageResult.total > 0) {
              message.warning(`Some files could not be deleted (${storageResult.failed}/${storageResult.total})`)
            }
            
            // Delete related transactions
            try {
              transactionsDeleted = await deleteRelatedTransactions(item.id, type)
            } catch (error) {
              console.error('Failed to delete related transactions:', error)
              // Continue with main deletion even if transactions fail
            }
          }
          
          // Delete from Firestore
          const collectionName = type === 'member' ? 'members' : 
                                type === 'agent' ? 'agents' : 
                                'transactions'
          const docRef = doc(db, collectionName, item.id)
          await deleteDoc(docRef)
          
          // Show success message with details
          let successMsg = `${type.charAt(0).toUpperCase() + type.slice(1)} permanently deleted!`
          if (storageResult && storageResult.deleted > 0) {
            successMsg += ` (${storageResult.deleted} files deleted from storage)`
          }
          if (transactionsDeleted > 0) {
            successMsg += ` (${transactionsDeleted} related transactions deleted)`
          }
          
          message.success(successMsg)
          fetchAllDeletedData()
        } catch (error) {
          console.error('Error deleting item:', error)
          message.error(`Failed to delete ${type}: ${error.message}`)
        } finally {
          setLoading(false)
        }
      }
    })
  }
  // Empty trash for specific type
  const handleEmptyTrash = async (type) => {
    const items = type === 'members' ? deletedMembers : 
                  type === 'agents' ? deletedAgents : 
                  deletedTransactions
    
    if (items.length === 0) {
      message.info('Trash is already empty')
      return
    }

    Modal.confirm({
      title: 'Empty Trash',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p className="text-red-600 font-semibold mb-2">
            ⚠️ This will permanently delete all {items.length} {type}!
          </p>
          <p>
            {type === 'members' && 'All associated photos, documents, and transactions will also be deleted.'}
            {type === 'agents' && 'All associated photos, documents, and transactions will also be deleted.'}
          </p>
          <p className="mt-2 text-sm text-gray-600">This action cannot be undone. Are you sure?</p>
        </div>
      ),
      okText: 'Yes, Empty Trash',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true)
          
          // Delete storage files first (for members and agents)
          if (type === 'members' || type === 'agents') {
            let totalFilesDeleted = 0
            let totalFilesFailed = 0
            
            for (const item of items) {
              const result = await deleteStorageFiles(item, type.slice(0, -1)) // Remove 's' from type
              totalFilesDeleted += result.deleted || 0
              totalFilesFailed += result.failed || 0
            }
            
            if (totalFilesFailed > 0) {
              message.warning(`Some files could not be deleted (${totalFilesFailed} failed)`)
            }
            
            if (totalFilesDeleted > 0) {
              console.log(`🗑️ Deleted ${totalFilesDeleted} files from storage`)
            }
            
            // Delete related transactions in batch
            if (type === 'members') {
              await deleteAllRelatedTransactions(items, 'memberId')
            } else if (type === 'agents') {
              await deleteAllRelatedTransactions(items, 'agentId')
            }
          }
          
          // Delete from Firestore in batch
          const collectionName = type === 'members' ? 'members' : 
                                type === 'agents' ? 'agents' : 
                                'transactions'
          
          const batch = writeBatch(db)
          items.forEach(item => {
            const docRef = doc(db, collectionName, item.id)
            batch.delete(docRef)
          })
          
          await batch.commit()
          
          message.success(`Successfully deleted all ${items.length} ${type}!`)
          fetchAllDeletedData()
        } catch (error) {
          console.error('Error emptying trash:', error)
          message.error(`Failed to empty trash: ${error.message}`)
        } finally {
          setLoading(false)
        }
      }
    })
  }

  // Delete all related transactions for multiple items
  const deleteAllRelatedTransactions = async (items, field) => {
    try {
      const itemIds = items.map(item => item.id)
      const transactionsRef = collection(db, 'transactions')
      const q = query(transactionsRef, where(field, 'in', itemIds))
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.size > 0) {
        const batch = writeBatch(db)
        querySnapshot.forEach((docSnap) => {
          batch.delete(docSnap.ref)
        })
        await batch.commit()
        console.log(`🗑️ Deleted ${querySnapshot.size} related transactions`)
        return querySnapshot.size
      }
      return 0
    } catch (error) {
      console.error('Error deleting all related transactions:', error)
      // Don't throw, just log the error
      return 0
    }
  }

  // View item details
  const handleView = (item, type) => {
    setSelectedItem(item)
    setViewType(type)
    setViewDrawerVisible(true)
  }

  // Filter data based on search
  const filterData = (data) => {
    if (!searchText) return data
    
    const search = searchText.toLowerCase()
    return data.filter(item => {
      const searchableFields = [
        item.name,
        item.displayName,
        item.email,
        item.phone,
        item.phone1,
        item.registrationNumber,
        item.transactionId,
        item.village,
        item.city,
        item.fatherName,
        item.aadhaarNo,
        item.aadharNo
      ]
      
      return searchableFields.some(field => 
        field?.toLowerCase().includes(search)
      )
    })
  }

  // Members Table Columns
  const memberColumns = [
    {
      title: 'Member',
      key: 'member',
      width: 250,
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <Avatar 
            src={record.photoURL} 
            icon={<UserOutlined />}
            size={40}
          />
          <div>
            <div className="font-medium">{record.displayName}</div>
            <div className="text-xs text-gray-500">{record.registrationNumber}</div>
          </div>
        </div>
      )
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 150,
      render: (_, record) => (
        <div>
          <div className="text-sm">{record.phone}</div>
          <div className="text-xs text-gray-500">{record.village}</div>
        </div>
      )
    },
    {
      title: 'Deleted On',
      dataIndex: 'deleted_at',
      key: 'deleted_at',
      width: 150,
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY HH:mm') : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleView(record, 'member')}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Restore">
            <Button
              type="primary"
              icon={<RollbackOutlined />}
              onClick={() => handleRestore(record, 'member')}
              size="small"
            >
              Restore
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Permanently"
            description={
              <div className="max-w-xs">
                <p className="text-red-600 font-semibold mb-1">This action cannot be undone!</p>
                <p className="text-sm">All photos, documents, and related transactions will be deleted.</p>
              </div>
            }
            onConfirm={() => handlePermanentDelete(record, 'member')}
            okText="Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Tooltip title="Delete Permanently">
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  // Agents Table Columns
  const agentColumns = [
    {
      title: 'Agent',
      key: 'agent',
      width: 250,
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <Avatar 
            src={record.photoUrl} 
            icon={<UserOutlined />}
            size={40}
          />
          <div>
            <div className="font-medium">{record.name}</div>
            <div className="text-xs text-gray-500">{record.email}</div>
          </div>
        </div>
      )
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 150,
      render: (_, record) => (
        <div>
          <div className="text-sm">{record.phone1}</div>
          <div className="text-xs text-gray-500">{record.city}</div>
        </div>
      )
    },
    {
      title: 'Deleted On',
      dataIndex: 'deleted_at',
      key: 'deleted_at',
      width: 150,
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY HH:mm') : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleView(record, 'agent')}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Restore">
            <Button
              type="primary"
              icon={<RollbackOutlined />}
              onClick={() => handleRestore(record, 'agent')}
              size="small"
            >
              Restore
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Permanently"
            description={
              <div className="max-w-xs">
                <p className="text-red-600 font-semibold mb-1">This action cannot be undone!</p>
                <p className="text-sm">All photos, documents, and related transactions will be deleted.</p>
              </div>
            }
            onConfirm={() => handlePermanentDelete(record, 'agent')}
            okText="Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Tooltip title="Delete Permanently">
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  // Transactions Table Columns
  const transactionColumns = [
    {
      title: 'Transaction ID',
      dataIndex: 'transactionId',
      key: 'transactionId',
      width: 150,
      render: (text) => (
        <Tag color="blue">{text}</Tag>
      )
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type) => (
        <Tag color={type === 'credit' ? 'green' : 'red'}>
          {type?.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount) => (
        <span className="font-semibold">₹{amount?.toLocaleString()}</span>
      )
    },
    {
      title: 'Member/Agent',
      key: 'party',
      width: 200,
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.memberName || record.agentName}</div>
          <div className="text-xs text-gray-500">{record.description}</div>
        </div>
      )
    },
    {
      title: 'Deleted On',
      dataIndex: 'deleted_at',
      key: 'deleted_at',
      width: 150,
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY HH:mm') : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleView(record, 'transaction')}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Restore">
            <Button
              type="primary"
              icon={<RollbackOutlined />}
              onClick={() => handleRestore(record, 'transaction')}
              size="small"
            >
              Restore
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Permanently"
            description="This action cannot be undone!"
            onConfirm={() => handlePermanentDelete(record, 'transaction')}
            okText="Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Tooltip title="Delete Permanently">
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className="p-4 bg-gray-50 min-h-screen flex flex-col gap-4">
      {/* Header */}
      <Card className="shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DeleteOutlined className="text-red-600" />
              Trash Management
            </h1>
            <p className="text-gray-500">Manage deleted items and restore or permanently delete them</p>
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchAllDeletedData}
            loading={loading}
          >
            Refresh
          </Button>
        </div>

        {/* Statistics */}
        <Row gutter={16} className="mb-2">
          <Col span={6}>
            <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-0">
              <Statistic
                title="Total Items"
                value={stats.totalItems}
                prefix={<DeleteOutlined />}
                valueStyle={{ color: '#3f51b5' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card className="bg-gradient-to-r from-green-50 to-green-100 border-0">
              <Statistic
                title="Deleted Members"
                value={stats.totalMembers}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-0">
              <Statistic
                title="Deleted Agents"
                value={stats.totalAgents}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-0">
              <Statistic
                title="Deleted Transactions"
                value={stats.totalTransactions}
                prefix={<DollarOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Main Content */}
      <Card className="shadow-sm">
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          tabBarExtraContent={
            <Space>
              <Search
                placeholder="Search by name, phone, ID, village..."
                prefix={<SearchOutlined />}
                style={{ width: 300 }}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
              <Button
                danger
                icon={<ClearOutlined />}
                onClick={() => handleEmptyTrash(activeTab)}
                disabled={(
                  (activeTab === 'members' && deletedMembers.length === 0) ||
                  (activeTab === 'agents' && deletedAgents.length === 0) ||
                  (activeTab === 'transactions' && deletedTransactions.length === 0)
                )}
              >
                Empty Trash
              </Button>
            </Space>
          }
        >
          {/* Members Tab */}
          <TabPane
            tab={
              <span>
                <TeamOutlined />
                Members
                <Badge 
                  count={stats.totalMembers} 
                  showZero 
                  style={{ marginLeft: 8, backgroundColor: '#52c41a' }}
                />
              </span>
            }
            key="members"
          >
            <Table
              columns={memberColumns}
              dataSource={filterData(deletedMembers)}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `Total ${total} deleted members`
              }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: (
                  <Empty
                    description="No deleted members found"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )
              }}
            />
          </TabPane>

          {/* Agents Tab */}
          <TabPane
            tab={
              <span>
                <UserOutlined />
                Agents
                <Badge 
                  count={stats.totalAgents} 
                  showZero 
                  style={{ marginLeft: 8, backgroundColor: '#722ed1' }}
                />
              </span>
            }
            key="agents"
          >
            <Table
              columns={agentColumns}
              dataSource={filterData(deletedAgents)}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `Total ${total} deleted agents`
              }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: (
                  <Empty
                    description="No deleted agents found"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )
              }}
            />
          </TabPane>

          {/* Transactions Tab */}
          <TabPane
            tab={
              <span>
                <DollarOutlined />
                Transactions
                <Badge 
                  count={stats.totalTransactions} 
                  showZero 
                  style={{ marginLeft: 8, backgroundColor: '#fa8c16' }}
                />
              </span>
            }
            key="transactions"
          >
            <Table
              columns={transactionColumns}
              dataSource={filterData(deletedTransactions)}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `Total ${total} deleted transactions`
              }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: (
                  <Empty
                    description="No deleted transactions found"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* View Details Drawer */}
      <Drawer
        title={`${viewType.charAt(0).toUpperCase() + viewType.slice(1)} Details`}
        placement="right"
        width={600}
        open={viewDrawerVisible}
        onClose={() => setViewDrawerVisible(false)}
        footer={
          <Space className="w-full justify-end">
            <Button onClick={() => setViewDrawerVisible(false)}>Close</Button>
            <Button
              type="primary"
              icon={<RollbackOutlined />}
              onClick={() => {
                handleRestore(selectedItem, viewType)
                setViewDrawerVisible(false)
              }}
            >
              Restore
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                handlePermanentDelete(selectedItem, viewType)
                setViewDrawerVisible(false)
              }}
            >
              Delete Permanently
            </Button>
          </Space>
        }
      >
        {selectedItem && (
          <div className="space-y-4">
            {/* Member Details */}
            {viewType === 'member' && (
              <>
                <Card className="bg-gray-50">
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar 
                      src={selectedItem.photoURL} 
                      icon={<UserOutlined />}
                      size={80}
                    />
                    <div>
                      <h3 className="text-lg font-semibold">{selectedItem.displayName}</h3>
                      <Tag color="blue">{selectedItem.registrationNumber}</Tag>
                    </div>
                  </div>
                </Card>

                <Descriptions title="Member Information" bordered column={1}>
                  <Descriptions.Item label="Father Name">{selectedItem.fatherName || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Phone">
                    <div className="flex items-center gap-1">
                      <PhoneOutlined />
                      {selectedItem.phone || 'N/A'}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Aadhaar">
                    <div className="flex items-center gap-1">
                      <IdcardOutlined />
                      {selectedItem.aadhaarNo || 'N/A'}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Village/City">
                    <div className="flex items-center gap-1">
                      <EnvironmentOutlined />
                      {selectedItem.village}, {selectedItem.city}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Join Date">
                    <div className="flex items-center gap-1">
                      <CalendarOutlined />
                      {selectedItem.dateJoin || 'N/A'}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Deleted On">
                    {selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                  {selectedItem.deleted_by && (
                    <Descriptions.Item label="Deleted By">
                      User ID: {selectedItem.deleted_by}
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* File Information */}
                <Card title="Files" size="small">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileTextOutlined />
                      <span>Profile Photo: </span>
                      {selectedItem.photoURL ? (
                        <Tag color="green">Available</Tag>
                      ) : (
                        <Tag color="gray">Not available</Tag>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <FileTextOutlined />
                      <span>Documents: </span>
                      {selectedItem.documentFrontURL ? (
                        <Tag color="green">Available</Tag>
                      ) : (
                        <Tag color="gray">Not available</Tag>
                      )}
                    </div>
                    {selectedItem.guardian && (
                      <div className="flex items-center gap-2">
                        <FileTextOutlined />
                        <span>Guardian: {selectedItem.guardian}</span>
                        {selectedItem.guardianPhotoURL ? (
                          <Tag color="green">Photo available</Tag>
                        ) : (
                          <Tag color="gray">No photo</Tag>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </>
            )}

            {/* Agent Details */}
            {viewType === 'agent' && (
              <>
                <Card className="bg-gray-50">
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar 
                      src={selectedItem.photoUrl} 
                      icon={<UserOutlined />}
                      size={80}
                    />
                    <div>
                      <h3 className="text-lg font-semibold">{selectedItem.name}</h3>
                      <p className="text-gray-600">{selectedItem.email}</p>
                    </div>
                  </div>
                </Card>

                <Descriptions title="Agent Information" bordered column={1}>
                  <Descriptions.Item label="Father Name">{selectedItem.fatherName || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Phone">
                    <div className="flex items-center gap-1">
                      <PhoneOutlined />
                      {selectedItem.phone1 || 'N/A'}
                      {selectedItem.phone2 && ` / ${selectedItem.phone2}`}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Email">
                    <div className="flex items-center gap-1">
                      <MailOutlined />
                      {selectedItem.email || 'N/A'}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Aadhar">{selectedItem.aadharNo || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Location">
                    <div className="flex items-center gap-1">
                      <EnvironmentOutlined />
                      {selectedItem.city}, {selectedItem.district}, {selectedItem.state}
                    </div>
                  </Descriptions.Item>
                  <Descriptions.Item label="Deleted On">
                    {selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                  {selectedItem.deleted_by && (
                    <Descriptions.Item label="Deleted By">
                      User ID: {selectedItem.deleted_by}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}

            {/* Transaction Details */}
            {viewType === 'transaction' && (
              <>
                <Descriptions title="Transaction Information" bordered column={1}>
                  <Descriptions.Item label="Transaction ID">
                    <Tag color="blue">{selectedItem.transactionId}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Type">
                    <Tag color={selectedItem.type === 'credit' ? 'green' : 'red'}>
                      {selectedItem.type?.toUpperCase()}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Amount">
                    <span className="text-lg font-semibold">₹{selectedItem.amount?.toLocaleString()}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Description">{selectedItem.description}</Descriptions.Item>
                  <Descriptions.Item label="Payment Method">{selectedItem.paymentMethod || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Created On">
                    {selectedItem.created_at ? dayjs(selectedItem.created_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Deleted On">
                    {selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                  {selectedItem.deleted_by && (
                    <Descriptions.Item label="Deleted By">
                      User ID: {selectedItem.deleted_by}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default TrashManagementPage