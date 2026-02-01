// app/settings/users/components/PermissionDrawer.tsx
"use client"
import React, { useState, useEffect } from 'react'
import {
  Drawer,
  Button,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Switch,
  Checkbox,
  Tag,
  Tabs,
  Tree,
  message,
  Modal,
  Alert
} from 'antd'
import {
  SecurityScanOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
  TeamOutlined,
  SettingOutlined,
  DashboardOutlined,
  FileProtectOutlined,
  CreditCardOutlined,
  DatabaseOutlined,
  UserSwitchOutlined,
  InboxOutlined,
  TagOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  ClearOutlined,
  SaveOutlined,
  CloseOutlined
} from '@ant-design/icons'
import { userApi } from '@/utils/api'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  AGENT: 'agent',
  MEMBER: 'member'
}

// Menu tree data - synced with actual menu
const menuTreeData = [
  {
    title: 'Dashboard',
    key: '/',
    icon: <DashboardOutlined />,
    permissions: ['view']
  },
  {
    title: 'Programs',
    key: '/programs',
    icon: <AppstoreOutlined />,
    children: [
      { 
        title: 'Members', 
        key: '/programs/members',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'Closing Forms', 
        key: '/programs/closing-forms',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'Yojnas', 
        key: '/programs/yojnas',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      }
    ]
  },
  {
    title: 'Agents',
    key: '/agents',
    icon: <UserSwitchOutlined />,
    permissions: ['view', 'create', 'edit', 'delete', 'download']
  },
  {
    title: 'Members',
    key: '/members',
    icon: <TeamOutlined />,
    permissions: ['view', 'create', 'edit', 'delete', 'download']
  },
  {
    title: 'Requests',
    key: '/requests',
    icon: <InboxOutlined />,
    permissions: ['view', 'create', 'edit', 'delete', 'download']
  },
  {
    title: 'Payments',
    key: '/payments',
    icon: <CreditCardOutlined />,
    children: [
      { 
        title: 'Join Fees', 
        key: '/payments/join-fees',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'Closing Payment', 
        key: '/payments/closing-payment',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      }
    ]
  },
  {
    title: 'Master',
    key: '/master',
    icon: <DatabaseOutlined />,
    children: [
      { 
        title: 'Users', 
        key: '/master/users',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'State', 
        key: '/master/state',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'District', 
        key: '/master/district',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'City', 
        key: '/master/city',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'Cast', 
        key: '/master/cast',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      },
      { 
        title: 'Relations', 
        key: '/master/relations',
        permissions: ['view', 'create', 'edit', 'delete', 'download']
      }
    ]
  },
  {
    title: 'Rule & Policy',
    key: '/rule-policy',
    icon: <FileProtectOutlined />,
    permissions: ['view', 'edit']
  },
  {
    title: 'Expenses',
    key: '/expenses',
    icon: <TagOutlined />,
    permissions: ['view', 'create', 'edit', 'delete', 'download']
  },
  {
    title: 'Settings',
    key: '/settings',
    icon: <SettingOutlined />,
    children: [
      { 
        title: 'About', 
        key: '/settings/about',
        permissions: ['view', 'edit']
      },
      { 
        title: 'Contact', 
        key: '/settings/contact',
        permissions: ['view', 'edit']
      },
      {
        title: 'Security',
        key: '/settings/security',
        children: [
          { 
            title: 'Password Change', 
            key: '/settings/security/change-password',
            permissions: ['view']
          },
          { 
            title: 'Sessions', 
            key: '/settings/security/sessions',
            permissions: ['view', 'delete']
          }
        ]
      }
    ]
  },
  {
    title: 'Trash',
    key: '/trash',
    icon: <DeleteOutlined />,
    permissions: ['view', 'delete']
  }
]

