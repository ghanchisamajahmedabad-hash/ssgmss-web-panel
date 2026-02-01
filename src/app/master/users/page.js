// app/settings/users/page.tsx
"use client"
import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Card,
  Row,
  Col,
  Input,
  Select,
  Space,
  Typography,
  Badge,
  Tag,
  Avatar,
  message,
  Popconfirm,
  Tooltip,
  Modal,
  Divider
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  SendOutlined,
  SecurityScanOutlined,
  ReloadOutlined,
  UserOutlined,
  CrownOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'

import { userApi } from '@/utils/api'
import UserDrawer from '@/components/pages/settings/users/UserDrawer'
import PermissionDrawer from '@/components/pages/settings/users/PermissionDrawer'

const { Title, Paragraph, Text } = Typography
const { Option } = Select

// Define roles
const ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  AGENT: 'agent',
  MEMBER: 'member'
}

const UsersPage = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [permissionDrawerVisible, setPermissionDrawerVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const { user: currentUser } = useAuth()

  // Check if current user has permission
  const canManageUsers = currentUser?.role === ROLES.SUPER_ADMIN || currentUser?.role === ROLES.ADMIN
  
  // Fetch users from API
  useEffect(() => {
    fetchUsers()
  }, [pagination.current, filterRole, filterStatus])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const filters = {
        role: "all",
        status: "all",
        page: pagination.current
      }
      
      const result = await userApi.getUsers(pagination.current, filters)
      
      setUsers(result.data)
      setPagination(prev => ({
        ...prev,
        total: result.pagination.total
      }))
    } catch (error) {
      message.error('Failed to fetch users')
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  // Table columns
  const columns = [
    {
      title: 'User',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      render: (text, record) => (
        <div className="flex items-center gap-3">
          <Avatar 
            size="large" 
            src={record.photoURL} 
            icon={!record.photoURL && <UserOutlined />}
            className={`border-2 ${
              record.role === ROLES.SUPER_ADMIN 
                ? 'border-warning' 
                : record.role === ROLES.ADMIN
                ? 'border-error'
                : record.role === ROLES.AGENT
                ? 'border-success'
                : 'border-primary'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <Text strong className="text-foreground">{text}</Text>
              {record.role === ROLES.SUPER_ADMIN && (
                <CrownOutlined className="text-warning" />
              )}
            </div>
            <Text type="secondary" className="text-xs">{record.email}</Text>
          </div>
        </div>
      )
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role) => {
        const roleConfig = {
          [ROLES.SUPER_ADMIN]: {
            color: 'gold',
            label: 'Super Admin',
            icon: <CrownOutlined />
          },
          [ROLES.ADMIN]: {
            color: 'var(--error)',
            label: 'Admin',
            icon: <SettingOutlined />
          },
          [ROLES.AGENT]: {
            color: 'var(--success)',
            label: 'Agent',
            icon: <UserOutlined />
          },
          [ROLES.MEMBER]: {
            color: 'var(--info)',
            label: 'Member',
            icon: <UserOutlined />
          }
        }
        
        const config = roleConfig[role] || roleConfig[ROLES.MEMBER]
        
        return (
          <Tag 
            color={config.color}
            className="font-semibold uppercase px-3 py-1 rounded-full flex items-center gap-1"
          >
            {config.icon}
            {config.label}
          </Tag>
        )
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const colors = {
          active: 'success',
          inactive: 'error',
          pending: 'warning'
        }
        return (
          <Badge 
            status={colors[status]}
            text={
              <span className="font-medium capitalize">
                {status}
              </span>
            }
          />
        )
      }
    },
    {
      title: 'Permissions',
      key: 'permissions',
      width: 150,
      render: (_, record) => {
        const hasPages = record.permissions?.pages?.length > 0
        const hasActions = Object.values(record.permissions?.actions || {}).some(v => v)
        
        return (
          <div className="flex flex-col gap-1">
            <Tag color={hasPages ? 'green' : 'default'} size="small">
              {hasPages ? `${record.permissions.pages.length} pages` : 'All Page Access'}
            </Tag>
            <Tag color={hasActions ? 'blue' : 'default'} size="small">
              {hasActions ? 'Actions set' : 'All actions Access'}
            </Tag>
          </div>
        )
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => {
        const canEdit = canManageUsers && record.role !== ROLES.SUPER_ADMIN
        const canDelete = canManageUsers && record.role !== ROLES.SUPER_ADMIN && record.id !== currentUser?.uid
        const canSetPermissions = canManageUsers && record.role !== ROLES.SUPER_ADMIN

        return (
          <Space>
            <Tooltip title="View Details">
              <Button 
                type="text" 
                icon={<EyeOutlined />}
                className="text-info hover:bg-info/10"
                onClick={() => handleViewDetails(record)}
              />
            </Tooltip>
            
            {canEdit && (
              <Tooltip title="Edit">
                <Button 
                  type="text" 
                  icon={<EditOutlined />}
                  className="text-warning hover:bg-warning/10"
                  onClick={() => handleEdit(record)}
                />
              </Tooltip>
            )}
            
            {canSetPermissions && (
              <Tooltip title="Set Permissions">
                <Button 
                  type="text" 
                  icon={<SecurityScanOutlined />}
                  className="text-accent hover:bg-accent/10"
                  onClick={() => handleEditPermissions(record)}
                />
              </Tooltip>
            )}
            
            {canDelete && (
              <Popconfirm
                title="Delete User"
                description="Are you sure to delete this user? This action cannot be undone."
                onConfirm={() => handleDelete(record.id)}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Delete">
                  <Button 
                    type="text" 
                    icon={<DeleteOutlined />}
                    className="text-error hover:bg-error/10"
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      }
    }
  ]

  const handleEdit = (user) => {
    setEditingUser(user)
    setDrawerVisible(true)
  }

  const handleEditPermissions = (user) => {
    setSelectedUser(user)
    setPermissionDrawerVisible(true)
  }

  const handleViewDetails = (user) => {
    Modal.info({
      title: 'User Details',
      width: 600,
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar size={80} src={user.photoURL} icon={!user.photoURL && <UserOutlined />} />
            <div>
              <Title level={4}>{user.name}</Title>
              <Text type="secondary">{user.email}</Text>
            </div>
          </div>
          
          <Divider />
          
          <Row gutter={16}>
            <Col span={12}>
              <Text strong>Phone:</Text>
              <div>{user.phone || 'Not set'}</div>
            </Col>
            <Col span={12}>
              <Text strong>Role:</Text>
              <div>
                <Tag color={user.role === ROLES.SUPER_ADMIN ? 'gold' : 'blue'}>
                  {user.role}
                </Tag>
              </div>
            </Col>
            <Col span={12}>
              <Text strong>Status:</Text>
              <div>
                <Badge status={user.status === 'active' ? 'success' : 'error'} text={user.status} />
              </div>
            </Col>
            <Col span={12}>
              <Text strong>Created:</Text>
              <div>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</div>
            </Col>
          </Row>
          
          <Divider />
          
          <div>
            <Text strong>Permissions Summary:</Text>
            <div className="mt-2">
              <div>Page Access: {user.permissions?.pages?.length || 0} pages</div>
              <div>Module Access: {Object.values(user.permissions?.moduleAccess || {}).filter(v => v).length} modules</div>
            </div>
          </div>
        </div>
      ),
      okText: 'Close'
    })
  }

  const handleDelete = async (userId) => {
    try {
      await userApi.deleteUser(userId)
      message.success('User deleted successfully')
      fetchUsers()
    } catch (error) {
      message.error(error.message || 'Failed to delete user')
    }
  }

  const handleTableChange = (pagination) => {
    setPagination(pagination)
  }

  // Filter users locally for search
  const filteredUsers = users.filter(user => {
    if (!searchText) return true
    
    return (
      user.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchText.toLowerCase())
    )
  })

  return (
    <div className="p-4 md:p-3">
      {/* Header */}
      <div className="mb-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <div>
            <Title level={2} className="text-foreground mb-2 !text-2xl">
              User Management
            </Title>
            <Paragraph className="text-foreground-secondary !mb-0">
              Manage users and assign granular permissions
            </Paragraph>
          </div>
          
          {canManageUsers && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={() => {
                setEditingUser(null)
                setDrawerVisible(true)
              }}
              className="gradient-primary hover:shadow-lg transition-all duration-300 h-12 px-6 w-full md:w-auto"
            >
              Add New User
            </Button>
          )}
        </div>

    
      </div>

      {/* Users Table */}
      <Card className="shadow-lg">
        <Table
          columns={columns}
          dataSource={filteredUsers}
          loading={loading}
          rowKey="id"
          
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} users`
          }}
          onChange={handleTableChange}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* User Drawer */}
      <UserDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        editingUser={editingUser}
        onSuccess={() => {
          setDrawerVisible(false)
          setEditingUser(null)
          fetchUsers()
        }}
        currentUser={currentUser}
      />

      {/* Permission Drawer */}
      <PermissionDrawer
        visible={permissionDrawerVisible}
        onClose={() => setPermissionDrawerVisible(false)}
        selectedUser={selectedUser}
        onSuccess={() => {
          setPermissionDrawerVisible(false)
          setSelectedUser(null)
          fetchUsers()
        }}
      />
    </div>
  )
}

export default UsersPage