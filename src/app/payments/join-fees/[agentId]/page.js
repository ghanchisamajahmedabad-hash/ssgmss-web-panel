"use client";
import { fetchMembersByAgent } from '@/app/members/components/firebase-helpers';
import { useParams, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Typography,
  InputNumber,
  message,
  Row,
  Col,
  Avatar,
  Select,
  Checkbox,
  Empty,
  Radio,
  Input,
  Badge,
  Spin,
  Tooltip
} from 'antd';
import {
  UserOutlined,
  SearchOutlined,
  TeamOutlined,
  BankOutlined,
  WalletOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  SwapOutlined,
  DollarCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { auth, db } from '../../../../../lib/firbase-client';
import { paymentApi } from '@/utils/api';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import PaymentConfirmationDrawer from '../components/PaymentConfirmationDrawer';
import TransactionDetailDrawer from '../components/TransactionDetailDrawer';
import PaymentHistoryDrawer from '../components/PaymentHistoryDrawer';


const { Title, Text } = Typography;
const { Option } = Select;

// Color mapping based on theme
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

const MemberPaymentPage = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const programList = useSelector((state) => state.data.programList);
  const agentList = useSelector((state) => state.data.agentList || []);
  
  const agentId = params?.agentId;
  const programId = searchParams.get("programId");
  
  // Get current agent details
  const currentAgent = agentList.find(agent => agent.uid === agentId);
  
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedProgram, setSelectedProgram] = useState(programId || 'all');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [globalPaymentAmount, setGlobalPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [transactionId, setTransactionId] = useState('');
  const [memberPayments, setMemberPayments] = useState({});
  const [programOptions, setProgramOptions] = useState([]);
  
  // Payment history state
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState(null);
  const [memberTransactions, setMemberTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionDetailVisible, setTransactionDetailVisible] = useState(false);
  
  // Payment drawer state
  const [isPaymentDrawerVisible, setIsPaymentDrawerVisible] = useState(false);
  const [paymentDate, setPaymentDate] = useState(dayjs());
  const [paymentNote, setPaymentNote] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processingPayments, setProcessingPayments] = useState([]);

  // Get current program details
  const currentProgram = programList?.find(p => p.id === programId);

  useEffect(() => {
    if (agentId) {
      fetchMember();
    }
  }, [agentId]);

  useEffect(() => {
    // Extract unique programs from members
    const programs = new Set();
    members.forEach(member => {
      if (member.programIds && !member.delete_flag) {
        member.programIds.forEach(pid => {
          const program = programList?.find(p => p.id === pid);
          if (program) {
            programs.add(JSON.stringify({ id: pid, name: program.name }));
          }
        });
      }
    });
    setProgramOptions(Array.from(programs).map(p => JSON.parse(p)));
  }, [members, programList]);

  useEffect(() => {
    filterMembers();
  }, [searchText, selectedProgram, members]);

  const fetchMember = async () => {
    setLoading(true);
    try {
      const membersData = await fetchMembersByAgent(agentId);
      
      // Process members with payment calculations and handle deleted ones
      const processedMembers = membersData.map(member => ({
        ...member,
        key: member.id,
        pendingAmount: member.delete_flag ? 0 : (member.pendingAmount || member.joinFees - (member.paidAmount || 0) || 0),
        paidAmount: member.paidAmount || 0,
        totalFees: member.delete_flag ? 0 : (member.joinFees || 0),
        programNames: member.programIds?.map(pid => 
          programList?.find(p => p.id === pid)?.name
        ).filter(Boolean).join(', ') || 'No Program',
        isDeleted: member.delete_flag || false,
        programPaymentSummary: member.programPaymentSummary || {
          totalPrograms: 0,
          fullyPaidPrograms: 0,
          partiallyPaidPrograms: 0,
          pendingPrograms: 0
        }
      }));
      
      // Sort: active members first, then deleted
      const sortedMembers = processedMembers.sort((a, b) => {
        if (a.isDeleted === b.isDeleted) return 0;
        return a.isDeleted ? 1 : -1;
      });
      
      setMembers(sortedMembers);
      setFilteredMembers(sortedMembers);
      
      // Initialize payment amounts for all members
      const initialPayments = {};
      sortedMembers.forEach(m => {
        initialPayments[m.id] = '';
      });
      setMemberPayments(initialPayments);
    } catch (error) {
      console.error(error);
      message.error('Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberPaymentHistory = async (memberId) => {
    setHistoryLoading(true);
    try {
      // Query memberJoinFees collection for this member
      const transactionsQuery = query(
        collection(db, 'memberJoinFees'),
        where('memberId', '==', memberId),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(transactionsQuery);
      const transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
      }));
      
      setMemberTransactions(transactions);
    } catch (error) {
      console.error('Error fetching member history:', error);
      message.error('Failed to load payment history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const filterMembers = () => {
    let filtered = [...members];

    if (selectedProgram !== 'all') {
      filtered = filtered.filter(member => 
        member.programIds?.includes(selectedProgram)
      );
    }

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(member => 
        member.displayName?.toLowerCase().includes(searchLower) ||
        member.phone?.includes(searchText) ||
        member.registrationNumber?.toLowerCase().includes(searchLower) ||
        member.fatherName?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredMembers(filtered);
  };

  const handleMemberSelect = (memberId, checked) => {
    const member = members.find(m => m.id === memberId);
    if (member?.isDeleted) return;
    
    if (checked) {
      setSelectedMembers([...selectedMembers, memberId]);
    } else {
      setSelectedMembers(selectedMembers.filter(id => id !== memberId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const selectableMembers = filteredMembers
        .filter(m => !m.isDeleted && m.pendingAmount > 0)
        .map(m => m.id);
      setSelectedMembers(selectableMembers);
    } else {
      setSelectedMembers([]);
    }
  };

  const handlePaymentAmountChange = (memberId, value) => {
    const member = members.find(m => m.id === memberId);
    if (member?.isDeleted) return;
    
    // Validate amount doesn't exceed pending
    if (value > member.pendingAmount) {
      message.warning(`Amount cannot exceed pending amount (₹${member.pendingAmount.toLocaleString()})`);
      return;
    }
    
    setMemberPayments({
      ...memberPayments,
      [memberId]: value
    });
  };

  const applyGlobalPayment = () => {
    if (!globalPaymentAmount || selectedMembers.length === 0) return;
    
    const amount = parseFloat(globalPaymentAmount) || 0;
    const perMember = amount / selectedMembers.length;
    
    const updatedPayments = { ...memberPayments };
    selectedMembers.forEach(memberId => {
      const member = members.find(m => m.id === memberId);
      if (member && !member.isDeleted) {
        updatedPayments[memberId] = Math.min(perMember, member.pendingAmount);
      }
    });
    
    setMemberPayments(updatedPayments);
  };

  const handleProcessPayments = () => {
    // Validate payments
    const paymentsToProcess = selectedMembers.filter(memberId => {
      const amount = parseFloat(memberPayments[memberId]) || 0;
      const member = members.find(m => m.id === memberId);
      return !member?.isDeleted && amount > 0 && amount <= member.pendingAmount;
    });

    if (paymentsToProcess.length === 0) {
      message.warning('No valid payments to process');
      return;
    }

    if (paymentMethod === 'online' && !transactionId) {
      message.warning('Please enter transaction ID for online payment');
      return;
    }

    // Set processing payments
    const processing = paymentsToProcess.map(id => {
      const member = members.find(m => m.id === id);
      return {
        memberId: id,
        memberName: member.displayName,
        registrationNumber: member.registrationNumber,
        programIds: member.programIds,
        amount: parseFloat(memberPayments[id])
      };
    });
    
    setProcessingPayments(processing);
    setIsPaymentDrawerVisible(true);
  };

  const confirmPayment = async () => {
    try {
      setUploading(true);
      
      const currentUser = auth.currentUser;
      if (!currentUser) {
        message.error('No authenticated user');
        return;
      }

      // Upload file if present
      let fileUrl = null;
      if (uploadedFile) {
        // Implement file upload logic here
        fileUrl = "https://firebasestorage.googleapis.com/v0/b/ssgms-project-dev.firebasestorage.app/o/memberpayments%2FJoinFees%2Fsample.jpeg?alt=media&token=sample-token";
      }

      const res = await paymentApi.JoinFeesAdd({
        memberPayments: processingPayments,
        paymentDate: paymentDate.toISOString(),
        paymentMethod,
        paymentNote,
        transactionId,
        fileUrl,
        totalAmount: processingPayments.reduce((sum, p) => sum + p.amount, 0),
        agentId,
        programId: selectedProgram !== 'all' ? selectedProgram : null
      });

      if (res.success) {
        message.success(`Successfully processed ${processingPayments.length} payments`);
        setIsPaymentDrawerVisible(false);
        
        // Refresh member data
        fetchMember();
        
        // Reset selections
        setSelectedMembers([]);
        setMemberPayments({});
        setGlobalPaymentAmount('');
      }
    } catch (error) {
      console.error('Payment failed:', error);
      message.error('Failed to process payments: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const showMemberHistory = (member) => {
    setSelectedMemberForHistory(member);
    fetchMemberPaymentHistory(member.id);
    setHistoryDrawerVisible(true);
  };

  const showTransactionDetail = (transaction) => {
    setSelectedTransaction(transaction);
    setTransactionDetailVisible(true);
  };

  const getTotalSelectedPayment = () => {
    return selectedMembers.reduce((sum, memberId) => {
      const amount = parseFloat(memberPayments[memberId]) || 0;
      return sum + amount;
    }, 0);
  };

  const columns = [
    {
      title: () => (
        <Checkbox 
          onChange={(e) => handleSelectAll(e.target.checked)}
          checked={selectedMembers.length === filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length && filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length > 0}
          indeterminate={selectedMembers.length > 0 && selectedMembers.length < filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length}
        />
      ),
      key: 'selection',
      width: 40,
      render: (_, record) => (
        <Checkbox 
          checked={selectedMembers.includes(record.id)}
          onChange={(e) => handleMemberSelect(record.id, e.target.checked)}
          disabled={record.isDeleted || record.pendingAmount === 0}
        />
      ),
    },
    {
      title: 'Member Details',
      key: 'member',
      width: 190,
      render: (_, record) => (
        <Space size={8}>
          <Avatar 
            src={record.photoURL} 
            icon={!record.photoURL && <UserOutlined />}
            size="small"
            style={{ 
              backgroundColor: record.isDeleted ? '#d9d9d9' : colors.primary,
              opacity: record.isDeleted ? 0.6 : 1
            }}
          />
          <div>
            <Space>
              <Text strong style={{ 
                fontSize: '13px',
                textDecoration: record.isDeleted ? 'line-through' : 'none',
                color: record.isDeleted ? '#999' : colors.foreground
              }}>
                {record.displayName}
              </Text>
              {record.isDeleted && (
                <Tag color="red" style={{ fontSize: '10px' }}>Deleted</Tag>
              )}
              {record.programPaymentSummary?.fullyPaidPrograms === record.programPaymentSummary?.totalPrograms && 
               record.programPaymentSummary?.totalPrograms > 0 && (
                <Tag color="success" style={{ fontSize: '10px' }}>Fully Paid</Tag>
              )}
            </Space>
            <div>
              <Text type="secondary" style={{ fontSize: '11px' }}>
                {record.registrationNumber} | {record.phone}
              </Text>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Program',
      key: 'program',
      width: 100,
      render: (_, record) => {
        const programCount = record.programIds?.length || 0;
        return (
          <Tooltip title={record.programNames}>
            <Tag color={record.isDeleted ? 'default' : 'geekblue'} style={{ fontSize: '11px' }}>
              {programCount} Program{programCount !== 1 ? 's' : ''}
              {programCount > 0 && ` • ${record.programPaymentSummary?.fullyPaidPrograms || 0} paid`}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Total (₹)',
      dataIndex: 'totalFees',
      width: 90,
      align: 'right',
      render: (fees, record) => (
        <Text style={{ 
          fontSize: '12px',
          textDecoration: record.isDeleted ? 'line-through' : 'none',
          color: record.isDeleted ? '#999' : 'inherit'
        }}>
          ₹{record.isDeleted ? 0 : (fees?.toLocaleString() || 0)}
        </Text>
      ),
    },
    {
      title: 'Paid (₹)',
      dataIndex: 'paidAmount',
      width: 90,
      align: 'right',
      render: (paid, record) => (
        <Text style={{ 
          color: record.isDeleted ? '#999' : colors.success, 
          fontSize: '12px',
          textDecoration: record.isDeleted ? 'line-through' : 'none'
        }}>
          ₹{record.isDeleted ? 0 : (paid?.toLocaleString() || 0)}
        </Text>
      ),
    },
    {
      title: 'Pending (₹)',
      dataIndex: 'pendingAmount',
      width: 90,
      align: 'right',
      render: (pending, record) => {
        if (record.isDeleted) return <Text style={{ color: '#999', fontSize: '12px' }}>₹0</Text>;
        
        const paymentAmount = parseFloat(memberPayments[record.id]) || 0;
        const newPending = pending - paymentAmount;
        return (
          <div>
            <Badge 
              status={pending > 0 ? 'warning' : 'success'} 
              text={
                <Text style={{ fontSize: '12px' }}>
                  ₹{pending?.toLocaleString() || 0}
                </Text>
              }
            />
            {paymentAmount > 0 && (
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: '10px' }}>→</Text>
                <Text style={{ color: colors.warning, fontSize: '11px', marginLeft: 4 }}>
                  ₹{newPending.toLocaleString()}
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      fixed: 'right',
      render: (_, record) => (
        <Tooltip title="View Payment History">
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => showMemberHistory(record)}
            style={{ borderColor: colors.info, color: colors.info }}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Pay Amount (₹)',
      key: 'payAmount',
      width: 100,
      render: (_, record) => {
        if (record.isDeleted) {
          return <Text type="secondary" style={{ fontSize: '11px' }}>Not applicable</Text>;
        }
        
        return (
          <InputNumber
            size="small"
            placeholder="Enter amount"
            value={memberPayments[record.id]}
            onChange={(value) => handlePaymentAmountChange(record.id, value)}
            disabled={record.pendingAmount === 0 || !selectedMembers.includes(record.id)}
            min={0}
            max={record.pendingAmount}
            precision={0}
            style={{ width: 110 }}
            formatter={value => `₹ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={value => value.replace(/₹\s?|(,*)/g, '')}
          />
        );
      },
    },
  ];

  // Summary calculations
  const activeMembers = members.filter(m => !m.isDeleted);
  const totalSelectedPending = members
    .filter(m => selectedMembers.includes(m.id) && !m.isDeleted)
    .reduce((sum, m) => sum + m.pendingAmount, 0);
  
  const totalSelectedMembers = selectedMembers.length;
  const totalPaymentAmount = getTotalSelectedPayment();
  const totalOverallPending = activeMembers.reduce((sum, m) => sum + m.pendingAmount, 0);
  const totalOverallPaid = activeMembers.reduce((sum, m) => sum + (m.paidAmount || 0), 0);

  // Get selected members data for drawer
  const selectedMembersData = members.filter(m => 
    selectedMembers.includes(m.id) && 
    !m.isDeleted && 
    parseFloat(memberPayments[m.id]) > 0
  );

  return (
    <div style={{ padding: '16px', background: colors.background, minHeight: '100vh' }}>
      {/* Agent Header */}
      <Card 
        size="small" 
        style={{ 
          marginBottom: 16, 
          background: `linear-gradient(135deg, ${colors.primary}15 0%, ${colors.secondary}15 100%)`,
          borderColor: colors.border
        }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={16}>
            <Space size={16}>
              <Avatar 
                size={48}
                src={currentAgent?.photoUrl}
                icon={!currentAgent?.photoUrl && <UserOutlined />}
                style={{ 
                  backgroundColor: colors.primary,
                  border: `2px solid ${colors.secondary}`
                }}
              />
              <div>
                <Title level={4} style={{ margin: 0, color: colors.foreground }}>
                  {currentAgent?.name || 'Agent'}
                </Title>
                <Space wrap size={4} style={{ marginTop: 4 }}>
                  <Tag icon={<BankOutlined />} color="purple">{currentAgent?.caste || 'N/A'}</Tag>
                  <Tag icon={<TeamOutlined />} color="geekblue">Members: {activeMembers.length}</Tag>
                  <Tag icon={<WalletOutlined />} color="green">Collected: ₹{totalOverallPaid.toLocaleString()}</Tag>
                  <Tag icon={<ClockCircleOutlined />} color="orange">Pending: ₹{totalOverallPending.toLocaleString()}</Tag>
                </Space>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <div>
              <Text type="secondary">Phone: {currentAgent?.phone1}</Text>
              <br />
              <Text type="secondary">Location: {currentAgent?.village}, {currentAgent?.city}</Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Filters */}
      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8}>
          <Input
            size="middle"
            placeholder="Search by name, phone, reg no..."
            prefix={<SearchOutlined style={{ color: colors.primary }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={6}>
          <Select
            size="middle"
            style={{ width: '100%' }}
            placeholder="Filter by program"
            value={selectedProgram}
            onChange={setSelectedProgram}
            allowClear
          >
            <Option value="all">All Programs</Option>
            {programOptions.map(program => (
              <Option key={program.id} value={program.id}>{program.name}</Option>
            ))}
          </Select>
        </Col>
      </Row>

      {/* Global Payment Bar */}
      <Card 
        size="small" 
        style={{ 
          marginBottom: 16, 
          background: colors.surface, 
          borderColor: colors.border,
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={5}>
            <Space size={8}>
              <Checkbox 
                onChange={(e) => handleSelectAll(e.target.checked)}
                checked={selectedMembers.length === filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length && filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length > 0}
                indeterminate={selectedMembers.length > 0 && selectedMembers.length < filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length}
              >
                <Text strong>Select All</Text>
              </Checkbox>
              <Badge count={selectedMembers.length} style={{ backgroundColor: colors.primary }} />
            </Space>
          </Col>
          <Col xs={24} md={4}>
            <InputNumber
              size="middle"
              placeholder="Global amount"
              value={globalPaymentAmount}
              onChange={setGlobalPaymentAmount}
              style={{ width: '100%' }}
              formatter={value => `₹ ${value}`}
              parser={value => value.replace(/[^\d]/g, '')}
              precision={0}
            />
          </Col>
          <Col xs={24} md={3}>
            <Button 
              size="middle"
              icon={<SwapOutlined />}
              onClick={applyGlobalPayment}
              disabled={!globalPaymentAmount || selectedMembers.length === 0}
              style={{ width: '100%' }}
            >
              Apply
            </Button>
          </Col>
          <Col xs={24} md={4}>
            <Radio.Group 
              size="middle"
              value={paymentMethod} 
              onChange={(e) => setPaymentMethod(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="cash">💵 Cash</Radio.Button>
              <Radio.Button value="online">📱 Online</Radio.Button>
            </Radio.Group>
          </Col>
          <Col xs={24} md={8}>
            {paymentMethod === 'online' ? (
              <Input
                size="middle"
                placeholder="Enter Transaction ID / UTR"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                style={{ width: '100%' }}
                prefix={<FileTextOutlined style={{ color: colors.primary }} />}
              />
            ) : (
              <Space size={16}>
                <WalletOutlined style={{ color: colors.success, fontSize: '16px' }} />
                <Text strong style={{ fontSize: '14px' }}>
                  Total to Pay: ₹{totalPaymentAmount.toLocaleString()}
                </Text>
              </Space>
            )}
          </Col>
        </Row>
      </Card>

      {/* Members Table */}
      <Card 
        size="small"
        style={{ 
          background: colors.surface,
          borderColor: colors.border,
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        <Table
          columns={columns}
          dataSource={filteredMembers}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ 
            pageSize: 10,
            showTotal: (total) => (
              <Space>
                <TeamOutlined />
                <Text>{total} members total</Text>
                <Badge status="success" text={`${activeMembers.length} active`} />
                <Badge status="warning" text={`₹${totalOverallPending.toLocaleString()} pending`} />
              </Space>
            )
          }}
          scroll={{ x: 1400 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No members found" /> }}
        />
      </Card>

      {/* Payment Footer */}
      {selectedMembers.length > 0 && (
        <Card 
          size="small" 
          style={{ 
            marginTop: 16, 
            background: colors.surface, 
            borderColor: colors.primary,
            boxShadow: `0 4px 12px ${colors.primary}20`
          }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <Space size={24}>
                <Space>
                  <ClockCircleOutlined style={{ color: colors.info }} />
                  <Text type="secondary">Selected: <Text strong>{selectedMembers.length}</Text></Text>
                </Space>
                <Space>
                  <WalletOutlined style={{ color: colors.error }} />
                  <Text type="secondary">Pending: <Text strong style={{ color: colors.error }}>₹{totalSelectedPending.toLocaleString()}</Text></Text>
                </Space>
                <Space>
                  <DollarCircleOutlined style={{ color: colors.success }} />
                  <Text type="secondary">Paying: <Text strong style={{ color: colors.success }}>₹{totalPaymentAmount.toLocaleString()}</Text></Text>
                </Space>
                {paymentMethod === 'online' && transactionId && (
                  <Tag color="blue" icon={<FileTextOutlined />}>Txn: {transactionId}</Tag>
                )}
              </Space>
            </Col>
            <Col>
              <Button 
                type="primary"
                size="large"
                icon={<DollarCircleOutlined />}
                onClick={handleProcessPayments}
                disabled={totalPaymentAmount === 0 || (paymentMethod === 'online' && !transactionId)}
                style={{ 
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
                  border: 'none',
                  paddingLeft: 24,
                  paddingRight: 24
                }}
              >
                Review & Process Payment (₹{totalPaymentAmount.toLocaleString()})
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Payment History Drawer */}
      <PaymentHistoryDrawer
        visible={historyDrawerVisible}
        onClose={() => {
          setHistoryDrawerVisible(false);
          setSelectedMemberForHistory(null);
          setMemberTransactions([]);
        }}
        selectedMember={selectedMemberForHistory}
        memberTransactions={memberTransactions}
        loading={historyLoading}
        programList={programList}
        onTransactionClick={showTransactionDetail}
        colors={colors}
      />

      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        visible={transactionDetailVisible}
        onClose={() => {
          setTransactionDetailVisible(false);
          setSelectedTransaction(null);
        }}
        transaction={selectedTransaction}
        selectedMember={selectedMemberForHistory}
        programList={programList}
        colors={colors}
      />

      {/* Payment Confirmation Drawer */}
      <PaymentConfirmationDrawer
        visible={isPaymentDrawerVisible}
        onClose={() => setIsPaymentDrawerVisible(false)}
        onConfirm={confirmPayment}
        uploading={uploading}
        processingPayments={processingPayments}
        selectedMembersData={selectedMembersData}
        memberPayments={memberPayments}
        currentAgent={currentAgent}
        paymentMethod={paymentMethod}
        transactionId={transactionId}
        totalPaymentAmount={totalPaymentAmount}
        paymentDate={paymentDate}
        setPaymentDate={setPaymentDate}
        paymentNote={paymentNote}
        setPaymentNote={setPaymentNote}
        uploadedFile={uploadedFile}
        setUploadedFile={setUploadedFile}
        colors={colors}
      />
    </div>
  );
};

export default MemberPaymentPage;