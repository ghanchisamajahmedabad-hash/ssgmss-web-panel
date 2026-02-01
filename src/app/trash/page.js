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
  Row,
  Col,
  Statistic,
  Descriptions,
  Drawer
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
  FileTextOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  CalendarOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore'
import { db } from '../../../lib/firbase-client'
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

  // Permanent delete
  const handlePermanentDelete = async (item, type) => {
    Modal.confirm({
      title: 'Permanent Delete',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p className="text-red-600 font-semibold mb-2">
            This action is irreversible!
          </p>
          <p>
            Are you sure you want to permanently delete this {type}? 
            All associated data will be lost forever.
          </p>
        </div>
      ),
      okText: 'Yes, Delete Permanently',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const collectionName = type === 'member' ? 'members' : type === 'agent' ? 'agents' : 'transactions'
          const docRef = doc(db, collectionName, item.id)
          
          await deleteDoc(docRef)
          
          message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} permanently deleted!`)
          fetchAllDeletedData()
        } catch (error) {
          console.error('Error deleting item:', error)
          message.error('Failed to delete item permanently')
        }
      }
    })
  }

  // View item details
  const handleView = (item, type) => {
    setSelectedItem(item)
    setViewType(type)
    setViewDrawerVisible(true)
  }

  // Empty trash for specific type
  const handleEmptyTrash = (type) => {
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
            This will permanently delete all {items.length} items!
          </p>
          <p>This action cannot be undone. Are you sure?</p>
        </div>
      ),
      okText: 'Yes, Empty Trash',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true)
          const collectionName = type === 'members' ? 'members' : 
                                type === 'agents' ? 'agents' : 
                                'transactions'
          
          const deletePromises = items.map(item => 
            deleteDoc(doc(db, collectionName, item.id))
          )
          
          await Promise.all(deletePromises)
          
          message.success(`All ${type} permanently deleted!`)
          fetchAllDeletedData()
        } catch (error) {
          console.error('Error emptying trash:', error)
          message.error('Failed to empty trash')
        } finally {
          setLoading(false)
        }
      }
    })
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
        item.city
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
            description="This action cannot be undone!"
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
            description="This action cannot be undone!"
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
    <div className="p-4 bg-gray-50 min-h-screen flex flex-col gap-2">
      {/* Header */}
      <Card className=" shadow-sm">
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

   
      </Card>

      {/* Main Content */}
      <Card className="shadow-sm">
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          tabBarExtraContent={
            <Space>
              <Search
                placeholder="Search..."
                prefix={<SearchOutlined />}
                style={{ width: 300 }}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
              <Button
                danger
                icon={<ClearOutlined />}
                onClick={() => handleEmptyTrash(activeTab)}
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
                  <Descriptions.Item label="Father Name">{selectedItem.fatherName}</Descriptions.Item>
                  <Descriptions.Item label="Phone">{selectedItem.phone}</Descriptions.Item>
                  <Descriptions.Item label="Aadhaar">{selectedItem.aadhaarNo}</Descriptions.Item>
                  <Descriptions.Item label="Village">{selectedItem.village}</Descriptions.Item>
                  <Descriptions.Item label="City">{selectedItem.city}</Descriptions.Item>
                  <Descriptions.Item label="Join Date">{selectedItem.dateJoin}</Descriptions.Item>
                  <Descriptions.Item label="Deleted On">
                    {selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                </Descriptions>
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
                  <Descriptions.Item label="Father Name">{selectedItem.fatherName}</Descriptions.Item>
                  <Descriptions.Item label="Phone 1">{selectedItem.phone1}</Descriptions.Item>
                  <Descriptions.Item label="Phone 2">{selectedItem.phone2 || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Aadhar">{selectedItem.aadharNo}</Descriptions.Item>
                  <Descriptions.Item label="State">{selectedItem.state}</Descriptions.Item>
                  <Descriptions.Item label="District">{selectedItem.district}</Descriptions.Item>
                  <Descriptions.Item label="City">{selectedItem.city}</Descriptions.Item>
                  <Descriptions.Item label="Deleted On">
                    {selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
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
                  <Descriptions.Item label="Payment Method">{selectedItem.paymentMethod}</Descriptions.Item>
                  <Descriptions.Item label="Created On">
                    {selectedItem.created_at ? dayjs(selectedItem.created_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Deleted On">
                    {selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}

            <div className="flex gap-2 mt-6">
              <Button
                type="primary"
                icon={<RollbackOutlined />}
                onClick={() => {
                  handleRestore(selectedItem, viewType)
                  setViewDrawerVisible(false)
                }}
                block
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
                block
              >
                Delete Permanently
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default TrashManagementPage