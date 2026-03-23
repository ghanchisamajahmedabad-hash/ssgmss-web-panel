"use client";
import { fetchMembersByAgent } from '@/app/members/components/firebase-helpers';
import { useParams, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  Table, Card, Tag, Button, Space, Typography, InputNumber, message,
  Row, Col, Avatar, Select, Checkbox, Empty, Radio, Input, Badge,
  Tooltip, Progress, Statistic, Divider
} from 'antd';
import {
  UserOutlined, SearchOutlined, TeamOutlined, BankOutlined,
  WalletOutlined, ClockCircleOutlined, HistoryOutlined,
  DollarCircleOutlined, CheckCircleOutlined, ThunderboltOutlined,
  FileTextOutlined, ArrowRightOutlined, InfoCircleOutlined,
  SortAscendingOutlined, CalendarOutlined, SwapOutlined,
  RiseOutlined, FallOutlined, OrderedListOutlined, FilePdfOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { auth, db } from '../../../../../lib/firbase-client';
import { paymentApi } from '@/utils/api';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import PaymentConfirmationDrawer    from '../components/PaymentConfirmationDrawer';
import TransactionDetailDrawer      from '../components/TransactionDetailDrawer';
import PaymentHistoryDrawer         from '../components/PaymentHistoryDrawer';
import { uploadFile }               from '@/utils/uploadUtils/common';
import { generateJoinFeesPDF } from '@/utils/pdf/generateJoinFeesPDF';

const { Title, Text } = Typography;
const { Option }      = Select;

const colors = {
  primary: '#db2777', secondary: '#ea580c', accent: '#059669',
  warning: '#f59e0b', success: '#16a34a', error: '#dc2626',
  info: '#2563eb', background: '#fff8f5', surface: '#ffffff',
  border: '#fde2d8', foreground: '#3e1f1a',
};

const SORT_OPTIONS = [
  { value:'pending_desc', label:'Pending ↓', icon:<FallOutlined/>,         tooltip:'Highest pending first',    fn:(a,b)=>(b.pendingAmount||0)-(a.pendingAmount||0) },
  { value:'paid_desc',    label:'Paid ↓',    icon:<RiseOutlined/>,          tooltip:'Highest paid first',       fn:(a,b)=>(b.paidAmount||0)-(a.paidAmount||0) },
  { value:'name_asc',     label:'Name A→Z',  icon:<SortAscendingOutlined/>, tooltip:'Alphabetical',             fn:(a,b)=>(a.displayName||'').localeCompare(b.displayName||'') },
  { value:'reg_asc',      label:'Reg No.',   icon:<OrderedListOutlined/>,   tooltip:'By registration number',  fn:(a,b)=>(a.registrationNumber||'').localeCompare(b.registrationNumber||'') },
  { value:'created_desc', label:'Newest',    icon:<CalendarOutlined/>,      tooltip:'Most recently added first',fn:(a,b)=>{ const aT=a.createdAt?.toMillis?.()||new Date(a.createdAt||0).getTime(); const bT=b.createdAt?.toMillis?.()||new Date(b.createdAt||0).getTime(); return bT-aT; } },
];

const waterfallDistribute = (totalAmount, sortedIds, membersMap) => {
  const result = {}; let remaining = totalAmount;
  for (const id of sortedIds) {
    if (remaining <= 0) { result[id] = 0; continue; }
    const m = membersMap[id];
    if (!m || m.isDeleted) { result[id] = 0; continue; }
    const allocated = Math.min(remaining, m.pendingAmount || 0);
    result[id] = allocated; remaining -= allocated;
  }
  return result;
};

const MemberPaymentPage = () => {
  const params       = useParams();
  const searchParams = useSearchParams();
  const programList  = useSelector(s => s.data.programList);
  const agentList    = useSelector(s => s.data.agentList || []);

  const agentId      = params?.agentId;
  const programId    = searchParams.get('programId');
  const currentAgent = agentList.find(a => a.uid === agentId);

  const [members,             setMembers]             = useState([]);
  const [loading,             setLoading]             = useState(false);
  const [historyLoading,      setHistoryLoading]      = useState(false);
  const [searchText,          setSearchText]          = useState('');
  const [selectedProgram,     setSelectedProgram]     = useState(programId || 'all');
  const [sortKey,             setSortKey]             = useState('pending_desc');
  const [paymentFilter,       setPaymentFilter]       = useState('all'); // all | pending | paid
  const [selectedMembers,     setSelectedMembers]     = useState([]);
  const [globalPaymentAmount, setGlobalPaymentAmount] = useState('');
  const [paymentMethod,       setPaymentMethod]       = useState('cash');
  const [transactionId,       setTransactionId]       = useState('');
  const [memberPayments,      setMemberPayments]      = useState({});
  const [programOptions,      setProgramOptions]      = useState([]);

  const [historyDrawerVisible,     setHistoryDrawerVisible]     = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState(null);
  const [memberTransactions,       setMemberTransactions]       = useState([]);
  const [selectedTransaction,      setSelectedTransaction]      = useState(null);
  const [transactionDetailVisible, setTransactionDetailVisible] = useState(false);
  const [isPaymentDrawerVisible,   setIsPaymentDrawerVisible]   = useState(false);
  const [paymentDate,   setPaymentDate]   = useState(dayjs());
  const [paymentNote,   setPaymentNote]   = useState('');
  const [uploadedFile,  setUploadedFile]  = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [processingPayments, setProcessingPayments] = useState([]);

  const membersMap = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);

  // ── filteredMembers — flat programId ──────────────────────────────────────
  const filteredMembers = useMemo(() => {
    let list = [...members];

    // FIX: flat programId (was: m.programIds?.includes(selectedProgram))
    if (selectedProgram !== 'all')
      list = list.filter(m => m.programId === selectedProgram);

    // Payment status filter
    if (paymentFilter === 'pending')
      list = list.filter(m => !m.isDeleted && m.pendingAmount > 0);
    else if (paymentFilter === 'paid')
      list = list.filter(m => !m.isDeleted && m.pendingAmount === 0 && m.paidAmount > 0);

    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      list = list.filter(m =>
        m.displayName?.toLowerCase().includes(s) ||
        m.phone?.includes(searchText) ||
        m.registrationNumber?.toLowerCase().includes(s) ||
        m.fatherName?.toLowerCase().includes(s)
      );
    }

    const sortFn = SORT_OPTIONS.find(o => o.value === sortKey)?.fn ?? SORT_OPTIONS[0].fn;
    list.sort((a, b) => {
      if (a.isDeleted !== b.isDeleted) return a.isDeleted ? 1 : -1;
      return sortFn(a, b);
    });
    return list;
  }, [members, selectedProgram, paymentFilter, searchText, sortKey]);

  useEffect(() => { if (agentId) fetchMember(); }, [agentId]);

  // FIX: flat programId for programOptions
  useEffect(() => {
    const programs = new Set();
    members.forEach(m => {
      if (!m.delete_flag && m.programId) {
        const p = programList?.find(p => p.id === m.programId);
        if (p) programs.add(JSON.stringify({ id: m.programId, name: p.name }));
      }
    });
    setProgramOptions(Array.from(programs).map(p => JSON.parse(p)));
  }, [members, programList]);

  const fetchMember = async () => {
    setLoading(true);
    try {
      const data = await fetchMembersByAgent(agentId);
      const processed = data.map(m => ({
        ...m,
        key: m.id,
        pendingAmount: m.delete_flag ? 0 : (m.pendingAmount ?? ((m.joinFees || 0) - (m.paidAmount || 0))),
        paidAmount:    m.paidAmount  || 0,
        joinFees:      m.joinFees    || 0,
        totalFees:     m.delete_flag ? 0 : (m.joinFees || 0),
        // FIX: flat programId (was: m.programIds?.map(...).join(', '))
        programName:   (() => { const p = programList?.find(p => p.id === m.programId); return p?.name || m.programName || 'No Program'; })(),
        programNames:  (() => { const p = programList?.find(p => p.id === m.programId); return p?.name || m.programName || 'No Program'; })(),
        isDeleted:     m.delete_flag || false,
      }));
      setMembers(processed);
      const init = {};
      processed.forEach(m => { init[m.id] = 0; });
      setMemberPayments(init);
    } catch (e) {
      console.error(e); message.error('Failed to fetch members');
    } finally { setLoading(false); }
  };

  const fetchMemberPaymentHistory = async (memberId) => {
    setHistoryLoading(true);
    try {
      const q = query(collection(db, 'memberJoinFees'), where('memberId', '==', memberId), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setMemberTransactions(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt })));
    } catch { message.error('Failed to load payment history'); }
    finally { setHistoryLoading(false); }
  };

  // ── Selection helpers ─────────────────────────────────────────────────────
  const handleMemberSelect = (memberId, checked) => {
    const m = membersMap[memberId];
    if (m?.isDeleted) return;
    const newSel = checked ? [...selectedMembers, memberId] : selectedMembers.filter(id => id !== memberId);
    setSelectedMembers(newSel);
    if (globalPaymentAmount) {
      const sorted = filteredMembers.filter(m => newSel.includes(m.id)).map(m => m.id);
      setMemberPayments(prev => ({ ...prev, ...waterfallDistribute(Number(globalPaymentAmount), sorted, membersMap) }));
    }
  };

  const handleSelectAll = (checked) => {
    const selectable = filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).map(m => m.id);
    const newSel = checked ? selectable : [];
    setSelectedMembers(newSel);
    if (globalPaymentAmount && checked)
      setMemberPayments(prev => ({ ...prev, ...waterfallDistribute(Number(globalPaymentAmount), newSel, membersMap) }));
    else if (!checked) {
      const cleared = {}; selectable.forEach(id => { cleared[id] = 0; });
      setMemberPayments(prev => ({ ...prev, ...cleared }));
    }
  };

  const handlePaymentAmountChange = (memberId, value) => {
    const m = membersMap[memberId];
    if (m?.isDeleted) return;
    if (value > m.pendingAmount) { message.warning(`Cannot exceed ₹${m.pendingAmount.toLocaleString()}`); return; }
    setMemberPayments(prev => ({ ...prev, [memberId]: value || 0 }));
  };

  const applyGlobalPayment = () => {
    if (!globalPaymentAmount || selectedMembers.length === 0) return;
    const amount = Number(globalPaymentAmount);
    if (isNaN(amount) || amount <= 0) { message.warning('Enter a valid amount'); return; }
    const sortedSelected = filteredMembers.filter(m => selectedMembers.includes(m.id)).map(m => m.id);
    const dist = waterfallDistribute(amount, sortedSelected, membersMap);
    setMemberPayments(prev => ({ ...prev, ...dist }));
    message.success(`₹${amount.toLocaleString()} distributed across ${Object.values(dist).filter(v => v > 0).length} member(s)`);
  };

  const handleProcessPayments = () => {
    const valid = selectedMembers.filter(id => {
      const amt = parseFloat(memberPayments[id]) || 0;
      const m   = membersMap[id];
      return !m?.isDeleted && amt > 0 && amt <= m.pendingAmount;
    });
    if (!valid.length) { message.warning('No valid payment amounts entered.'); return; }
    if (paymentMethod === 'online' && !transactionId) { message.warning('Enter Transaction ID'); return; }
    setProcessingPayments(valid.map(id => {
      const m = membersMap[id];
      return { memberId: id, memberName: m.displayName, registrationNumber: m.registrationNumber, programId: m.programId, amount: parseFloat(memberPayments[id]) };
    }));
    setIsPaymentDrawerVisible(true);
  };

  // FIX: guard uploadFile when no file, use correct path
  const confirmPayment = async () => {
    try {
      setUploading(true);
      if (!auth.currentUser) { message.error('No authenticated user'); return; }

      let fileUrl = null;
      if (uploadedFile) {
        const result = await uploadFile(
          uploadedFile,
          `memberpayments/JoinFees/${agentId}/${Date.now()}_${uploadedFile.name}`
        );
        fileUrl = result?.url || null;
      }

      const res = await paymentApi.JoinFeesAdd({
        memberPayments:  processingPayments,
        paymentDate:     paymentDate.toISOString(),
        paymentMethod, paymentNote, transactionId,
        fileUrl,
        totalAmount: processingPayments.reduce((s, p) => s + p.amount, 0),
        agentId,
        programId: selectedProgram !== 'all' ? selectedProgram : null,
      });

      if (res.success) {
        message.success(`Processed ${processingPayments.length} payment(s)`);
        setIsPaymentDrawerVisible(false);
        fetchMember();
        setSelectedMembers([]); setMemberPayments({}); setGlobalPaymentAmount('');
        setUploadedFile(null); setPaymentNote(''); setTransactionId('');
      } else {
        message.error(res.message || 'Payment processing failed');
      }
    } catch (e) {
      message.error('Payment failed: ' + e.message);
    } finally { setUploading(false); }
  };

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownloadJoinFeesPDF = () => {
    const active = members.filter(m => !m.isDeleted);
    if (!active.length) { message.warning('No members to export'); return; }
    const label =
      paymentFilter === 'pending' ? 'Pending Only' :
      paymentFilter === 'paid'    ? 'Paid Only'    : 'All Members';
    generateJoinFeesPDF(active, currentAgent, label);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const getTotalPaying       = () => selectedMembers.reduce((s, id) => s + (parseFloat(memberPayments[id]) || 0), 0);
  const activeMembers        = members.filter(m => !m.isDeleted);
  const totalOverallPaid     = activeMembers.reduce((s, m) => s + (m.paidAmount    || 0), 0);
  const totalOverallPending  = activeMembers.reduce((s, m) => s + (m.pendingAmount || 0), 0);
  const totalSelectedPending = members.filter(m => selectedMembers.includes(m.id) && !m.isDeleted).reduce((s, m) => s + m.pendingAmount, 0);
  const totalPaymentAmount   = getTotalPaying();
  const selectableCount      = filteredMembers.filter(m => !m.isDeleted && m.pendingAmount > 0).length;
  const selectedMembersData  = members.filter(m => selectedMembers.includes(m.id) && !m.isDeleted && parseFloat(memberPayments[m.id]) > 0);
  const pendingCount         = activeMembers.filter(m => m.pendingAmount > 0).length;
  const paidCount            = activeMembers.filter(m => m.pendingAmount === 0 && m.paidAmount > 0).length;

  const waterfallOrder = useMemo(() => {
    const order = {}; let rank = 1;
    filteredMembers.forEach(m => {
      if (selectedMembers.includes(m.id) && (parseFloat(memberPayments[m.id]) || 0) > 0) order[m.id] = rank++;
    });
    return order;
  }, [filteredMembers, selectedMembers, memberPayments]);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    {
      title: () => <Checkbox onChange={e=>handleSelectAll(e.target.checked)} checked={selectedMembers.length===selectableCount&&selectableCount>0} indeterminate={selectedMembers.length>0&&selectedMembers.length<selectableCount} />,
      key:'sel', width:40,
      render:(_,r)=><Checkbox checked={selectedMembers.includes(r.id)} onChange={e=>handleMemberSelect(r.id,e.target.checked)} disabled={r.isDeleted||r.pendingAmount===0} />,
    },
    {
      title:'#', key:'order', width:46,
      render:(_,r)=>{ const n=waterfallOrder[r.id]; if(!n) return <span style={{color:'#ddd',fontSize:11,display:'block',textAlign:'center'}}>—</span>; return <div style={{width:26,height:26,borderRadius:'50%',margin:'0 auto',background:`linear-gradient(135deg,${colors.primary},${colors.secondary})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:700,boxShadow:`0 2px 6px ${colors.primary}50`}}>{n}</div>; },
    },
    {
      title:'Member', key:'member', width:210,
      render:(_,r)=>{ const pct=r.totalFees>0?Math.round((r.paidAmount/r.totalFees)*100):0; return (
        <Space size={10} align="start">
          <Avatar src={r.photoURL} icon={!r.photoURL&&<UserOutlined/>} size={36} style={{backgroundColor:r.isDeleted?'#d9d9d9':colors.primary,opacity:r.isDeleted?0.5:1,border:`2px solid ${r.isDeleted?'#d9d9d9':colors.border}`,flexShrink:0}}/>
          <div>
            <Space size={4} wrap>
              <Text strong style={{fontSize:13,color:r.isDeleted?'#aaa':colors.foreground,textDecoration:r.isDeleted?'line-through':'none'}}>{r.displayName}</Text>
              {r.isDeleted && <Tag color="red" style={{fontSize:10,margin:0,padding:'0 4px',lineHeight:'16px'}}>Deleted</Tag>}
              {pct===100&&!r.isDeleted && <CheckCircleOutlined style={{color:colors.success,fontSize:12}}/>}
            </Space>
            <div><Text type="secondary" style={{fontSize:11}}>{r.registrationNumber} · {r.phone}</Text></div>
            {/* Show program name (flat) */}
            {r.programName && !r.isDeleted && <Tag color="pink" style={{fontSize:10,marginTop:2}}>{r.programName}</Tag>}
            {!r.isDeleted&&r.totalFees>0 && <Progress percent={pct} size="small" showInfo={false} strokeColor={pct===100?colors.success:colors.primary} style={{marginTop:2,marginBottom:0,width:140}}/>}
          </div>
        </Space>
      );},
    },
    {
      title:'Total', dataIndex:'totalFees', width:78, align:'right',
      render:(f,r)=><Text style={{fontSize:12,fontWeight:600,color:r.isDeleted?'#aaa':colors.foreground,textDecoration:r.isDeleted?'line-through':'none'}}>₹{r.isDeleted?0:(f?.toLocaleString()||0)}</Text>,
    },
    {
      title:'Paid', dataIndex:'paidAmount', width:78, align:'right',
      render:(p,r)=><Text style={{fontSize:12,fontWeight:600,color:r.isDeleted?'#aaa':colors.success,textDecoration:r.isDeleted?'line-through':'none'}}>₹{r.isDeleted?0:(p?.toLocaleString()||0)}</Text>,
    },
    {
      title:'Pending', dataIndex:'pendingAmount', width:112, align:'right',
      render:(pending,r)=>{
        if(r.isDeleted) return <Text style={{color:'#aaa',fontSize:12}}>₹0</Text>;
        if(pending===0) return <Tag color="success" icon={<CheckCircleOutlined/>} style={{fontSize:10}}>Fully Paid</Tag>;
        const paying=parseFloat(memberPayments[r.id])||0, after=pending-paying;
        return <div style={{textAlign:'right'}}>
          <Text style={{fontSize:12,fontWeight:600,color:colors.error}}>₹{pending.toLocaleString()}</Text>
          {paying>0&&<div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:3,marginTop:2}}><ArrowRightOutlined style={{fontSize:9,color:colors.warning}}/><Text style={{fontSize:11,fontWeight:600,color:after===0?colors.success:colors.warning}}>{after===0?'Cleared ✓':`₹${after.toLocaleString()}`}</Text></div>}
        </div>;
      },
    },
    {
      title:'Joined', key:'joined', width:90, align:'center',
      render:(_,r)=>{ if(!r.createdAt) return <Text type="secondary" style={{fontSize:11}}>—</Text>; const d=r.createdAt?.toDate?.()||r.createdAt; return <Text style={{fontSize:11,color:'#888'}}>{dayjs(d).format('DD MMM YY')}</Text>; },
    },
    {
      title:'Pay Amount', key:'pay', width:122,
      render:(_,r)=>{
        if(r.isDeleted) return <Text type="secondary" style={{fontSize:11}}>N/A</Text>;
        if(r.pendingAmount===0) return <Text style={{color:colors.success,fontSize:11}}><CheckCircleOutlined/> Paid</Text>;
        const isSelected=selectedMembers.includes(r.id), val=memberPayments[r.id]||0;
        return <InputNumber size="small" placeholder="₹ Amount" value={val||null} onChange={v=>handlePaymentAmountChange(r.id,v)} disabled={!isSelected} min={0} max={r.pendingAmount} precision={0} style={{width:112,borderColor:val>0?colors.primary:undefined,boxShadow:val>0?`0 0 0 2px ${colors.primary}20`:undefined}} formatter={v=>v?`₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g,','):''} parser={v=>v.replace(/₹\s?|(,*)/g,'')}/>;
      },
    },
    {
      title:'History', key:'hist', width:58, fixed:'right',
      render:(_,r)=><Tooltip title="Payment History"><Button size="small" icon={<HistoryOutlined/>} onClick={()=>{setSelectedMemberForHistory(r);fetchMemberPaymentHistory(r.id);setHistoryDrawerVisible(true);}} style={{borderColor:colors.info,color:colors.info}}/></Tooltip>,
    },
  ];

  return (
    <div style={{padding:'16px 20px',background:colors.background,minHeight:'100vh'}}>

      {/* ── Agent Header ── */}
      <Card size="small" style={{marginBottom:16,background:`linear-gradient(135deg,${colors.primary}12 0%,${colors.secondary}12 100%)`,borderColor:colors.border,borderRadius:12,boxShadow:'0 2px 8px rgba(219,39,119,0.08)'}}>
        <Row gutter={[16,12]} align="middle">
          <Col xs={24} md={17}>
            <Space size={14}>
              <Avatar size={52} src={currentAgent?.photoUrl} icon={!currentAgent?.photoUrl&&<UserOutlined/>} style={{backgroundColor:colors.primary,border:`3px solid ${colors.secondary}`,boxShadow:`0 4px 12px ${colors.primary}40`}}/>
              <div>
                <Title level={4} style={{margin:0,color:colors.foreground}}>{currentAgent?.name||'Agent'}</Title>
                <Space wrap size={4} style={{marginTop:6}}>
                  <Tag icon={<BankOutlined/>} color="purple">{currentAgent?.caste||'N/A'}</Tag>
                  <Tag icon={<TeamOutlined/>} color="geekblue">{activeMembers.length} Members</Tag>
                  <Tag icon={<WalletOutlined/>} color="green">Collected: ₹{totalOverallPaid.toLocaleString()}</Tag>
                  <Tag icon={<ClockCircleOutlined/>} color="orange">Pending: ₹{totalOverallPending.toLocaleString()}</Tag>
                </Space>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={7}>
            <Space direction="vertical" size={2} style={{width:'100%'}}>
              <Text type="secondary" style={{fontSize:12}}>📞 {currentAgent?.phone1}</Text>
              <Text type="secondary" style={{fontSize:12}}>📍 {currentAgent?.village}, {currentAgent?.city}</Text>
              {/* Join Fees PDF button */}
              <Button icon={<FilePdfOutlined/>} size="small" onClick={handleDownloadJoinFeesPDF}
               style={{
                  marginTop: 4,
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontWeight: 600, fontSize: 12,
                  boxShadow: `0 2px 8px ${colors.primary}40`
                }}
              >
                Download PDF Report
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Filters + Sort ── */}
      <Card size="small" style={{marginBottom:12,borderColor:colors.border,borderRadius:10,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <Row gutter={[8,10]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input placeholder="Search name, phone, reg no..." prefix={<SearchOutlined style={{color:colors.primary}}/>} value={searchText} onChange={e=>setSearchText(e.target.value)} allowClear style={{borderRadius:8}}/>
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Select style={{width:'100%'}} placeholder="Filter by program" value={selectedProgram} onChange={setSelectedProgram}>
              <Option value="all">All Programs</Option>
              {programOptions.map(p=><Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </Col>
          {/* Payment status filter pills */}
          <Col xs={24} sm={24} md={5}>
            <Space size={4} wrap>
              <Text type="secondary" style={{fontSize:11}}>Status:</Text>
              {[
                {key:'all',     label:'All',     count:activeMembers.length, color:colors.foreground},
                {key:'pending', label:'Pending', count:pendingCount,         color:colors.error},
                {key:'paid',    label:'Paid',    count:paidCount,            color:colors.success},
              ].map(opt=>{
                const active=paymentFilter===opt.key;
                return <button key={opt.key} onClick={()=>setPaymentFilter(opt.key)} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 11px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:active?600:400,border:`1.5px solid ${active?opt.color:'#e5e7eb'}`,background:active?`${opt.color}15`:'#fafafa',color:active?opt.color:'#666',boxShadow:active?`0 0 0 2px ${opt.color}20`:'none',outline:'none'}}>
                  {opt.label}<span style={{background:active?opt.color:'#e5e7eb',color:active?'#fff':'#666',borderRadius:10,padding:'1px 6px',fontSize:10,fontWeight:700}}>{opt.count}</span>
                </button>;
              })}
            </Space>
          </Col>
          <Col xs={0} md={1} style={{display:'flex',justifyContent:'center'}}><Divider type="vertical" style={{height:28,margin:0}}/></Col>
          <Col xs={24} md={8}>
            <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5}}>
              <Text type="secondary" style={{fontSize:11,marginRight:4,display:'flex',alignItems:'center',gap:3}}><SwapOutlined style={{fontSize:11}}/> Sort:</Text>
              {SORT_OPTIONS.map(opt=>{
                const active=sortKey===opt.value;
                return <Tooltip key={opt.value} title={opt.tooltip} mouseEnterDelay={0.6}><button onClick={()=>setSortKey(opt.value)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 11px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:active?600:400,border:`1.5px solid ${active?colors.primary:'#e5e7eb'}`,background:active?`linear-gradient(135deg,${colors.primary}1a,${colors.secondary}0f)`:'#fafafa',color:active?colors.primary:'#666',boxShadow:active?`0 0 0 2px ${colors.primary}1f`:'none',outline:'none',lineHeight:1.5}}>{opt.icon}{opt.label}</button></Tooltip>;
              })}
              <span style={{marginLeft:2,padding:'3px 9px',borderRadius:20,fontSize:11,fontWeight:600,background:`${colors.primary}0f`,color:colors.primary,border:`1px solid ${colors.border}`}}>{filteredMembers.length} result{filteredMembers.length!==1?'s':''}</span>
            </div>
          </Col>
        </Row>
      </Card>

      {/* ── Waterfall Controls ── */}
      <Card size="small" style={{marginBottom:14,background:colors.surface,borderColor:colors.border,borderRadius:10,boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
        <Row gutter={[12,12]} align="middle">
          <Col xs={24} md={5}><Space size={8} align="center"><Checkbox onChange={e=>handleSelectAll(e.target.checked)} checked={selectedMembers.length===selectableCount&&selectableCount>0} indeterminate={selectedMembers.length>0&&selectedMembers.length<selectableCount}><Text strong>Select All</Text></Checkbox>{selectedMembers.length>0&&<Badge count={selectedMembers.length} style={{backgroundColor:colors.primary}}/>}</Space></Col>
          <Col xs={24} md={5}><InputNumber placeholder="Total amount to distribute" value={globalPaymentAmount} onChange={setGlobalPaymentAmount} style={{width:'100%',borderRadius:8}} formatter={v=>v?`₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g,','):''} parser={v=>v.replace(/[^\d]/g,'')} precision={0} min={0}/></Col>
          <Col xs={24} md={4}><Tooltip title="Fills each member fully before moving to next"><Button type="primary" icon={<ThunderboltOutlined/>} onClick={applyGlobalPayment} disabled={!globalPaymentAmount||selectedMembers.length===0} style={{width:'100%',background:`linear-gradient(135deg,${colors.primary},${colors.secondary})`,border:'none',borderRadius:8}}>Waterfall Apply</Button></Tooltip></Col>
          <Col xs={24} md={1}><Divider type="vertical" style={{height:32,margin:0}}/></Col>
          <Col xs={24} md={4}><Radio.Group value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} buttonStyle="solid" size="middle"><Radio.Button value="cash">💵 Cash</Radio.Button><Radio.Button value="online">📱 Online</Radio.Button></Radio.Group></Col>
          <Col xs={24} md={5}>
            {paymentMethod==='online'
              ? <Input placeholder="Transaction ID / UTR" value={transactionId} onChange={e=>setTransactionId(e.target.value)} style={{width:'100%',borderRadius:8}} prefix={<FileTextOutlined style={{color:colors.primary}}/>}/>
              : <Space size={8} align="center"><WalletOutlined style={{color:colors.success,fontSize:18}}/><div><Text type="secondary" style={{fontSize:11}}>Total to Pay</Text><div><Text strong style={{fontSize:15,color:colors.success}}>₹{totalPaymentAmount.toLocaleString()}</Text></div></div></Space>
            }
          </Col>
        </Row>
        {selectedMembers.length>0&&globalPaymentAmount&&(
          <div style={{marginTop:10,padding:'7px 12px',background:`${colors.primary}08`,borderRadius:8,border:`1px dashed ${colors.primary}40`,display:'flex',alignItems:'center',gap:8}}>
            <InfoCircleOutlined style={{color:colors.primary,fontSize:13}}/>
            <Text style={{fontSize:12,color:colors.primary}}>Waterfall follows <strong>{SORT_OPTIONS.find(o=>o.value===sortKey)?.label}</strong> order — ₹{Number(globalPaymentAmount).toLocaleString()} across <strong>{selectedMembers.length}</strong> member(s).</Text>
          </div>
        )}
      </Card>

      {/* ── Table ── */}
      <Card size="small" style={{background:colors.surface,borderColor:colors.border,borderRadius:10,boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
        <Table columns={columns} dataSource={filteredMembers} rowKey="id" loading={loading} size="middle"
          rowClassName={r=>(!r.isDeleted&&selectedMembers.includes(r.id)&&parseFloat(memberPayments[r.id])>0)?'paying-row':''}
          pagination={{ pageSize:10,showSizeChanger:false, showTotal:total=><Space size={12}><TeamOutlined/><Text>{total} members</Text><Badge status="success" text={`${activeMembers.length} active`}/><Badge status="warning" text={`₹${totalOverallPending.toLocaleString()} pending`}/></Space> }}
          scroll={{x:1150}} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No members found"/>}}
        />
      </Card>

      {/* ── Payment Footer ── */}
      {selectedMembers.length>0&&(
        <Card size="small" style={{marginTop:14,background:colors.surface,borderColor:colors.primary,borderRadius:10,boxShadow:`0 4px 16px ${colors.primary}25`}}>
          <Row justify="space-between" align="middle" gutter={[12,12]}>
            <Col>
              <Space size={20} wrap>
                <Statistic title={<Text type="secondary" style={{fontSize:11}}>Selected</Text>} value={selectedMembers.length} prefix={<TeamOutlined style={{color:colors.info}}/>} valueStyle={{fontSize:16,color:colors.info}}/>
                <Statistic title={<Text type="secondary" style={{fontSize:11}}>Total Pending</Text>} value={`₹${totalSelectedPending.toLocaleString()}`} valueStyle={{fontSize:16,color:colors.error}}/>
                <Statistic title={<Text type="secondary" style={{fontSize:11}}>Paying Now</Text>} value={`₹${totalPaymentAmount.toLocaleString()}`} valueStyle={{fontSize:16,color:colors.success}}/>
                {paymentMethod==='online'&&transactionId&&<Tag color="blue" icon={<FileTextOutlined/>}>Txn: {transactionId}</Tag>}
              </Space>
            </Col>
            <Col>
              <Space size={8}>
                <Button icon={<FilePdfOutlined/>} onClick={handleDownloadJoinFeesPDF} style={{borderColor:'#1B385A',color:'#1B385A',borderRadius:8}}>PDF Report</Button>
                <Button type="primary" size="large" icon={<DollarCircleOutlined/>} onClick={handleProcessPayments}
                  disabled={totalPaymentAmount===0||(paymentMethod==='online'&&!transactionId)}
                  style={{background:`linear-gradient(135deg,${colors.primary} 0%,${colors.secondary} 100%)`,border:'none',borderRadius:8,paddingLeft:28,paddingRight:28,height:44,fontWeight:600,boxShadow:`0 4px 12px ${colors.primary}40`}}>
                  Review & Process — ₹{totalPaymentAmount.toLocaleString()}
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <style>{`.paying-row td{background:${colors.primary}06!important}.ant-table-row:hover.paying-row td{background:${colors.primary}10!important}`}</style>

      {/* ── Drawers ── */}
      <PaymentHistoryDrawer visible={historyDrawerVisible} onClose={()=>{setHistoryDrawerVisible(false);setSelectedMemberForHistory(null);setMemberTransactions([]);}} selectedMember={selectedMemberForHistory} memberTransactions={memberTransactions} loading={historyLoading} programList={programList} onTransactionClick={t=>{setSelectedTransaction(t);setTransactionDetailVisible(true);}} colors={colors}/>
      <TransactionDetailDrawer visible={transactionDetailVisible} onClose={()=>{setTransactionDetailVisible(false);setSelectedTransaction(null);}} transaction={selectedTransaction} selectedMember={selectedMemberForHistory} programList={programList} colors={colors}/>
      <PaymentConfirmationDrawer
        visible={isPaymentDrawerVisible} onClose={()=>setIsPaymentDrawerVisible(false)}
        onConfirm={confirmPayment} uploading={uploading}
        processingPayments={processingPayments} selectedMembersData={selectedMembersData}
        memberPayments={memberPayments} currentAgent={currentAgent}
        paymentMethod={paymentMethod} transactionId={transactionId}
        totalPaymentAmount={totalPaymentAmount} paymentDate={paymentDate}
        setPaymentDate={setPaymentDate} paymentNote={paymentNote}
        setPaymentNote={setPaymentNote} uploadedFile={uploadedFile}
        setUploadedFile={setUploadedFile}
        // Pass for PDF inside confirmation drawer
        allMembers={members.filter(m=>!m.isDeleted)}
        filterLabel={paymentFilter==='pending'?'Pending Only':paymentFilter==='paid'?'Paid Only':'All Members'}
        colors={colors}
      />
    </div>
  );
};

export default MemberPaymentPage;