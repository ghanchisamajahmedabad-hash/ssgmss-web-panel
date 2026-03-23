"use client";
import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Card, Row, Col, Upload,
  Checkbox, Tag, Space, Switch, Typography, Avatar, Tooltip, Badge,
  Drawer, Descriptions, notification, App, Popover
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  UserOutlined, MailOutlined, PhoneOutlined, EnvironmentOutlined,
  IdcardOutlined, SaveOutlined, UploadOutlined, SignatureOutlined,
  FileOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SearchOutlined, FilterOutlined, FileTextOutlined, PictureOutlined,
  ExclamationCircleOutlined, StopOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { agentApi } from '@/utils/api';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';

const { Title, Text } = Typography;
const { Option }      = Select;
const { Password }    = Input;

// ─── helpers ─────────────────────────────────────────────────────────────────
const formatDate = (ts) => {
  if (!ts) return "N/A";
  if (typeof ts.toDate === "function") return dayjs(ts.toDate()).format("DD/MM/YYYY HH:mm");
  if (ts._seconds) return dayjs(new Date(ts._seconds * 1000 + ts._nanoseconds / 1e6)).format("DD/MM/YYYY HH:mm");
  if (ts.seconds)  return dayjs(new Date(ts.seconds  * 1000 + ts.nanoseconds  / 1e6)).format("DD/MM/YYYY HH:mm");
  return dayjs(ts).isValid() ? dayjs(ts).format("DD/MM/YYYY HH:mm") : "Invalid Date";
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

// ─────────────────────────────────────────────────────────────────────────────
const AgentsManagementPage = () => {
  const [agents,           setAgents]           = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [modalVisible,     setModalVisible]     = useState(false);
  const [editingAgent,     setEditingAgent]     = useState(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedAgent,    setSelectedAgent]    = useState(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, pageSizeOptions: ['10','20','50','100'] });
  const [filters,    setFilters]    = useState({ status: 'all', search: '' });
  const { message } = App.useApp();
  const { user } = useAuth();
const isSuperAdmin = (user) => user?.role === 'superadmin';
  const usersPermissions = user?.permissions || {};
  // Files
  const [photoFile,      setPhotoFile]      = useState(null);
  const [photoFileInfo,  setPhotoFileInfo]  = useState(null);
  const [photoPreview,   setPhotoPreview]   = useState(null);
  const [document1File,  setDocument1File]  = useState(null);
  const [document1FileInfo, setDocument1FileInfo] = useState(null);
  const [document2File,  setDocument2File]  = useState(null);
  const [document2FileInfo, setDocument2FileInfo] = useState(null);
  const [document3File,  setDocument3File]  = useState(null);
  const [document3FileInfo, setDocument3FileInfo] = useState(null);
  const [signatureFile,  setSignatureFile]  = useState(null);
  const [signatureFileInfo, setSignatureFileInfo] = useState(null);
  const [signaturePreview,  setSignaturePreview]  = useState(null);

  // Master data
  const [castes,    setCastes]    = useState([]);
  const [states,    setStates]    = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities,    setCities]    = useState([]);

  // ── Fetch agents ────────────────────────────────────────────────────────────
  const fetchAgents = async (page = 1, customFilters = {}) => {
    try {
      setLoading(true);
      const f = { ...filters, ...customFilters };
      const result = await agentApi.getAgents(page, { status: f.status, search: f.search, limit: pagination.pageSize });
      if (result.success) {
        setAgents(result.data || []);
        setPagination(prev => ({ ...prev, current: page, total: result.pagination?.total || result.data?.length || 0 }));
      } else {
        message.error(result.message || 'Failed to fetch agents');
      }
    } catch (e) {
      notification.error({ message: 'Error', description: e.message || 'Failed to fetch agents' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAgents(1); loadMasterData(); }, []);

  const loadMasterData = async () => {
    try {
      const [cSnap, stSnap, dSnap, ciSnap] = await Promise.all([
        getDocs(collection(db, 'castes')),
        getDocs(collection(db, 'states')),
        getDocs(collection(db, 'districts')),
        getDocs(collection(db, 'cities')),
      ]);
      const active = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.status === 'active');
      setCastes(active(cSnap)); setStates(active(stSnap)); setDistricts(active(dSnap)); setCities(active(ciSnap));
    } catch (e) { message.error('Failed to load master data'); }
  };

  const handleTableChange  = (pg) => { setPagination(pg); fetchAgents(pg.current); };
  const handleSearch       = (v)  => { setFilters(p => ({...p, search: v})); fetchAgents(1, { search: v }); };
  const handleStatusFilter = (s)  => { setFilters(p => ({...p, status: s})); fetchAgents(1, { status: s }); };
  const handleRefresh      = ()   => { fetchAgents(pagination.current); message.success('Refreshed'); };

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload  = () => res({ name: file.name, type: file.type, size: file.size, data: r.result.split(',')[1] });
    r.onerror = rej;
  });

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const files = {};
      if (photoFile)     files.photoFile     = await fileToBase64(photoFile);
      if (signatureFile) files.signatureFile = await fileToBase64(signatureFile);
      if (document1File) files.document1File = await fileToBase64(document1File);
      if (document2File) files.document2File = await fileToBase64(document2File);
      if (document3File) files.document3File = await fileToBase64(document3File);

      const agentData = { ...values, ...files, sendEmail: !!values.sendEmail, status: values.status || 'active' };

      if (!editingAgent) {
        if (!values.password) { message.error('Password is required'); setLoading(false); return; }
        if (values.password !== values.confirmPassword) { message.error('Passwords do not match'); setLoading(false); return; }
        agentData.password = values.password;
      } else {
        if (values.password) {
          if (values.password !== values.confirmPassword) { message.error('Passwords do not match'); setLoading(false); return; }
          agentData.updatePassword = values.password;
        }
      }

      const result = editingAgent
        ? await agentApi.updateAgent(editingAgent.id, agentData)
        : await agentApi.createAgent(agentData);

      if (result.success) {
        message.success(result.message || `Agent ${editingAgent ? 'updated' : 'created'} successfully!`);
        if (result.data?.tempPassword) {
          Modal.info({
            title: 'Agent Created Successfully',
            content: <div><p>Temporary password for <strong>{result.data.email}</strong>:</p><p className="bg-gray-100 p-2 rounded font-mono text-lg">{result.data.tempPassword}</p><p className="text-red-600 mt-2">Please save this password.</p></div>,
            okText: 'Got it', width: 500
          });
        }
        resetForm(); fetchAgents(pagination.current);
      } else {
        message.error(result.error || result.message || 'Failed to save agent');
      }
    } catch (e) {
      notification.error({ message: 'Error', description: e.message });
    } finally { setLoading(false); }
  };

  const handleEdit = (agent) => {
    setEditingAgent(agent);
    form.setFieldsValue({ ...agent, sendEmail: false, password: '', confirmPassword: '' });
    setPhotoPreview(agent.photoUrl || null);
    setSignaturePreview(agent.signatureUrl || null);
    setModalVisible(true);
  };

  // ── Delete — two-step: soft then hard ──────────────────────────────────────
  const handleSoftDelete = (record) => {
    Modal.confirm({
      title:   'Delete Agent',
      icon:    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p>Move <b>{record.name}</b> to trash?</p>
          <p className="text-gray-500 text-sm mt-1">The agent will be deactivated and moved to trash. You can restore them later.</p>
        </div>
      ),
      okText:   'Move to Trash',
      okType:   'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true);
          // Calls DELETE /api/agents?id=xxx  (soft delete — no hard=true param)
          const result = await agentApi.deleteAgent(record.id, false);
          if (result.success) { message.success('Agent moved to trash'); fetchAgents(pagination.current); }
          else message.error(result.message || 'Failed to delete agent');
        } catch (e) { notification.error({ message: 'Error', description: e.message }); }
        finally { setLoading(false); }
      }
    });
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      const result = await agentApi.toggleStatus(id, currentStatus);
      if (result.success) { message.success(`Agent ${currentStatus === 'active' ? 'deactivated' : 'activated'}`); fetchAgents(pagination.current); }
      else message.error(result.message || 'Failed to update status');
    } catch (e) { notification.error({ message: 'Error', description: e.message }); }
  };

  const viewAgentDetails = (agent) => { setSelectedAgent(agent); setViewModalVisible(true); };

  const resetForm = () => {
    form.resetFields(); setEditingAgent(null); setModalVisible(false);
    setPhotoFile(null); setPhotoFileInfo(null); setPhotoPreview(null);
    setDocument1File(null); setDocument1FileInfo(null);
    setDocument2File(null); setDocument2FileInfo(null);
    setDocument3File(null); setDocument3FileInfo(null);
    setSignatureFile(null); setSignatureFileInfo(null); setSignaturePreview(null);
  };

  const handleFileChange = (file, fileType) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const info = { name: file.name, size: file.size, type: file.type };
      if (fileType === 'photo')      { setPhotoPreview(e.target.result); setPhotoFile(file); setPhotoFileInfo(info); }
      if (fileType === 'signature')  { setSignaturePreview(e.target.result); setSignatureFile(file); setSignatureFileInfo(info); }
      if (fileType === 'document1')  { setDocument1File(file); setDocument1FileInfo(info); }
      if (fileType === 'document2')  { setDocument2File(file); setDocument2FileInfo(info); }
      if (fileType === 'document3')  { setDocument3File(file); setDocument3FileInfo(info); }
    };
    reader.readAsDataURL(file);
    return true;
  };

  const beforeUpload = (file, fileType) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { message.error('Image or PDF only!'); return false; }
    if (file.size / 1024 / 1024 > 5) { message.error('Max 5MB!'); return false; }
    return handleFileChange(file, fileType);
  };

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'AGENT', dataIndex: 'name', key: 'name', width: 250, fixed: 'left',
      render: (text, r) => (
        <div className="flex items-center gap-3">
          {r.photoUrl ? <Avatar size={45} src={r.photoUrl} className="border border-gray-300" /> : <Avatar size={45} icon={<UserOutlined />} className="bg-blue-100 text-blue-600 border border-blue-300" />}
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">Father: {r.fatherName || 'N/A'}</div>
            <div className="text-xs text-gray-500">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'CONTACT', key: 'contact', width: 180,
      render: (_, r) => (
        <div>
          <div className="flex items-center gap-2 mb-1"><PhoneOutlined className="text-blue-600 text-xs" /><span className="text-sm font-medium">{r.phone1}</span></div>
          {r.phone2 && <div className="flex items-center gap-2 mb-1"><PhoneOutlined className="text-gray-400 text-xs" /><span className="text-xs text-gray-600">{r.phone2}</span></div>}
          <div className="flex items-center gap-2"><MailOutlined className="text-gray-400 text-xs" /><span className="text-xs text-gray-600 truncate">{r.email}</span></div>
        </div>
      ),
    },
    {
      title: 'LOCATION', key: 'address', width: 200,
      render: (_, r) => (
        <div className="text-sm flex items-start gap-1">
          <EnvironmentOutlined className="text-green-600 mt-0.5 text-xs" />
          <div>
            <div className="text-gray-700">{r.city || 'N/A'}, {r.district || 'N/A'}</div>
            <div className="text-xs text-gray-500">{r.state || 'N/A'}</div>
            <div className="text-xs text-gray-500">PIN: {r.pincode || 'N/A'}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'AADHAAR', dataIndex: 'aadharNo', key: 'aadharNo', width: 150,
      render: (text) => <div className="flex items-center gap-2"><IdcardOutlined className="text-purple-600" /><span className="font-mono text-sm">{text || 'N/A'}</span></div>,
    },
    {
      title: 'STATUS', dataIndex: 'status', key: 'status', width: 120,
      render: (status) => (
        <div className="flex items-center gap-2">
          {status === 'active' ? <CheckCircleOutlined className="text-green-600" /> : <CloseCircleOutlined className="text-red-600" />}
          <Tag color={status === 'active' ? 'success' : 'error'}>{status === 'active' ? 'Active' : 'Inactive'}</Tag>
        </div>
      ),
    },
    {
      title: 'CREATED', key: 'created_at', width: 130,
      render: (_, r) => <div className="text-xs text-gray-500">{formatDate(r.created_at)}</div>,
    },
    {
      title: 'ACTIONS', key: 'actions', width: 210, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {
            isSuperAdmin(user) || usersPermissions?.actions?.view ? (
              <Tooltip title="View Details">
                <Button type="text" icon={<EyeOutlined className="text-blue-600" />} size="small" onClick={() => viewAgentDetails(record)} />
              </Tooltip>
            ) : null
          }
    {
            isSuperAdmin(user) || usersPermissions?.actions?.edit ? (
              <Tooltip title="Edit Agent">
                <Button type="text" icon={<EditOutlined className="text-green-600" />} size="small" onClick={() => handleEdit(record)} />
              </Tooltip>
            ) : null
    }

    {
            isSuperAdmin(user) || usersPermissions?.actions?.edit ? (
              <Tooltip title={record.status === 'active' ? 'Deactivate' : 'Activate'}>
                <Switch
                  checked={record.status === 'active'}
              onChange={() => toggleStatus(record.id, record.status)}
              size="small" checkedChildren="ON" unCheckedChildren="OFF"
            />
          </Tooltip>
            ) : null
    }
    {
            isSuperAdmin(user) || usersPermissions?.actions?.delete ? (  <Tooltip title="Move to Trash">
            <Button
              type="text" danger size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleSoftDelete(record)}
            />
          </Tooltip>) : null
    }
          {/* ── Soft-delete button (Move to Trash) ── */}
        
        </Space>
      ),
    },
  ];

  return (
    <div className="p-2 bg-gray-50 min-h-screen">
      <div className="max-w-400 mx-auto">
        {/* Header */}
        <Card className="mb-2! border-0 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Title level={3} className="text-gray-800 mb-2 flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg"><UserOutlined className="text-xl" /></div>
              <div>
                Agent Management
                <Text className="text-gray-600 text-sm block font-normal mt-1">Manage and monitor all agent accounts</Text>
              </div>
            </Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>Refresh</Button>
              {
                isSuperAdmin(user) || usersPermissions?.actions?.add_agent ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)} className="bg-blue-600 border-0 shadow-md">Add New Agent</Button>
                ) : null
              }
            </Space>
          </div>

          <div className="mt-6 flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Search agents by name, email, phone, aadhar, city..."
              prefix={<SearchOutlined />} value={filters.search}
              onChange={e => setFilters(p => ({...p, search: e.target.value}))}
              onPressEnter={() => handleSearch(filters.search)}
              allowClear className="md:w-96" size="large"
            />
            <Space>
              <Select placeholder="Filter by status" value={filters.status} onChange={handleStatusFilter} style={{ width: 150 }} size="large">
                <Option value="all">All Status</Option>
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
              </Select>
              <Button icon={<FilterOutlined />} onClick={() => handleSearch(filters.search)} size="large">Apply</Button>
            </Space>
          </div>
        </Card>

        {/* Table */}
        <Card className="shadow-sm rounded-lg border-0">
          <div className="mb-4 flex justify-between items-center">
            <Title level={5} className="text-gray-700">All Agents ({pagination.total})</Title>
          </div>
          <Table columns={columns} dataSource={agents} rowKey="id" loading={loading}
            pagination={pagination} onChange={handleTableChange}
            scroll={{ x: 1500 }} rowClassName="hover:bg-blue-50 transition-colors duration-200" />
        </Card>

        {/* Add/Edit Drawer */}
        <Drawer
          title={
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">{editingAgent ? <EditOutlined className="text-blue-600 text-xl" /> : <PlusOutlined className="text-blue-600 text-xl" />}</div>
              <div>
                <div className="font-semibold text-lg">{editingAgent ? 'Edit Agent' : 'Add New Agent'}</div>
                <div className="text-xs text-gray-500">{editingAgent ? 'Update agent information' : 'Create a new agent account'}</div>
              </div>
            </div>
          }
          open={modalVisible} onClose={resetForm} width={800} footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ status: 'active' }}>
            {/* Photo + Basic */}
            <Card className="bg-gray-50 border-gray-200 mb-4">
              <Row gutter={16} align="middle">
                <Col span={6}>
                  <div className="text-center">
                    <div className="mb-2 text-sm font-medium text-gray-600">Agent Photo</div>
                    {photoPreview ? (
                      <div>
                        <Avatar size={100} src={photoPreview} className="mb-2 border-4 border-white shadow mx-auto" />
                        <Text className="text-xs text-gray-500 block mb-1">{photoFileInfo?.name || 'Photo uploaded'}</Text>
                        <Upload beforeUpload={f => beforeUpload(f, 'photo')} showUploadList={false} accept="image/*">
                          <Button size="small" icon={<UploadOutlined />}>Change</Button>
                        </Upload>
                      </div>
                    ) : (
                      <Upload beforeUpload={f => beforeUpload(f, 'photo')} showUploadList={false} accept="image/*">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                          <UserOutlined className="text-3xl text-gray-400 mb-2" />
                          <div className="text-sm text-gray-600">Upload Photo</div>
                          <div className="text-xs text-gray-500">Max 5MB</div>
                        </div>
                      </Upload>
                    )}
                  </div>
                </Col>
                <Col span={18}>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item name="name" label="Full Name" rules={[{ required: true }]}><Input placeholder="Full name" size="large" /></Form.Item></Col>
                    <Col span={12}><Form.Item name="fatherName" label="Father's Name" rules={[{ required: true }]}><Input placeholder="Father's name" size="large" /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="caste" label="Caste" rules={[{ required: true }]}>
                        <Select placeholder="Select caste" size="large" showSearch>
                          {castes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}><Form.Item name="aadharNo" label="Aadhar No." rules={[{ required: true }, { pattern: /^\d{12}$/, message: 'Must be 12 digits' }]}><Input placeholder="12-digit Aadhar" maxLength={12} size="large" /></Form.Item></Col>
                  </Row>
                </Col>
              </Row>
            </Card>

            {/* Contact */}
            <Card title="Contact Information" className="border-gray-200 mb-4">
              <Row gutter={16}>
                <Col span={8}><Form.Item name="phone1" label="Primary Phone" rules={[{ required: true }, { pattern: /^\d{10}$/ }]}><Input placeholder="10-digit" size="large" /></Form.Item></Col>
                <Col span={8}><Form.Item name="phone2" label="Secondary Phone" rules={[{ pattern: /^\d{10}$/ }]}><Input placeholder="Optional" size="large" /></Form.Item></Col>
                <Col span={8}><Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email' }]}><Input placeholder="Email" size="large" /></Form.Item></Col>
              </Row>
            </Card>

            {/* Security */}
            <Card title="Security" className="border-gray-200 mb-4">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="password" label={editingAgent ? "New Password (Optional)" : "Password"}
                    rules={editingAgent ? [] : [{ required: true }, { min: 8 }]}>
                    <Password placeholder={editingAgent ? "Leave empty to keep current" : "Min 8 characters"} size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="confirmPassword" label="Confirm Password" dependencies={['password']}
                    rules={[({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || !getFieldValue('password') || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      }
                    })]}>
                    <Password placeholder="Confirm password" size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Address */}
            <Card title="Address" className="border-gray-200 mb-4">
              <Row gutter={16}>
                <Col span={8}><Form.Item name="state" label="State" rules={[{ required: true }]}><Select placeholder="State" showSearch size="large">{states.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}</Select></Form.Item></Col>
                <Col span={8}><Form.Item name="district" label="District" rules={[{ required: true }]}><Select placeholder="District" showSearch size="large">{districts.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}</Select></Form.Item></Col>
                <Col span={8}><Form.Item name="city" label="City" rules={[{ required: true }]}><Select placeholder="City" showSearch size="large">{cities.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}</Select></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><Form.Item name="village" label="Village/Town" rules={[{ required: true }]}><Input placeholder="Village" size="large" /></Form.Item></Col>
                <Col span={12}><Form.Item name="pincode" label="Pincode" rules={[{ required: true }, { pattern: /^\d{6}$/ }]}><Input placeholder="6-digit" maxLength={6} size="large" /></Form.Item></Col>
              </Row>
            </Card>

            {/* Documents */}
            <Card title="Documents" className="border-gray-200 mb-4">
              <Row gutter={16}>
                {[
                  { key: 'document1', label: 'Document 1', file: document1File, info: document1FileInfo },
                  { key: 'document2', label: 'Document 2', file: document2File, info: document2FileInfo },
                  { key: 'document3', label: 'Document 3', file: document3File, info: document3FileInfo },
                ].map(doc => (
                  <Col span={8} key={doc.key}>
                    <div className="text-center">
                      <div className="mb-2 text-sm font-medium text-gray-600">{doc.label}</div>
                      {doc.file ? (
                        <div className="border border-green-200 bg-green-50 rounded p-3">
                          {doc.info?.type?.includes('image') ? <PictureOutlined className="text-green-600 text-lg" /> : <FileTextOutlined className="text-green-600 text-lg" />}
                          <Text className="text-xs block truncate mt-1">{doc.info?.name}</Text>
                          <Text className="text-xs text-gray-500">{formatFileSize(doc.info?.size)}</Text>
                          <Upload beforeUpload={f => beforeUpload(f, doc.key)} showUploadList={false} accept=".pdf,image/*">
                            <Button size="small" type="link">Change</Button>
                          </Upload>
                        </div>
                      ) : (
                        <Upload beforeUpload={f => beforeUpload(f, doc.key)} showUploadList={false} accept=".pdf,image/*">
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                            <FileOutlined className="text-2xl text-gray-400 mb-2" />
                            <div className="text-sm text-gray-600">Upload</div>
                            <div className="text-xs text-gray-500">PDF or Image</div>
                          </div>
                        </Upload>
                      )}
                    </div>
                  </Col>
                ))}
              </Row>
              <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-gray-600">Signature</div>
                {signaturePreview ? (
                  <div className="border border-green-200 bg-green-50 rounded p-4 flex items-center gap-4">
                    <img src={signaturePreview} alt="Signature" className="w-48 h-24 object-contain border rounded bg-white p-2" />
                    <div>
                      <Text className="text-xs block mb-1">{signatureFileInfo?.name || 'Signature uploaded'}</Text>
                      <Text className="text-xs text-gray-500 block mb-3">{formatFileSize(signatureFileInfo?.size)}</Text>
                      <Upload beforeUpload={f => beforeUpload(f, 'signature')} showUploadList={false} accept="image/*">
                        <Button icon={<UploadOutlined />}>Change Signature</Button>
                      </Upload>
                    </div>
                  </div>
                ) : (
                  <Upload beforeUpload={f => beforeUpload(f, 'signature')} showUploadList={false} accept="image/*">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50 text-center">
                      <SignatureOutlined className="text-3xl text-gray-400 mb-2" />
                      <div className="text-sm text-gray-600">Upload Signature</div>
                      <div className="text-xs text-gray-500">Max 5MB (JPG, PNG)</div>
                    </div>
                  </Upload>
                )}
              </div>
            </Card>

            {/* Email + Status */}
            <Row gutter={16} className="mb-4">
              <Col span={12}>
                <Card className="bg-blue-50 border-blue-200">
                  <Form.Item name="sendEmail" valuePropName="checked" className="mb-0">
                    <Checkbox><div className="flex items-center gap-3"><MailOutlined className="text-blue-600" /><div><Text className="font-medium">Send welcome email</Text><div className="text-xs text-gray-600">Agent will receive login details</div></div></div></Checkbox>
                  </Form.Item>
                </Card>
              </Col>
              <Col span={12}>
                <Card className="border-gray-200">
                  <Form.Item name="status" label="Agent Status">
                    <Select size="large"><Option value="active">Active</Option><Option value="inactive">Inactive</Option></Select>
                  </Form.Item>
                </Card>
              </Col>
            </Row>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button onClick={resetForm} disabled={loading} size="large">Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} size="large" className="bg-blue-600">
                {editingAgent ? 'Update Agent' : 'Create Agent'}
              </Button>
            </div>
          </Form>
        </Drawer>

        {/* View Drawer */}
        <Drawer
          title={<div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-lg"><EyeOutlined className="text-blue-600 text-xl" /></div><div><div className="font-semibold text-lg">Agent Details</div><div className="text-xs text-gray-500">Complete agent information</div></div></div>}
          open={viewModalVisible} onClose={() => setViewModalVisible(false)} width={700} footer={null}
        >
          {selectedAgent && (
            <div className="space-y-6">
              <Card className="bg-gradient-to-r from-blue-50 to-gray-50 border-blue-200">
                <div className="flex items-center gap-4">
                  {selectedAgent.photoUrl ? <Avatar size={90} src={selectedAgent.photoUrl} className="border-4 border-white shadow" /> : <Avatar size={90} icon={<UserOutlined />} className="border-4 border-white shadow bg-blue-100 text-blue-600" />}
                  <div className="flex-1">
                    <Title level={4} className="mb-1">{selectedAgent.name}</Title>
                    <Text type="secondary">Father: {selectedAgent.fatherName}</Text>
                    <div className="mt-3 flex gap-2">
                      <Badge status={selectedAgent.status === 'active' ? 'success' : 'error'} text={selectedAgent.status === 'active' ? 'Active' : 'Inactive'} />
                      <Tag color="blue">Caste: {selectedAgent.caste || 'N/A'}</Tag>
                    </div>
                  </div>
                </div>
              </Card>

              <Descriptions title="Contact" bordered column={1} size="small">
                <Descriptions.Item label="Primary Phone"><PhoneOutlined className="mr-2 text-blue-500" />{selectedAgent.phone1}</Descriptions.Item>
                <Descriptions.Item label="Secondary Phone"><PhoneOutlined className="mr-2 text-gray-400" />{selectedAgent.phone2 || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Email"><MailOutlined className="mr-2 text-red-500" />{selectedAgent.email}</Descriptions.Item>
              </Descriptions>

              <Descriptions title="Address" bordered column={1} size="small">
                <Descriptions.Item label="State">{selectedAgent.state || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="District">{selectedAgent.district || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="City">{selectedAgent.city || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Village">{selectedAgent.village || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Pincode">{selectedAgent.pincode || 'N/A'}</Descriptions.Item>
              </Descriptions>

              <Descriptions title="Identification" bordered column={1} size="small">
                <Descriptions.Item label="Aadhaar"><IdcardOutlined className="mr-2 text-purple-500" />{selectedAgent.aadharNo || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Created On">{formatDate(selectedAgent.created_at)}</Descriptions.Item>
                {selectedAgent.updated_at && <Descriptions.Item label="Last Updated">{formatDate(selectedAgent.updated_at)}</Descriptions.Item>}
              </Descriptions>

              {selectedAgent.signatureUrl && (
                <Card title="Signature" className="border-gray-200">
                  <img src={selectedAgent.signatureUrl} alt="Signature" className="w-64 h-32 object-contain border rounded bg-gray-50 mx-auto" />
                </Card>
              )}

              {(selectedAgent.document1Url || selectedAgent.document2Url || selectedAgent.document3Url) && (
                <Card title="Documents" className="border-gray-200">
                  <div className="grid grid-cols-3 gap-3">
                    {[selectedAgent.document1Url, selectedAgent.document2Url, selectedAgent.document3Url].filter(Boolean).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="text-center p-3 border rounded hover:border-blue-500 hover:bg-blue-50 transition-colors">
                        <FileOutlined className="text-2xl mb-2 block text-blue-600" />
                        <div className="text-sm font-medium">Document {i + 1}</div>
                      </a>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </Drawer>
      </div>

      <style jsx global>{`
        .custom-table .ant-table-thead > tr > th { background: #f8fafc !important; font-weight: 600; }
        .ant-tag-success { background: #d1fae5 !important; color: #065f46 !important; border: none; }
        .ant-tag-error   { background: #fee2e2 !important; color: #991b1b !important; border: none; }
      `}</style>
    </div>
  );
};

export default AgentsManagementPage;