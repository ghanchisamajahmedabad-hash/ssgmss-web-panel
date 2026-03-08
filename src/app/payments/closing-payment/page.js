'use client';
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Progress,
  Tooltip,
  Row,
  Col,
  Avatar,
  Badge
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  DownOutlined,
  RightOutlined,
  ArrowRightOutlined,
  HistoryOutlined,
  PhoneOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';

// Import custom components

// Import constants and helpers
import { usePaymentHistory } from '@/utils/hooks/usePaymentHistory';
import { processAgentStats } from '@/utils/agentUtils';
import AgentDetailDrawer from '../join-fees/components/AgentDetailDrawer';
import GroupDetailDrawer from '../join-fees/components/GroupDetailDrawer';
import SummaryCards from '../join-fees/components/SummaryCards';
import PaymentHistoryDrawerAgent from '../join-fees/components/PaymentHistoryDrawerAgent';
import ClosingPaymentHistoryDrawerAgent from './components/PaymentHistoryDrawerAgent';
import { useClosingPaymentHistory } from '@/utils/hooks/useClosingPaymentHistory';
import ClosingGroupDetailDrawer from './components/GroupDetailDrawer';
import ClosingAgentDetailDrawer from './components/AgentDetailDrawer';

const { Title, Text } = Typography;
const colors = {
  primary: '#db2777',
  secondary: '#ea580c',
  accent: '#059669',
  warning: '#f59e0b',
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  background: '#fff8f5',
  surface: '#ffffff',
  border: '#fde2d8',
  foreground: '#3e1f1a',
};
const ClosingPayment = () => {
  const router = useRouter();
  const agentList = useSelector((state) => state.data.agentList || []);
  const programList = useSelector((state) => state.data.programList || []);
  
  const [drawerAgent, setDrawerAgent] = useState(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  
  // Payment History State
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [selectedAgentForHistory, setSelectedAgentForHistory] = useState(null);
  const [selectedProgramFilter, setSelectedProgramFilter] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetailVisible, setGroupDetailVisible] = useState(false);

  // Custom hook for payment history
  const { 
    paymentGroups, 
    paymentTransactions, 
    historyLoading, 
    fetchPaymentGroups 
  } = useClosingPaymentHistory();

  console.log(agentList,'agentList')

  // Process agents with stats
  const agentsWithStats = processAgentStats(agentList, programList);
  const activeAgents = agentsWithStats.filter((a) => a.active_flag && !a.delete_flag);
  console.log(activeAgents,'activeAgents')

  // Summary calculations
  const totalPending = activeAgents.reduce((s, a) => s + (a.closing_pendingAmount || 0), 0);
  const totalCollected = activeAgents.reduce((s, a) => s + (a.closing_paidAmount || 0), 0);
  const totalFees = activeAgents.reduce((s, a) => s + (a.closing_totalAmount || 0), 0);
  const overallProgress = totalFees ? Math.round((totalCollected / totalFees) * 100) : 0;

  const handleGoToPayPage = (agent, program = null) => {
    const programId = program?.programId || 'all';
    const url = `closing-payment/${agent.uid}?programId=${programId}`;
    router.push(url);
  };

  const showPaymentHistory = (agent) => {
    setSelectedAgentForHistory(agent);
    fetchPaymentGroups(agent.uid);
    setHistoryDrawerVisible(true);
  };

  const showGroupDetails = (group) => {
    setSelectedGroup(group);
    setGroupDetailVisible(true);
  };

  const getStatusTag = (pending) => {
    if (pending === 0)
      return (
        <Tag
          icon={<CheckCircleOutlined />}
          color="success"
          style={{ borderRadius: 20, fontWeight: 600 }}
        >
          Fully Paid
        </Tag>
      );
    return (
      <Tag
        icon={<ClockCircleOutlined />}
        color="warning"
        style={{ borderRadius: 20, fontWeight: 600 }}
      >
        ₹{pending.toLocaleString()} Due
      </Tag>
    );
  };

  const expandedRowRender = (record) => {
    console.log(record,'record')
    const programColumns = [
      {
        title: 'Program',
        dataIndex: 'programName',
        key: 'programName',
        render: (text) => <Text strong style={{ color: colors.primary }}>{text}</Text>,
      },
      {
        title: 'Members',
        dataIndex: 'memberCount',
        key: 'memberCount',
        width: 90,
        align: 'center',
        render: (c) => (
          <Badge
            count={c || 0}
            style={{ backgroundColor: colors.info, fontWeight: 700 }}
            showZero
          />
        ),
      },
      {
        title: 'Total (₹)',
        dataIndex: 'totalClosingAmount',
        key: 'totalClosingAmount',
        width: 110,
        align: 'right',
        render: (v) => <Text>₹{v?.toLocaleString() || 0}</Text>,
      },
      {
        title: 'Paid (₹)',
        dataIndex: 'totalClosingPaidAmount',
        key: 'totalClosingPaidAmount',
        width: 110,
        align: 'right',
        render: (v) => <Text style={{ color: colors.success, fontWeight: 600 }}>₹{v?.toLocaleString() || 0}</Text>,
      },
      {
        title: 'Pending (₹)',
        dataIndex: 'totalClosingPendingAmount',
        key: 'totalClosingPendingAmount',
        width: 110,
        align: 'right',
        render: (v) => (
          <Text style={{ color: v > 0 ? colors.error : colors.success, fontWeight: 600 }}>
            ₹{v?.toLocaleString() || 0}
          </Text>
        ),
      },
     
      {
        title: 'Action',
        key: 'action',
        width: 130,
        align: 'center',
        render: (_, prog) =>
          prog.totalClosingPendingAmount > 0 ? (
            <Button
              type="primary"
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={() => handleGoToPayPage(record, prog)}
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                border: 'none',
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              Pay Now
            </Button>
          ) : (
            <Tag color="success" style={{ borderRadius: 20 }}>Completed</Tag>
          ),
      },
    ];

    return (
      <div style={{ padding: '8px 16px', background: '#fdf2f8', borderRadius: 8 }}>
        <Table
          columns={programColumns}
          dataSource={record.programs}
          rowKey="programId"
          pagination={false}
          size="small"
          bordered={false}
        />
      </div>
    );
  };

  const columns = [
    {
      title: 'Agent',
      key: 'agent',
      width: 240,
      fixed: 'left',
      render: (_, record) => (
        <Space>
          <Avatar
            src={record.photoUrl}
            icon={!record.photoUrl && <UserOutlined />}
            size={42}
            style={{
              backgroundColor: colors.primary,
              border: `2px solid ${colors.secondary}`,
              flexShrink: 0,
            }}
          />
          <div>
            <Text strong style={{ color: colors.foreground, display: 'block' }}>
              {record.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <EnvironmentOutlined style={{ marginRight: 3 }} />
              {record.village}, {record.district}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 140,
      render: (_, record) => (
        <div>
          <Text style={{ display: 'block' }}>
            <PhoneOutlined style={{ marginRight: 4 }} />
            {record.phone1}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.email || '—'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Members',
      key: 'members',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Badge
          count={record.memberCount}
          style={{ backgroundColor: colors.info }}
          showZero
        />
      ),
    },
    {
      title: 'Total Fees',
      key: 'totalFees',
      width: 120,
      align: 'right',
      render: (_, r) => (
        <Text strong>₹{r.closing_totalAmount?.toLocaleString() || 0}</Text>
      ),
    },
    {
      title: 'Paid',
      key: 'paid',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Text style={{ color: colors.success, fontWeight: 600 }}>
          ₹{r.closing_paidAmount?.toLocaleString() || 0}
        </Text>
      ),
    },
    {
      title: 'Pending',
      key: 'pending',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Text style={{ color: r.closing_pendingAmount > 0 ? colors.error : colors.success, fontWeight: 600 }}>
          ₹{r.closing_pendingAmount.toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 130,
      render: (_, r) => (
        <Progress
          percent={Math.round((r.closing_paidAmount / (r.closing_totalAmount || 1)) * 100)}
          size="small"
          strokeColor={r.closing_pendingAmount === 0 ? colors.success : colors.primary}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size={6}>
          <Tooltip title="View Payment History">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => showPaymentHistory(record)}
              style={{ borderColor: colors.info, color: colors.info, borderRadius: 6 }}
            />
          </Tooltip>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setDrawerAgent(record)}
              style={{ borderColor: colors.primary, color: colors.primary, borderRadius: 6 }}
            />
          </Tooltip>
          {record.totalJoinFeesPending > 0 && (
            <Tooltip title="Go to Pay Page">
              <Button
                type="primary"
                size="small"
                icon={<ArrowRightOutlined />}
                onClick={() => handleGoToPayPage(record)}
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Pay
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 20, background: colors.background, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Title
          level={3}
          style={{
            margin: 0,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Closing Form Management
        </Title>
        <Text type="secondary">Track and manage agent Closing  payments across programs</Text>
      </div>

      {/* Summary Cards */}
      <SummaryCards 
        activeAgents={activeAgents}
        totalFees={totalFees}
        totalCollected={totalCollected}
        totalPending={totalPending}
        overallProgress={overallProgress}
        colors={colors}
      />

      {/* Main Table */}
      <Card
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          background: colors.surface,
          boxShadow: '0 2px 8px rgba(219,39,119,0.08)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={activeAgents}
          rowKey="uid"
          pagination={{ pageSize: 10, size: 'small', showTotal: (t) => `${t} agents` }}
          size="middle"
          scroll={{ x: 1400, y: 520 }}
          expandable={{
            expandedRowRender,
            expandRowByClick: false,
            expandedRowKeys,
            onExpand: (expanded, record) => {
              setExpandedRowKeys(expanded ? [record.uid] : []);
            },
            expandIcon: ({ expanded, onExpand, record }) =>
              expanded ? (
                <DownOutlined
                  onClick={(e) => onExpand(record, e)}
                  style={{ color: colors.primary, cursor: 'pointer' }}
                />
              ) : (
                <RightOutlined
                  onClick={(e) => onExpand(record, e)}
                  style={{ color: colors.primary, cursor: 'pointer' }}
                />
              ),
          }}
          rowStyle={{ transition: 'background 0.2s' }}
        />
      </Card>

      {/* Payment History Drawer */}
      <ClosingPaymentHistoryDrawerAgent
        visible={historyDrawerVisible}
        onClose={() => {
          setHistoryDrawerVisible(false);
          setSelectedAgentForHistory(null);
          setSelectedProgramFilter('all');
        }}
        selectedAgent={selectedAgentForHistory}
        paymentGroups={paymentGroups}
        paymentTransactions={paymentTransactions}
        loading={historyLoading}
        programList={programList}
        selectedProgramFilter={selectedProgramFilter}
        onProgramFilterChange={setSelectedProgramFilter}
        onGroupClick={showGroupDetails}
        colors={colors}
      />

      {/* Group Detail Drawer */}
      <ClosingGroupDetailDrawer
        visible={groupDetailVisible}
        onClose={() => {
          setGroupDetailVisible(false);
          setSelectedGroup(null);
        }}
        group={selectedGroup}
        programList={programList}
        colors={colors}
      />

      {/* Agent Detail Drawer */}
      <ClosingAgentDetailDrawer
        agent={drawerAgent}
        onClose={() => setDrawerAgent(null)}
        onViewHistory={showPaymentHistory}
        onPayNow={handleGoToPayPage}
        getStatusTag={getStatusTag}
        colors={colors}
      />
    </div>
  );
};

export default ClosingPayment;