const PermissionDrawer = ({ visible, onClose, selectedUser, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [permissions, setPermissions] = useState({
    pages: [],
    actions: {
      create: false,
      edit: false,
      delete: false,
      view: false,
      download: false
    },
    moduleAccess: {},
    pagePermissions: {}
  })
  const [checkedPages, setCheckedPages] = useState([])
  const [expandedKeys, setExpandedKeys] = useState([])

  useEffect(() => {
    if (visible && selectedUser) {
      const userPermissions = selectedUser.permissions || {
        pages: ['/'],
        actions: {
          create: false,
          edit: false,
          delete: false,
          view: true,
          download: false
        },
        moduleAccess: { dashboard: true },
        pagePermissions: {}
      }
      
      setPermissions(userPermissions)
      setCheckedPages(userPermissions.pages || ['/'])
      setExpandedKeys(['/', '/programs', '/payments', '/master', '/settings', '/settings/security'])
    }
  }, [visible, selectedUser])

  const handleSave = async () => {
    try {
      setLoading(true)
      
      const updatedPermissions = {
        ...permissions,
        pages: checkedPages,
        role: selectedUser.role,
      }
      
      await userApi.updateUser(selectedUser.id, {
        permissions: updatedPermissions,
        id: selectedUser.id,
        role: selectedUser.role,
      })
      
      message.success('Permissions updated successfully')
      onSuccess()
      
    } catch (error) {
      message.error(error.message || 'Failed to update permissions')
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePageCheck = (checkedKeys) => {
    setCheckedPages(checkedKeys)
    
    const newModuleAccess = { ...permissions.moduleAccess }
    const modules = {
      '/': 'dashboard',
      '/programs': 'programs',
      '/agents': 'agents',
      '/members': 'members',
      '/requests': 'requests',
      '/payments': 'payments',
      '/master': 'master',
      '/rule-policy': 'rulePolicy',
      '/expenses': 'expenses',
      '/settings': 'settings',
      '/trash': 'trash'
    }
    
    Object.keys(modules).forEach(key => {
      newModuleAccess[modules[key]] = false
    })
    
    checkedKeys.forEach(key => {
      const module = Object.keys(modules).find(m => key.startsWith(m))
      if (module && modules[module]) {
        newModuleAccess[modules[module]] = true
      }
    })
    
    setPermissions(prev => ({
      ...prev,
      moduleAccess: newModuleAccess
    }))
  }

  const handleActionChange = (action, value) => {
    setPermissions(prev => ({
      ...prev,
      actions: {
        ...prev.actions,
        [action]: value
      }
    }))
  }

  const handlePagePermissionChange = (pageKey, permission, value) => {
    setPermissions(prev => ({
      ...prev,
      pagePermissions: {
        ...prev.pagePermissions,
        [pageKey]: {
          ...prev.pagePermissions?.[pageKey],
          [permission]: value
        }
      }
    }))
  }

  const getPagePermissions = (pageKey) => {
    return permissions.pagePermissions?.[pageKey] || {
      view: checkedPages.includes(pageKey),
      create: false,
      edit: false,
      delete: false,
      download: false
    }
  }

  // Remove all permissions
  const handleRemoveAllPermissions = () => {
    Modal.confirm({
      title: 'Remove All Permissions?',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>This will remove all permissions for <strong>{selectedUser?.name}</strong>.</p>
          <p>User will only have access to view the Dashboard.</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>Are you sure?</p>
        </div>
      ),
      okText: 'Yes, Remove All',
      okType: 'danger',
      cancelText: 'Cancel',
      async onOk() {
        try {
          setLoading(true)
          
          const resetPermissions = {
            pages: ['/'],
            actions: {
              create: false,
              edit: false,
              delete: false,
              view: true,
              download: false,
              approve: false,
              request: false,
              add_agent: false,
              add_member: false
            },
            moduleAccess: { dashboard: true },
            pagePermissions: {}
          }
          
          setPermissions(resetPermissions)
          setCheckedPages(['/'])
          
          await userApi.updateUser(selectedUser.id, {
            permissions: resetPermissions,
            id: selectedUser.id,
            role: selectedUser.role,
          })
          
          message.success('All permissions removed successfully')
          onSuccess()
          
        } catch (error) {
          message.error(error.message || 'Failed to remove permissions')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  const renderTreeWithPermissions = (data) =>
    data.map((item) => ({
      key: item.key,
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {item.icon}
            <span>{item.title}</span>
          </div>
          {item.permissions && item.permissions.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {item.permissions.map(perm => {
                const pagePerms = getPagePermissions(item.key)
                const isChecked = pagePerms[perm]
                
                return (
                  <Checkbox
                    key={perm}
                    checked={isChecked}
                    onChange={(e) => handlePagePermissionChange(item.key, perm, e.target.checked)}
                    disabled={!checkedPages.includes(item.key)}
                  >
                    <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                      {perm.charAt(0)}
                    </span>
                  </Checkbox>
                )
              })}
            </div>
          )}
        </div>
      ),
      children: item.children ? renderTreeWithPermissions(item.children) : undefined
    }))

  if (!selectedUser) return null

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <SecurityScanOutlined />
              <span>Permissions - {selectedUser.name}</span>
            </div>
            <Tag color={selectedUser.role === ROLES.SUPER_ADMIN ? 'gold' : 'blue'}>
              {selectedUser.role}
            </Tag>
          </div>
        </div>
      }
      open={visible}
      onClose={onClose}
      width={720}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0' }}>
          <Button 
            danger 
            icon={<ClearOutlined />}
            onClick={handleRemoveAllPermissions}
            disabled={selectedUser.role === ROLES.SUPER_ADMIN}
          >
            Remove All Permissions
          </Button>
          <Space>
            <Button onClick={onClose} icon={<CloseOutlined />}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              onClick={handleSave}
              loading={loading}
              disabled={selectedUser.role === ROLES.SUPER_ADMIN}
              icon={<SaveOutlined />}
            >
              Save Changes
            </Button>
          </Space>
        </div>
      }
    >
      {selectedUser.role === ROLES.SUPER_ADMIN ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4}>Super Admin - Full Access</Title>
          <Paragraph type="secondary">
            This user has complete access to all features.
            <br />
            Permissions cannot be modified.
          </Paragraph>
        </div>
      ) : (
        <Tabs defaultActiveKey="1">
          {/* Page Access Tab */}
          <TabPane tab="Page Access" key="1">
            <Card title="Select Pages" size="small" style={{ marginBottom: 16 }}>
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, maxHeight: 450, overflowY: 'auto' }}>
                <Tree
                  checkable
                  treeData={renderTreeWithPermissions(menuTreeData)}
                  checkedKeys={checkedPages}
                  onCheck={handlePageCheck}
                  expandedKeys={expandedKeys}
                  onExpand={setExpandedKeys}
                  showLine
                />
              </div>
              <Alert 
                message="V = View, C = Create, E = Edit, D = Delete, Do = Download" 
                type="info" 
                showIcon 
                style={{ marginTop: 12 }}
              />
            </Card>

            <Card title="Module Access" size="small">
              <Row gutter={[12, 12]}>
                {Object.entries({
                  dashboard: 'Dashboard',
                  programs: 'Programs',
                  agents: 'Agents',
                  members: 'Members',
                  requests: 'Requests',
                  payments: 'Payments',
                  master: 'Master',
                  rulePolicy: 'Rule & Policy',
                  expenses: 'Expenses',
                  settings: 'Settings',
                  trash: 'Trash'
                }).map(([key, label]) => (
                  <Col span={8} key={key}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                      <Text style={{ fontSize: 13 }}>{label}</Text>
                      <Switch 
                        checked={permissions.moduleAccess?.[key] || false}
                        size="small"
                        disabled
                      />
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          </TabPane>

          {/* Global Actions Tab */}
          <TabPane tab="Global Actions" key="2">
            <Card title="Basic Actions" size="small" style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                These actions apply to all pages user can access
              </Text>
              <Row gutter={[12, 12]}>
                {Object.entries({
                  view: 'View Records',
                  create: 'Create Records',
                  edit: 'Edit Records',
                  delete: 'Delete Records',
                  download: 'Download Data'
                }).map(([key, label]) => (
                  <Col span={12} key={key}>
                    <div style={{ 
                      padding: 12, 
                      border: '1px solid #d9d9d9', 
                      borderRadius: 6,
                      background: permissions.actions[key] ? '#f6ffed' : '#fff',
                      borderColor: permissions.actions[key] ? '#b7eb8f' : '#d9d9d9'
                    }}>
                      <Checkbox
                        checked={permissions.actions[key] || false}
                        onChange={(e) => handleActionChange(key, e.target.checked)}
                      >
                        <span style={{ fontWeight: 500 }}>{label}</span>
                      </Checkbox>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>

            <Card title="Advanced Actions" size="small">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries({
                  approve: 'Can Approve Requests',
                  request: 'Can Make Requests',
                  add_agent: 'Can Add Agents',
                  add_member: 'Can Add Members'
                }).map(([key, label]) => (
                  <div 
                    key={key}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: 12,
                      border: '1px solid #d9d9d9',
                      borderRadius: 6,
                      background: permissions.actions[key] ? '#e6f7ff' : '#fff',
                      borderColor: permissions.actions[key] ? '#91d5ff' : '#d9d9d9'
                    }}
                  >
                    <Text>{label}</Text>
                    <Switch 
                      checked={permissions.actions[key] || false}
                      onChange={(checked) => handleActionChange(key, checked)}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </TabPane>

          {/* Summary Tab */}
          <TabPane tab="Summary" key="3">
            <Alert
              message="Danger Zone"
              description={
                <div>
                  <Paragraph>
                    Remove all permissions to reset this user to minimum access (Dashboard only).
                  </Paragraph>
                  <Button 
                    danger 
                    icon={<ClearOutlined />}
                    onClick={handleRemoveAllPermissions}
                  >
                    Remove All Permissions
                  </Button>
                </div>
              }
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Card title="Current Permissions" size="small" style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Pages: </Text>
                <Tag color="blue">{checkedPages.length} selected</Tag>
              </div>
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
                {checkedPages.length === 0 ? (
                  <Text type="secondary">No pages selected</Text>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {checkedPages.map(key => (
                      <Tag key={key}>{key}</Tag>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Enabled Actions" size="small">
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
                {Object.entries(permissions.actions).filter(([_, value]) => value).length === 0 ? (
                  <Text type="secondary">No actions enabled</Text>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(permissions.actions)
                      .filter(([_, value]) => value)
                      .map(([key]) => (
                        <Tag key={key} color="green">
                          {key.replace(/_/g, ' ').toUpperCase()}
                        </Tag>
                      ))}
                  </div>
                )}
              </div>
            </Card>
          </TabPane>
        </Tabs>
      )}
    </Drawer>
  )
}

export default PermissionDrawer