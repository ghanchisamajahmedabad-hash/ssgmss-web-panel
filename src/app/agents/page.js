"use client";
import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  Select, 
  Card, 
  Row, 
  Col, 
  Upload, 
  Checkbox, 
  Tag, 
  Space, 
  Popconfirm, 
  Switch,
  Typography,
  Avatar,
  Divider,
  Tooltip,
  Badge,
  Drawer,
  Spin,
  Descriptions,
  notification,
  App
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  EyeOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  SaveOutlined,
  UploadOutlined,
  SignatureOutlined,
  FileOutlined,
  LockOutlined,
  ReloadOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PictureOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { agentApi } from '@/utils/api';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firbase-client';

const { Title, Text } = Typography;
const { Option } = Select;
const { Password } = Input;

const AgentsManagementPage = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100']
  });
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
  });
  const { message } = App.useApp();
  
  // File states with proper structure
  const [photoFile, setPhotoFile] = useState(null);
  const [photoFileInfo, setPhotoFileInfo] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  
  const [document1File, setDocument1File] = useState(null);
  const [document1FileInfo, setDocument1FileInfo] = useState(null);
  
  const [document2File, setDocument2File] = useState(null);
  const [document2FileInfo, setDocument2FileInfo] = useState(null);
  
  const [document3File, setDocument3File] = useState(null);
  const [document3FileInfo, setDocument3FileInfo] = useState(null);
  
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureFileInfo, setSignatureFileInfo] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  
  // Master data states
  const [castes, setCastes] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);

  // Firebase collections
  const castesCollectionRef = collection(db, 'castes');
  const statesCollectionRef = collection(db, 'states');
  const districtsCollectionRef = collection(db, 'districts');
  const citiesCollectionRef = collection(db, 'cities');

  // Load agents data
  const fetchAgents = async (page = 1, customFilters = {}) => {
    try {
      setLoading(true);
      const currentFilters = { ...filters, ...customFilters };
      
      const result = await agentApi.getAgents(page, {
        status: currentFilters.status,
        search: currentFilters.search,
        limit: pagination.pageSize
      });
      
      if (result.success) {
        setAgents(result.data || []);
        setPagination(prev => ({
          ...prev,
          current: page,
          total: result.pagination?.total || result.data?.length || 0,
          totalPages: result.pagination?.totalPages || Math.ceil((result.data?.length || 0) / pagination.pageSize)
        }));
      } else {
        message.error(result.message || 'Failed to fetch agents');
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      notification.error({
        message: 'Error',
        description: error.message || 'Failed to fetch agents',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load initial data
  useEffect(() => {
    fetchAgents(1);
    loadMasterData();
  }, []);

  // Load master data
  const loadMasterData = async () => {
    try {
      // Load castes (active only)
      const castesSnapshot = await getDocs(castesCollectionRef);
      const castesData = castesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(caste => caste.status === 'active');
      setCastes(castesData);

      // Load states (active only)
      const statesSnapshot = await getDocs(statesCollectionRef);
      const statesData = statesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(state => state.status === 'active');
      setStates(statesData);

      // Load districts (active only)
      const districtsSnapshot = await getDocs(districtsCollectionRef);
      const districtsData = districtsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(district => district.status === 'active');
      setDistricts(districtsData);

      // Load cities (active only)
      const citiesSnapshot = await getDocs(citiesCollectionRef);
      const citiesData = citiesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(city => city.status === 'active');
      setCities(citiesData);

    } catch (error) {
      console.error('Error loading master data:', error);
      message.error('Failed to load master data');
    }
  };

  // Handle table pagination
  const handleTableChange = (paginationConfig, filtersConfig, sorter) => {
    setPagination(paginationConfig);
    fetchAgents(paginationConfig.current);
  };

  // Handle search
  const handleSearch = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
    fetchAgents(1, { search: value });
  };

  // Handle status filter
  const handleStatusFilter = (status) => {
    setFilters(prev => ({ ...prev, status }));
    fetchAgents(1, { status });
  };

  // Refresh data
  const handleRefresh = async () => {
    await fetchAgents(pagination.current);
    message.success('Data refreshed successfully');
  };

  // Convert file to base64 for API
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Extract base64 data from Data URL
        const base64String = reader.result.split(',')[1];
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64String
        });
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle form submission
  const handleSubmit = async (values) => {
    try {
      setLoading(true);

      // Prepare files for upload
      const files = {};
      if (photoFile) {
        files.photoFile = await fileToBase64(photoFile);
      }
      if (signatureFile) {
        files.signatureFile = await fileToBase64(signatureFile);
      }
      if (document1File) {
        files.document1File = await fileToBase64(document1File);
      }
      if (document2File) {
        files.document2File = await fileToBase64(document2File);
      }
      if (document3File) {
        files.document3File = await fileToBase64(document3File);
      }

      // Prepare agent data
      const agentData = {
        ...values,
        ...files,
        sendEmail: values.sendEmail ? true : false,
        status: values.status || 'active'
      };

      // Handle password for create/update
      if (!editingAgent) {
        // For new agent, password is required
        if (values.password && values.password === values.confirmPassword) {
          agentData.password = values.password;
        } else if (values.password && values.password !== values.confirmPassword) {
          message.error('Passwords do not match');
          setLoading(false);
          return;
        } else if (!values.password) {
          message.error('Password is required for new agents');
          setLoading(false);
          return;
        }
      } else {
        // For update, only include password if provided
        if (values.password) {
          if (values.password !== values.confirmPassword) {
            message.error('Passwords do not match');
            setLoading(false);
            return;
          }
          agentData.updatePassword = values.password;
        }
      }

      let result;
      if (editingAgent) {
        // Update existing agent
        result = await agentApi.updateAgent(editingAgent.id, agentData);
      } else {
        // Create new agent
        result = await agentApi.createAgent(agentData);
      }

      if (result.success) {
        message.success(result.message || `Agent ${editingAgent ? 'updated' : 'created'} successfully!`);
        
        // Show temp password if generated
        if (result.data?.tempPassword) {
          Modal.info({
            title: 'Agent Created Successfully',
            content: (
              <div>
                <p>Temporary password for <strong>{result.data.email}</strong>:</p>
                <p className="bg-gray-100 p-2 rounded font-mono text-lg">
                  {result.data.tempPassword}
                </p>
                <p className="text-red-600 mt-2">
                  Please save this password. It won't be shown again.
                </p>
              </div>
            ),
            okText: 'Got it',
            width: 500
          });
        }
        
        resetForm();
        fetchAgents(pagination.current);
      } else {
        message.error(result.error || result.message || `Failed to ${editingAgent ? 'update' : 'create'} agent`);
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      notification.error({
        message: 'Error',
        description: error.message || 'Failed to save agent',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (agent) => {
    setEditingAgent(agent);
    form.setFieldsValue({
      ...agent,
      sendEmail: false,
      password: '',
      confirmPassword: ''
    });
    setPhotoPreview(agent.photoUrl || null);
    setSignaturePreview(agent.signatureUrl || null);
    setModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (id, hardDelete = false) => {
    try {
      setLoading(true);
      const result = await agentApi.deleteAgent(id, hardDelete);
      
      if (result.success) {
        message.success('Agent deleted successfully!');
        fetchAgents(pagination.current);
      } else {
        message.error(result.message || 'Failed to delete agent');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      notification.error({
        message: 'Error',
        description: error.message || 'Failed to delete agent',
      });
    } finally {
      setLoading(false);
    }
  };

  // Toggle status
  const toggleStatus = async (id, currentStatus) => {
    try {
      const result = await agentApi.toggleStatus(id, currentStatus);
      
      if (result.success) {
        message.success(`Agent ${currentStatus === 'active' ? 'deactivated' : 'activated'} successfully`);
        fetchAgents(pagination.current);
      } else {
        message.error(result.message || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      notification.error({
        message: 'Error',
        description: error.message || 'Failed to update status',
      });
    }
  };

  // View agent details
  const viewAgentDetails = (agent) => {
    setSelectedAgent(agent);
    setViewModalVisible(true);
  };

  // Reset form
  const resetForm = () => {
    form.resetFields();
    setEditingAgent(null);
    setModalVisible(false);
    
    // Reset all file states
    setPhotoFile(null);
    setPhotoFileInfo(null);
    setPhotoPreview(null);
    
    setDocument1File(null);
    setDocument1FileInfo(null);
    
    setDocument2File(null);
    setDocument2FileInfo(null);
    
    setDocument3File(null);
    setDocument3FileInfo(null);
    
    setSignatureFile(null);
    setSignatureFileInfo(null);
    setSignaturePreview(null);
  };

  // Handle file change
  const handleFileChange = (file, fileType) => {
    if (!file) return null;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      if (fileType === 'photo') {
        setPhotoPreview(e.target.result);
        setPhotoFile(file);
        setPhotoFileInfo({
          name: file.name,
          size: file.size,
          type: file.type
        });
      } else if (fileType === 'signature') {
        setSignaturePreview(e.target.result);
        setSignatureFile(file);
        setSignatureFileInfo({
          name: file.name,
          size: file.size,
          type: file.type
        });
      } else if (fileType === 'document1') {
        setDocument1File(file);
        setDocument1FileInfo({
          name: file.name,
          size: file.size,
          type: file.type
        });
      } else if (fileType === 'document2') {
        setDocument2File(file);
        setDocument2FileInfo({
          name: file.name,
          size: file.size,
          type: file.type
        });
      } else if (fileType === 'document3') {
        setDocument3File(file);
        setDocument3FileInfo({
          name: file.name,
          size: file.size,
          type: file.type
        });
      }
    };
    reader.readAsDataURL(file);
    return true;
  };

  // Before upload validation
  const beforeUpload = (file, fileType) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    
    if (!isImage && !isPdf) {
      message.error('You can only upload image or PDF files!');
      return false;
    }
    
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('File must be smaller than 5MB!');
      return false;
    }
    
    return handleFileChange(file, fileType);
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

const formatDate = (ts) => {
  if (!ts) return "N/A";

  // Case 1: Firestore Timestamp instance
  if (typeof ts.toDate === "function") {
    return dayjs(ts.toDate()).format("DD/MM/YYYY HH:mm");
  }

  // Case 2: Serialized timestamp (_seconds/_nanoseconds)
  if (ts._seconds) {
    const date = new Date(
      ts._seconds * 1000 + ts._nanoseconds / 1e6
    );
    return dayjs(date).format("DD/MM/YYYY HH:mm");
  }

  // Case 3: seconds/nanoseconds without underscore
  if (ts.seconds) {
    const date = new Date(
      ts.seconds * 1000 + ts.nanoseconds / 1e6
    );
    return dayjs(date).format("DD/MM/YYYY HH:mm");
  }

  // Case 4: already a string or Date
  return dayjs(ts).isValid()
    ? dayjs(ts).format("DD/MM/YYYY HH:mm")
    : "Invalid Date";
};

  // Table columns
  const columns = [
    {
      title: 'AGENT INFORMATION',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      fixed: 'left',
      render: (text, record) => (
        <div className="flex items-center gap-3">
          {record.photoUrl ? (
            <Avatar size={45} src={record.photoUrl} className="border border-gray-300" />
          ) : (
            <Avatar size={45} icon={<UserOutlined />} className="bg-blue-100 text-blue-600 border border-blue-300" />
          )}
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">Father: {record.fatherName || 'N/A'}</div>
            <div className="text-xs text-gray-500">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'CONTACT',
      key: 'contact',
      width: 180,
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PhoneOutlined className="text-blue-600 text-xs" />
            <span className="text-sm text-gray-800 font-medium">{record.phone1}</span>
          </div>
          {record.phone2 && (
            <div className="flex items-center gap-2 mb-1">
              <PhoneOutlined className="text-gray-400 text-xs" />
              <span className="text-xs text-gray-600">{record.phone2}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <MailOutlined className="text-gray-400 text-xs" />
            <span className="text-xs text-gray-600 truncate">{record.email}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'LOCATION',
      key: 'address',
      width: 200,
      render: (_, record) => (
        <div className="text-sm">
          <div className="flex items-start gap-1">
            <EnvironmentOutlined className="text-green-600 mt-0.5 text-xs" />
            <div>
              <div className="text-gray-700">{record.city || 'N/A'}, {record.district || 'N/A'}</div>
              <div className="text-xs text-gray-500">{record.state || 'N/A'}</div>
              <div className="text-xs text-gray-500">PIN: {record.pincode || 'N/A'}</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'IDENTIFICATION',
      dataIndex: 'aadharNo',
      key: 'aadharNo',
      width: 150,
      render: (text) => (
        <div className="flex items-center gap-2">
          <IdcardOutlined className="text-purple-600" />
          <span className="font-mono text-sm text-gray-800">{text || 'N/A'}</span>
        </div>
      ),
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => (
        <div className="flex items-center gap-2">
          {status === 'active' ? (
            <CheckCircleOutlined className="text-green-600" />
          ) : (
            <CloseCircleOutlined className="text-red-600" />
          )}
          <Tag 
            color={status === 'active' ? 'success' : 'error'} 
            className="px-2 py-0.5 text-xs"
          >
            {status === 'active' ? 'Active' : 'Inactive'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'CREATED ON',
      key: 'created_at',
      width: 150,
      render: (_, record) => (
        <div className="text-xs text-gray-500">
          {formatDate(record.created_at)}
        </div>
      ),
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined className="text-blue-600" />}
              onClick={() => viewAgentDetails(record)}
              className="hover:bg-blue-50 rounded-full"
              size="small"
            />
          </Tooltip>
          
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined className="text-amber-600" />}
              onClick={() => handleEdit(record)}
              className="hover:bg-amber-50 rounded-full"
              size="small"
            />
          </Tooltip>
          
          <Tooltip title={record.status === 'active' ? 'Deactivate' : 'Activate'}>
            <Switch
              checked={record.status === 'active'}
              onChange={() => toggleStatus(record.id, record.status)}
              size="small"
              className="bg-gray-300"
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </Tooltip>
          
          <Popconfirm
            title="Delete Agent"
            description="Are you sure you want to delete this agent? This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                className="hover:bg-red-50 rounded-full"
                size="small"
              />
            </Tooltip>
          </Popconfirm>
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
            <div>
              <Title level={3} className="text-gray-800 mb-2 flex items-center gap-3">
                <div className="bg-blue-600 text-white p-2 rounded-lg">
                  <UserOutlined className="text-xl" />
                </div>
                <div>
                  Agent Management
                  <Text className="text-gray-600 text-sm block font-normal mt-1">
                    Manage and monitor all agent accounts in the system
                  </Text>
                </div>
              </Title>
            </div>
            
            <Space size="middle">
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                size="middle"
                className="border-gray-300 hover:border-blue-500"
                loading={loading}
              >
                Refresh
              </Button>
              
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="middle"
                onClick={() => setModalVisible(true)}
                className="bg-blue-600 hover:bg-blue-700 border-0 shadow-md"
              >
                Add New Agent
              </Button>
            </Space>
          </div>
          
     
          
          {/* Search and Filter Bar */}
          <div className="mt-6 flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Search agents by name, email, phone, aadhar, city..."
              prefix={<SearchOutlined />}
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              onPressEnter={() => handleSearch(filters.search)}
              allowClear
              className="md:w-96"
              size="large"
            />
            
            <Space>
              <Select
                placeholder="Filter by status"
                value={filters.status}
                onChange={handleStatusFilter}
                style={{ width: 150 }}
                size="large"
              >
                <Option value="all">All Status</Option>
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
              </Select>
              
              <Button
                icon={<FilterOutlined />}
                onClick={() => handleSearch(filters.search)}
                size="large"
              >
                Apply Filters
              </Button>
            </Space>
          </div>
        </Card>

        {/* Agents Table */}
        <Card className="shadow-sm rounded-lg border-0 ">
          <div className="mb-4 flex justify-between items-center">
            <Title level={5} className="text-gray-700">
              All Agents ({pagination.total})
            </Title>
            {/* <Button
              icon={<DownloadOutlined />}
              className="border-gray-300"
              onClick={() => message.info('Export feature coming soon')}
            >
              Export
            </Button> */}
          </div>
          <Table
            columns={columns}
            dataSource={agents}
            rowKey="id"
            loading={loading}
            pagination={pagination}
            onChange={handleTableChange}
            scroll={{ x: 1500 }}
            className="custom-table"
            rowClassName="hover:bg-blue-50 transition-colors duration-200"
          />
        </Card>

        {/* Add/Edit Agent Modal */}
        <Drawer
          title={
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                {editingAgent ? (
                  <EditOutlined className="text-blue-600 text-xl" />
                ) : (
                  <PlusOutlined className="text-blue-600 text-xl" />
                )}
              </div>
              <div>
                <div className="font-semibold text-lg">
                  {editingAgent ? 'Edit Agent' : 'Add New Agent'}
                </div>
                <div className="text-xs text-gray-500">
                  {editingAgent ? 'Update agent information' : 'Create a new agent account'}
                </div>
              </div>
            </div>
          }
          open={modalVisible}
          onClose={resetForm}
          width={800}
          footer={null}
          className="rounded-lg"
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            className="space-y-4"
            initialValues={{ status: 'active' }}
          >
            {/* Photo and Basic Info */}
            <Card className="bg-gray-50 border-gray-200">
              <Row gutter={16} align="middle">
                <Col span={6}>
                  <div className="text-center">
                    <div className="mb-2 text-sm font-medium text-gray-600">Agent Photo</div>
                    {photoPreview ? (
                      <div className="relative">
                        <Avatar size={100} src={photoPreview} className="mb-2 border-4 border-white shadow mx-auto" />
                        <div className="text-center">
                          <Text className="text-xs text-gray-500 block mb-1">
                            {photoFileInfo?.name || 'Photo uploaded'}
                          </Text>
                          <Upload
                            beforeUpload={(file) => beforeUpload(file, 'photo')}
                            showUploadList={false}
                            accept="image/*"
                          >
                            <Button size="small" icon={<UploadOutlined />} className="mt-1">
                              Change Photo
                            </Button>
                          </Upload>
                        </div>
                      </div>
                    ) : (
                      <Upload
                        beforeUpload={(file) => beforeUpload(file, 'photo')}
                        showUploadList={false}
                        accept="image/*"
                      >
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
                          <UserOutlined className="text-3xl text-gray-400 mb-2" />
                          <div className="text-sm text-gray-600">Upload Photo</div>
                          <div className="text-xs text-gray-500">Max 5MB (JPG, PNG)</div>
                        </div>
                      </Upload>
                    )}
                  </div>
                </Col>

                <Col span={18}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="name"
                        label="Full Name"
                        rules={[{ required: true, message: 'Please enter name' }]}
                      >
                        <Input 
                          placeholder="Agent's full name" 
                          size="large"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="fatherName"
                        label="Father's Name"
                        rules={[{ required: true, message: 'Please enter father name' }]}
                      >
                        <Input 
                          placeholder="Father's name" 
                          size="large"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="caste"
                        label="Caste"
                        rules={[{ required: true, message: 'Please select caste' }]}
                      >
                        <Select placeholder="Select caste" size="large" showSearch>
                          {castes.map(caste => (
                            <Option key={caste.id} value={caste.name}>
                              {caste.name} ({caste.hindiName})
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="aadharNo"
                        label="Aadhar Number"
                        rules={[
                          { required: true, message: 'Please enter Aadhar number' },
                          { pattern: /^\d{12}$/, message: 'Invalid Aadhar number' }
                        ]}
                      >
                        <Input 
                          placeholder="12-digit Aadhar number" 
                          maxLength={12}
                          size="large"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Col>
              </Row>
            </Card>

            {/* Contact Information */}
            <Card title="Contact Information" className="border-gray-200">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="phone1"
                    label="Primary Phone"
                    rules={[
                      { required: true, message: 'Please enter phone number' },
                      { pattern: /^\d{10}$/, message: 'Invalid phone number' }
                    ]}
                  >
                    <Input 
                      placeholder="10-digit number" 
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="phone2"
                    label="Secondary Phone"
                    rules={[
                      { pattern: /^\d{10}$/, message: 'Invalid phone number' }
                    ]}
                  >
                    <Input 
                      placeholder="Optional" 
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="email"
                    label="Email Address"
                    rules={[
                      { required: true, message: 'Please enter email' },
                      { type: 'email', message: 'Invalid email' }
                    ]}
                  >
                    <Input 
                      placeholder="Email address" 
                      size="large"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Security */}
            <Card title="Security" className="border-gray-200">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="password"
                    label={editingAgent ? "New Password (Optional)" : "Password"}
                    rules={editingAgent ? [] : [
                      { required: true, message: 'Please enter password' },
                      { min: 8, message: 'Password must be at least 8 characters' }
                    ]}
                    tooltip={editingAgent ? "Leave empty to keep current password" : "Minimum 8 characters"}
                  >
                    <Password 
                      placeholder={editingAgent ? "Enter new password (optional)" : "Enter password"} 
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="confirmPassword"
                    label={editingAgent ? "Confirm New Password" : "Confirm Password"}
                    dependencies={['password']}
                    rules={editingAgent ? [
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || !getFieldValue('password') || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('Passwords do not match'));
                        },
                      }),
                    ] : [
                      { required: true, message: 'Please confirm password' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('Passwords do not match'));
                        },
                      }),
                    ]}
                  >
                    <Password 
                      placeholder={editingAgent ? "Confirm new password" : "Confirm password"} 
                      size="large"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Address Information */}
            <Card title="Address Information" className="border-gray-200">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="state"
                    label="State"
                    rules={[{ required: true, message: 'Please select state' }]}
                  >
                    <Select placeholder="Select state" showSearch size="large">
                      {states.map(state => (
                        <Option key={state.id} value={state.name}>
                          {state.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="district"
                    label="District"
                    rules={[{ required: true, message: 'Please select district' }]}
                  >
                    <Select placeholder="Select district" showSearch size="large">
                      {districts.map(district => (
                        <Option key={district.id} value={district.name}>
                          {district.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="city"
                    label="City"
                    rules={[{ required: true, message: 'Please select city' }]}
                  >
                    <Select placeholder="Select city" showSearch size="large">
                      {cities.map(city => (
                        <Option key={city.id} value={city.name}>
                          {city.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="village"
                    label="Village/Town"
                    rules={[{ required: true, message: 'Please enter village' }]}
                  >
                    <Input placeholder="Village or town name" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="pincode"
                    label="Pincode"
                    rules={[
                      { required: true, message: 'Please enter pincode' },
                      { pattern: /^\d{6}$/, message: 'Invalid pincode' }
                    ]}
                  >
                    <Input placeholder="6-digit pincode" maxLength={6} size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Documents Upload */}
            <Card title="Documents Upload" className="border-gray-200">
              <Row gutter={16}>
                {[
                  { key: 'document1', label: 'Document 1', file: document1File, info: document1FileInfo },
                  { key: 'document2', label: 'Document 2', file: document2File, info: document2FileInfo },
                  { key: 'document3', label: 'Document 3', file: document3File, info: document3FileInfo }
                ].map((doc, index) => (
                  <Col span={8} key={doc.key}>
                    <div className="text-center">
                      <div className="mb-2 text-sm font-medium text-gray-600">{doc.label}</div>
                      {doc.file ? (
                        <div className="border border-green-200 bg-green-50 rounded p-3">
                          <div className="flex items-center justify-center mb-2">
                            {doc.info?.type?.includes('image') ? (
                              <PictureOutlined className="text-green-600 text-lg" />
                            ) : (
                              <FileTextOutlined className="text-green-600 text-lg" />
                            )}
                          </div>
                          <Text className="text-xs text-gray-700 block truncate mb-1">
                            {doc.info?.name}
                          </Text>
                          <Text className="text-xs text-gray-500 block">
                            {formatFileSize(doc.info?.size || 0)}
                          </Text>
                          <Upload
                            beforeUpload={(file) => beforeUpload(file, doc.key)}
                            showUploadList={false}
                            accept=".pdf,image/*"
                          >
                            <Button size="small" type="link" className="mt-2">
                              Change
                            </Button>
                          </Upload>
                        </div>
                      ) : (
                        <Upload
                          beforeUpload={(file) => beforeUpload(file, doc.key)}
                          showUploadList={false}
                          accept=".pdf,image/*"
                        >
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
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
                  <div className="border border-green-200 bg-green-50 rounded p-4">
                    <div className="flex items-center gap-4">
                      <img
                        src={signaturePreview}
                        alt="Signature"
                        className="w-48 h-24 object-contain border rounded bg-white p-2"
                      />
                      <div className="flex-1">
                        <Text className="text-xs text-gray-700 block mb-1">
                          {signatureFileInfo?.name || 'Signature uploaded'}
                        </Text>
                        <Text className="text-xs text-gray-500 block mb-3">
                          {formatFileSize(signatureFileInfo?.size || 0)}
                        </Text>
                        <Upload
                          beforeUpload={(file) => beforeUpload(file, 'signature')}
                          showUploadList={false}
                          accept="image/*"
                        >
                          <Button icon={<UploadOutlined />}>
                            Change Signature
                          </Button>
                        </Upload>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Upload
                    beforeUpload={(file) => beforeUpload(file, 'signature')}
                    showUploadList={false}
                    accept="image/*"
                  >
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-center">
                      <SignatureOutlined className="text-3xl text-gray-400 mb-2" />
                      <div className="text-sm text-gray-600">Upload Signature</div>
                      <div className="text-xs text-gray-500">Max 5MB (JPG, PNG)</div>
                    </div>
                  </Upload>
                )}
              </div>
            </Card>

            {/* Email Notification and Status */}
            <Row gutter={16}>
              <Col span={12}>
                <Card className="bg-blue-50 border-blue-200">
                  <Form.Item
                    name="sendEmail"
                    valuePropName="checked"
                    className="mb-0"
                  >
                    <Checkbox>
                      <div className="flex items-center gap-3">
                        <MailOutlined className="text-blue-600" />
                        <div>
                          <Text className="font-medium text-gray-800">
                            Send welcome email
                          </Text>
                          <div className="text-xs text-gray-600">
                            Agent will receive login details
                          </div>
                        </div>
                      </div>
                    </Checkbox>
                  </Form.Item>
                </Card>
              </Col>
              <Col span={12}>
                <Card className="border-gray-200">
                  <Form.Item
                    name="status"
                    label="Agent Status"
                  >
                    <Select size="large">
                      <Option value="active">Active</Option>
                      <Option value="inactive">Inactive</Option>
                    </Select>
                  </Form.Item>
                </Card>
              </Col>
            </Row>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button onClick={resetForm} disabled={loading} size="large" className="border-gray-300">
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<SaveOutlined />}
                size="large"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {editingAgent ? 'Update Agent' : 'Create Agent'}
              </Button>
            </div>
          </Form>
        </Drawer>

        {/* View Agent Details Modal */}
        <Drawer
          title={
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <EyeOutlined className="text-blue-600 text-xl" />
              </div>
              <div>
                <div className="font-semibold text-lg">Agent Details</div>
                <div className="text-xs text-gray-500">Complete agent information</div>
              </div>
            </div>
          }
          open={viewModalVisible}
          onClose={() => setViewModalVisible(false)}
          width={700}
          footer={null}
        >
          {selectedAgent && (
            <div className="space-y-6">
              {/* Agent Header */}
              <Card className="bg-gradient-to-r from-blue-50 to-gray-50 border-blue-200">
                <div className="flex items-center gap-4">
                  {selectedAgent.photoUrl ? (
                    <Avatar size={90} src={selectedAgent.photoUrl} className="border-4 border-white shadow" />
                  ) : (
                    <Avatar size={90} icon={<UserOutlined />} className="border-4 border-white shadow bg-blue-100 text-blue-600" />
                  )}
                  <div className="flex-1">
                    <Title level={4} className="mb-1">
                      {selectedAgent.name}
                    </Title>
                    <Text type="secondary" className="text-base">Father: {selectedAgent.fatherName}</Text>
                    <div className="mt-3 flex gap-2">
                      <Badge 
                        status={selectedAgent.status === 'active' ? 'success' : 'error'} 
                        text={selectedAgent.status === 'active' ? 'Active' : 'Inactive'} 
                      />
                      <Tag color="blue">Caste: {selectedAgent.caste || 'N/A'}</Tag>
                    </div>
                  </div>
                </div>
              </Card>

              <Descriptions title="Contact Information" bordered column={1} size="small">
                <Descriptions.Item label="Primary Phone">
                  <div className="flex items-center gap-2">
                    <PhoneOutlined className="text-blue-500" />
                    {selectedAgent.phone1}
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="Secondary Phone">
                  <div className="flex items-center gap-2">
                    <PhoneOutlined className="text-gray-400" />
                    {selectedAgent.phone2 || 'N/A'}
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  <div className="flex items-center gap-2">
                    <MailOutlined className="text-red-500" />
                    {selectedAgent.email}
                  </div>
                </Descriptions.Item>
              </Descriptions>

              <Descriptions title="Address Information" bordered column={1} size="small">
                <Descriptions.Item label="State">{selectedAgent.state || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="District">{selectedAgent.district || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="City">{selectedAgent.city || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Village/Town">{selectedAgent.village || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Pincode">{selectedAgent.pincode || 'N/A'}</Descriptions.Item>
              </Descriptions>

              <Descriptions title="Identification" bordered column={1} size="small">
                <Descriptions.Item label="Aadhar Number">
                  <div className="flex items-center gap-2">
                    <IdcardOutlined className="text-purple-500" />
                    {selectedAgent.aadharNo || 'N/A'}
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="Created On">
                  {formatDate(selectedAgent.created_at)}
                </Descriptions.Item>
                {selectedAgent.updated_at && (
                  <Descriptions.Item label="Last Updated">
                    {formatDate(selectedAgent.updated_at)}
                  </Descriptions.Item>
                )}
              </Descriptions>

              {selectedAgent.signatureUrl && (
                <Card title="Signature" className="border-gray-200">
                  <img
                    src={selectedAgent.signatureUrl}
                    alt="Signature"
                    className="w-64 h-32 object-contain border rounded bg-gray-50 mx-auto"
                  />
                </Card>
              )}

              {(selectedAgent.document1Url || selectedAgent.document2Url || selectedAgent.document3Url) && (
                <Card title="Documents" className="border-gray-200">
                  <div className="grid grid-cols-3 gap-3">
                    {selectedAgent.document1Url && (
                      <a
                        href={selectedAgent.document1Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-center p-3 border rounded hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <FileOutlined className="text-2xl mb-2 block text-blue-600" />
                        <div className="text-sm font-medium">Document 1</div>
                      </a>
                    )}
                    {selectedAgent.document2Url && (
                      <a
                        href={selectedAgent.document2Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-center p-3 border rounded hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <FileOutlined className="text-2xl mb-2 block text-blue-600" />
                        <div className="text-sm font-medium">Document 2</div>
                      </a>
                    )}
                    {selectedAgent.document3Url && (
                      <a
                        href={selectedAgent.document3Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-center p-3 border rounded hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <FileOutlined className="text-2xl mb-2 block text-blue-600" />
                        <div className="text-sm font-medium">Document 3</div>
                      </a>
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}
        </Drawer>
      </div>

      <style jsx global>{`
        .custom-table .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #374151 !important;
          font-weight: 600;
          border-bottom: 2px solid #e5e7eb;
          padding: 12px 16px;
        }
        
        .custom-table .ant-table-tbody > tr:hover > td {
          background: #f0f9ff !important;
        }
        
        .ant-table-cell {
          border-right: 1px solid #f0f0f0;
        }
        
        .ant-table-cell:last-child {
          border-right: none;
        }
        
        .ant-tag-success {
          background: #d1fae5 !important;
          color: #065f46 !important;
          border: none;
        }
        
        .ant-tag-error {
          background: #fee2e2 !important;
          color: #991b1b !important;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default AgentsManagementPage;