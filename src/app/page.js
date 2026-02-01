"use client";
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Typography, 
  Progress, 
  Table, 
  Space, 
  Button,
  Avatar,
  Tag,
  Select,
  DatePicker,
  Spin,
  Badge,
  Divider,
  Tooltip
} from 'antd';
import { 
  UserOutlined, 
  TeamOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  CalendarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  DownloadOutlined,
  FilterOutlined,
  BarChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
  LineChartOutlined,
  AppstoreOutlined,
  BankOutlined,
  IdcardOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

import { agentApi } from '@/utils/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const DashboardHomePage = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeMembers: 0,
    inactiveMembers: 0,
    totalAgents: 0,
    activeAgents: 0,
    inactiveAgents: 0,
    closingMembers: 0,
    totalPrograms: 0,
    activePrograms: 0,
    inactivePrograms: 0
  });
  
  const [programStats, setProgramStats] = useState([]);
  const [recentMembers, setRecentMembers] = useState([]);
  const [topAgents, setTopAgents] = useState([]);
  const [timeRange, setTimeRange] = useState('week');

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      
      // Fetch agents data
      const agentsResult = await agentApi.getAgents(1, { limit: 1000 });
      const agents = agentsResult.data || [];
      
      // Calculate agent stats
      const totalAgents = agents.length;
      const activeAgents = agents.filter(a => a.status === 'active').length;
      const inactiveAgents = agents.filter(a => a.status === 'inactive').length;
      
      // Fetch members data (you'll need to implement member API)
      // For now, using mock data
      const mockMembers = [
        { id: 1, name: 'Ramesh Kumar', status: 'active', program: 'Program A', agent: 'Agent 1', date: '2024-01-15' },
        { id: 2, name: 'Suresh Patel', status: 'active', program: 'Program B', agent: 'Agent 2', date: '2024-01-14' },
        { id: 3, name: 'Priya Sharma', status: 'inactive', program: 'Program C', agent: 'Agent 3', date: '2024-01-13' },
        { id: 4, name: 'Amit Verma', status: 'active', program: 'Program A', agent: 'Agent 1', date: '2024-01-12' },
        { id: 5, name: 'Neha Gupta', status: 'closing', program: 'Program B', agent: 'Agent 2', date: '2024-01-11' },
      ];
      
      // Calculate member stats
      const totalMembers = mockMembers.length;
      const activeMembers = mockMembers.filter(m => m.status === 'active').length;
      const inactiveMembers = mockMembers.filter(m => m.status === 'inactive').length;
      const closingMembers = mockMembers.filter(m => m.status === 'closing').length;
      
      // Program stats
      const programData = [
        { name: 'Program A', active: 45, inactive: 5, total: 50 },
        { name: 'Program B', active: 30, inactive: 10, total: 40 },
        { name: 'Program C', active: 20, inactive: 5, total: 25 },
        { name: 'Program D', active: 15, inactive: 10, total: 25 },
      ];
      
      // Top agents (mock data)
      const topAgentsData = [
        { id: 1, name: 'Agent 1', members: 25, target: 30, performance: 83, status: 'active' },
        { id: 2, name: 'Agent 2', members: 20, target: 25, performance: 80, status: 'active' },
        { id: 3, name: 'Agent 3', members: 15, target: 20, performance: 75, status: 'active' },
        { id: 4, name: 'Agent 4', members: 10, target: 15, performance: 67, status: 'inactive' },
      ];
      
      setStats({
        totalMembers,
        activeMembers,
        inactiveMembers,
        totalAgents,
        activeAgents,
        inactiveAgents,
        closingMembers,
        totalPrograms: programData.length,
        activePrograms: programData.filter(p => p.active > 0).length,
        inactivePrograms: programData.filter(p => p.inactive > 0).length
      });
      
      setProgramStats(programData);
      setRecentMembers(mockMembers.slice(0, 5));
      setTopAgents(topAgentsData);
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle time range change
  const handleTimeRangeChange = (value) => {
    setTimeRange(value);
    // Here you would reload data based on time range
  };

  // Format percentage
  const formatPercentage = (value, total) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  // Main stats cards
  const mainStatsCards = [
    {
      title: 'Total Members',
      value: stats.totalMembers,
      icon: <TeamOutlined className="text-2xl" />,
      color: '#1890ff',
      change: '+12%',
      trend: 'up',
      description: 'Total registered members'
    },
    {
      title: 'Active Members',
      value: stats.activeMembers,
      icon: <CheckCircleOutlined className="text-2xl" />,
      color: '#52c41a',
      change: '+8%',
      trend: 'up',
      description: 'Currently active members'
    },
    {
      title: 'Total Agents',
      value: stats.totalAgents,
      icon: <UserOutlined className="text-2xl" />,
      color: '#722ed1',
      change: '+5%',
      trend: 'up',
      description: 'Registered agents'
    },
    {
      title: 'Closing Members',
      value: stats.closingMembers,
      icon: <DollarOutlined className="text-2xl" />,
      color: '#fa8c16',
      change: '+15%',
      trend: 'up',
      description: 'Members in closing stage'
    }
  ];

  // Program stats columns
  const programColumns = [
    {
      title: 'Program Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <div className="flex items-center gap-2">
          <AppstoreOutlined className="text-blue-500" />
          <span className="font-medium">{text}</span>
        </div>
      ),
    },
    {
      title: 'Active Members',
      dataIndex: 'active',
      key: 'active',
      render: (text) => (
        <div className="flex items-center gap-2">
          <CheckCircleOutlined className="text-green-500" />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Inactive Members',
      dataIndex: 'inactive',
      key: 'inactive',
      render: (text) => (
        <div className="flex items-center gap-2">
          <CloseCircleOutlined className="text-red-500" />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (text) => (
        <div className="font-semibold text-gray-800">{text}</div>
      ),
    },
    {
      title: 'Active Rate',
      key: 'rate',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Progress 
            percent={formatPercentage(record.active, record.total)} 
            size="small" 
            strokeColor="#52c41a"
            showInfo={false}
          />
          <span className="text-sm text-gray-600">
            {formatPercentage(record.active, record.total)}%
          </span>
        </div>
      ),
    },
  ];

  // Recent members columns
  const recentMembersColumns = [
    {
      title: 'Member',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag 
          color={
            status === 'active' ? 'green' : 
            status === 'inactive' ? 'red' : 
            'orange'
          }
          className="capitalize"
        >
          {status}
        </Tag>
      ),
    },
    {
      title: 'Program',
      dataIndex: 'program',
      key: 'program',
    },
    {
      title: 'Agent',
      dataIndex: 'agent',
      key: 'agent',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Action',
      key: 'action',
      render: () => (
        <Button type="link" size="small" icon={<EyeOutlined />}>
          View
        </Button>
      ),
    },
  ];

  // Top agents columns
  const topAgentsColumns = [
    {
      title: 'Agent',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Members',
      dataIndex: 'members',
      key: 'members',
      render: (text) => (
        <div className="font-semibold text-gray-800">{text}</div>
      ),
    },
    {
      title: 'Target',
      dataIndex: 'target',
      key: 'target',
    },
    {
      title: 'Performance',
      key: 'performance',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Progress 
            percent={record.performance} 
            size="small" 
            strokeColor={record.performance >= 80 ? '#52c41a' : record.performance >= 70 ? '#faad14' : '#f5222d'}
          />
          <span className="text-sm text-gray-600">{record.performance}%</span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Badge 
          status={status === 'active' ? 'success' : 'error'} 
          text={status === 'active' ? 'Active' : 'Inactive'}
        />
      ),
    },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <Title level={2} className="text-gray-800 mb-2 flex items-center gap-3">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-2 rounded-lg">
                  <BarChartOutlined className="text-xl" />
                </div>
                Dashboard Overview
              </Title>
              <Text className="text-gray-600 text-base">
                Welcome back! Here's what's happening with your business today.
              </Text>
            </div>
            
            <Space size="middle">
              <Select
                value={timeRange}
                onChange={handleTimeRangeChange}
                style={{ width: 120 }}
                size="large"
              >
                <Option value="today">Today</Option>
                <Option value="week">This Week</Option>
                <Option value="month">This Month</Option>
                <Option value="quarter">This Quarter</Option>
                <Option value="year">This Year</Option>
              </Select>
              
              <RangePicker size="large" />
              
              <Button
                icon={<DownloadOutlined />}
                size="large"
                className="border-gray-300"
              >
                Export
              </Button>
              
              <Button
                type="primary"
                icon={<FilterOutlined />}
                size="large"
                className="bg-blue-600"
              >
                Filters
              </Button>
            </Space>
          </div>
        </div>

        {/* Main Stats Cards */}
        <Row gutter={[16, 16]} className="mb-6">
          {mainStatsCards.map((stat, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Card className="shadow-sm hover:shadow-md transition-all duration-300 h-full">
                <div className="flex items-start justify-between">
                  <div>
                    <Text className="text-gray-500 text-sm">{stat.title}</Text>
                    <div className="flex items-end gap-2 mt-2">
                      <Title level={2} className="mb-0 text-gray-800">
                        {stat.value}
                      </Title>
                      <div className={`flex items-center gap-1 text-sm ${
                        stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stat.trend === 'up' ? (
                          <ArrowUpOutlined />
                        ) : (
                          <ArrowDownOutlined />
                        )}
                        {stat.change}
                      </div>
                    </div>
                    <Text type="secondary" className="text-xs mt-2 block">
                      {stat.description}
                    </Text>
                  </div>
                  <div 
                    className="p-3 rounded-full"
                    style={{ backgroundColor: `${stat.color}20` }}
                  >
                    <div style={{ color: stat.color }}>
                      {stat.icon}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Second Row - Detailed Stats */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} lg={8}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <TeamOutlined className="text-blue-600" />
                  <span>Member Status</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small">
                  View All
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircleOutlined className="text-green-500" />
                    <Text>Active Members</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.activeMembers}</Text>
                    <div className="text-green-600 text-xs flex items-center gap-1">
                      <ArrowUpOutlined />
                      {formatPercentage(stats.activeMembers, stats.totalMembers)}%
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CloseCircleOutlined className="text-red-500" />
                    <Text>Inactive Members</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.inactiveMembers}</Text>
                    <div className="text-red-600 text-xs flex items-center gap-1">
                      <ArrowDownOutlined />
                      {formatPercentage(stats.inactiveMembers, stats.totalMembers)}%
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarOutlined className="text-orange-500" />
                    <Text>Closing Members</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.closingMembers}</Text>
                    <div className="text-orange-600 text-xs flex items-center gap-1">
                      <ArrowUpOutlined />
                      {formatPercentage(stats.closingMembers, stats.totalMembers)}%
                    </div>
                  </div>
                </div>
                
                <Divider className="my-4" />
                
                <div className="text-center">
                  <Progress 
                    type="circle" 
                    percent={formatPercentage(stats.activeMembers, stats.totalMembers)} 
                    strokeColor={{
                      '0%': '#1890ff',
                      '100%': '#52c41a',
                    }}
                    size={120}
                    format={percent => (
                      <div className="text-center">
                        <div className="text-xl font-bold">{percent}%</div>
                        <div className="text-xs text-gray-500">Active Rate</div>
                      </div>
                    )}
                  />
                </div>
              </div>
            </Card>
          </Col>
          
          <Col xs={24} lg={8}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <UserOutlined className="text-purple-600" />
                  <span>Agent Status</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small">
                  View All
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircleOutlined className="text-green-500" />
                    <Text>Active Agents</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.activeAgents}</Text>
                    <div className="text-green-600 text-xs flex items-center gap-1">
                      <ArrowUpOutlined />
                      {formatPercentage(stats.activeAgents, stats.totalAgents)}%
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CloseCircleOutlined className="text-red-500" />
                    <Text>Inactive Agents</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.inactiveAgents}</Text>
                    <div className="text-red-600 text-xs flex items-center gap-1">
                      <ArrowDownOutlined />
                      {formatPercentage(stats.inactiveAgents, stats.totalAgents)}%
                    </div>
                  </div>
                </div>
                
                <Divider className="my-4" />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{stats.totalAgents}</div>
                    <div className="text-xs text-gray-600">Total Agents</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {stats.totalAgents > 0 ? Math.round((stats.activeAgents / stats.totalAgents) * 100) : 0}%
                    </div>
                    <div className="text-xs text-gray-600">Active Ratio</div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Active</span>
                    <span>{stats.activeAgents}/{stats.totalAgents}</span>
                  </div>
                  <Progress 
                    percent={formatPercentage(stats.activeAgents, stats.totalAgents)} 
                    strokeColor="#52c41a"
                  />
                </div>
              </div>
            </Card>
          </Col>
          
          <Col xs={24} lg={8}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <AppstoreOutlined className="text-cyan-600" />
                  <span>Program Overview</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small">
                  View All
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircleOutlined className="text-green-500" />
                    <Text>Active Programs</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.activePrograms}</Text>
                    <div className="text-green-600 text-xs flex items-center gap-1">
                      <ArrowUpOutlined />
                      {formatPercentage(stats.activePrograms, stats.totalPrograms)}%
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CloseCircleOutlined className="text-red-500" />
                    <Text>Inactive Programs</Text>
                  </div>
                  <div className="text-right">
                    <Text strong className="text-lg">{stats.inactivePrograms}</Text>
                    <div className="text-red-600 text-xs flex items-center gap-1">
                      <ArrowDownOutlined />
                      {formatPercentage(stats.inactivePrograms, stats.totalPrograms)}%
                    </div>
                  </div>
                </div>
                
                <Divider className="my-4" />
                
                <div className="space-y-3">
                  {programStats.map((program, index) => (
                    <div key={index} className="p-2 hover:bg-gray-50 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <Text strong>{program.name}</Text>
                        <Text className="text-gray-600">{program.active}/{program.total}</Text>
                      </div>
                      <Progress 
                        percent={formatPercentage(program.active, program.total)} 
                        size="small"
                        strokeColor={formatPercentage(program.active, program.total) > 70 ? '#52c41a' : '#faad14'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Third Row - Tables */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} lg={12}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <CalendarOutlined className="text-blue-600" />
                  <span>Recent Members</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small">
                  View All
                </Button>
              }
            >
              <Table
                columns={recentMembersColumns}
                dataSource={recentMembers}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
              />
            </Card>
          </Col>
          
          <Col xs={24} lg={12}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <RiseOutlined className="text-green-600" />
                  <span>Top Performing Agents</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small">
                  View All
                </Button>
              }
            >
              <Table
                columns={topAgentsColumns}
                dataSource={topAgents}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
              />
            </Card>
          </Col>
        </Row>

        {/* Fourth Row - Charts and Additional Info */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <AreaChartOutlined className="text-purple-600" />
                  <span>Member Growth Trend</span>
                </div>
              }
              className="shadow-sm h-full"
            >
              <div className="h-64 flex items-center justify-center">
                <div className="text-center">
                  <LineChartOutlined className="text-4xl text-gray-300 mb-4" />
                  <Text type="secondary">Chart visualization will appear here</Text>
                  <div className="mt-4">
                    <Button type="primary" icon={<BarChartOutlined />}>
                      Generate Report
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          
          <Col xs={24} lg={8}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <PieChartOutlined className="text-orange-600" />
                  <span>Quick Stats</span>
                </div>
              }
              className="shadow-sm h-full"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.totalMembers}</div>
                    <div className="text-xs text-gray-600">Total Members</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.activeMembers}</div>
                    <div className="text-xs text-gray-600">Active Members</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-purple-600">{stats.totalAgents}</div>
                    <div className="text-xs text-gray-600">Total Agents</div>
                  </div>
                  <div className="bg-cyan-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-cyan-600">{stats.closingMembers}</div>
                    <div className="text-xs text-gray-600">Closing Members</div>
                  </div>
                </div>
                
                <Divider className="my-4" />
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BankOutlined className="text-blue-500" />
                      <Text>Average Members per Agent</Text>
                    </div>
                    <Text strong>12.5</Text>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IdcardOutlined className="text-green-500" />
                      <Text>New Members This Month</Text>
                    </div>
                    <Text strong>45</Text>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PhoneOutlined className="text-purple-500" />
                      <Text>Conversion Rate</Text>
                    </div>
                    <Text strong>68%</Text>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MailOutlined className="text-orange-500" />
                      <Text>Avg. Response Time</Text>
                    </div>
                    <Text strong>2.4h</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Loading State */}
        {loading && (
          <div className="fixed inset-0  flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center">
              <Spin size="large" />
              <div className="mt-4 text-gray-600">Loading dashboard data...</div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .ant-card-head {
          border-bottom: 1px solid #f0f0f0 !important;
        }
        
        .ant-card-head-title {
          font-weight: 600 !important;
        }
        
        .ant-table-thead > tr > th {
          background: #f8fafc !important;
          font-weight: 600;
        }
        
        .ant-table-tbody > tr:hover > td {
          background: #f0f9ff !important;
        }
        
        .ant-progress-circle-path {
          stroke-linecap: round;
        }
        
        .ant-tag-green {
          background: #d9f7be !important;
          color: #389e0d !important;
          border: none;
        }
        
        .ant-tag-red {
          background: #ffccc7 !important;
          color: #cf1322 !important;
          border: none;
        }
        
        .ant-tag-orange {
          background: #ffd8bf !important;
          color: #d46b08 !important;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default DashboardHomePage;