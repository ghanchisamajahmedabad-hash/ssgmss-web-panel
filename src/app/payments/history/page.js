'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Card, Tag, Button, Space, Typography,
  Badge, Spin, Empty, message, Select, DatePicker,
  Flex, Input
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, FilePdfOutlined,
  SearchOutlined,
  DownOutlined, RightOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { auth } from '../../../../lib/firbase-client';
import { useSelector } from 'react-redux';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const C = {
  primary: '#db2777',
  secondary: '#ea580c',
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  bg: '#fff8f5',
  border: '#fde2d8',
  surface: '#ffffff',
  fg: '#3e1f1a',
  muted: '#9ca3af',
};

const PAGE_SIZE = 100;

const PaymentHistoryPage = () => {
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalGroups: 0, totalPages: 0, totalTransactions: 0, totalAmount: 0 });
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const debounceRef = useRef(null);

  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [methodFilter, setMethodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const agentList = useSelector((state) => state.data.agentList || []);

  const fetchData = useCallback(async (page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('pageSize', String(PAGE_SIZE));
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (methodFilter !== 'all') params.set('method', methodFilter);
      if (agentFilter !== 'all') params.set('agentId', agentFilter);
      if (dateRange?.[0]) params.set('startDate', dateRange[0].startOf('day').toISOString());
      if (dateRange?.[1]) params.set('endDate', dateRange[1].endOf('day').toISOString());
      if (searchText.trim()) params.set('search', searchText.trim());

      const token = await auth.currentUser?.getIdToken();
      if (!token) { message.error('Not authenticated'); setLoading(false); return; }
      const res = await fetch(`/api/payment-history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setGroups(data.data);
        setPagination(data.pagination);
      } else {
        message.error(data.message || 'Failed to load');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, methodFilter, agentFilter, dateRange, searchText]);

  useEffect(() => {
    fetchData(currentPage);
  }, [currentPage, typeFilter, methodFilter, agentFilter, dateRange]);

  const handleSearch = (val) => {
    setSearchText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchData(1);
    }, 500);
  };

  const buildExportParams = () => {
    const params = new URLSearchParams();
    params.set('export', 'true');
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (methodFilter !== 'all') params.set('method', methodFilter);
    if (agentFilter !== 'all') params.set('agentId', agentFilter);
    if (dateRange?.[0]) params.set('startDate', dateRange[0].startOf('day').toISOString());
    if (dateRange?.[1]) params.set('endDate', dateRange[1].endOf('day').toISOString());
    if (searchText.trim()) params.set('search', searchText.trim());
    return params;
  };

  const flattenExportData = (groups) => {
    const list = [];
    groups.forEach(g => {
      (g.transactions || []).forEach(tx => {
        list.push({
          key: `${g.id}_${tx.id}`,
          groupDate: g.paymentDate ? dayjs(g.paymentDate).format('DD/MM/YYYY') : '—',
          agentName: g.agent?.name || '—',
          agentPhone: g.agent?.phone1 || '',
          memberName: tx.memberName || '—',
          programName: tx.programName || '—',
          paymentType: g.paymentType === 'closingPayment' ? 'Closing' : 'Join Fees',
          amount: tx.amount || 0,
          method: g.paymentMethod || '—',
          transactionId: tx.transactionId || '—',
          paymentNote: g.paymentNote || '',
        });
      });
    });
    return list;
  };

  const fetchExportData = async () => {
    setExportLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { message.error('Not authenticated'); return null; }
      const params = buildExportParams();
      const res = await fetch(`/api/payment-history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) { message.error(data.message); return null; }
      return flattenExportData(data.data);
    } catch (e) {
      console.error(e);
      message.error('Export failed');
      return null;
    } finally {
      setExportLoading(false);
    }
  };

  const exportCSV = async () => {
    const allTx = await fetchExportData();
    if (!allTx || !allTx.length) { message.warning('No data'); return; }
    const headers = ['Date', 'Agent Name', 'Agent Phone', 'Member Name', 'Program', 'Payment Type', 'Amount', 'Method', 'Transaction ID'];
    const rows = allTx.map(r => [r.groupDate, r.agentName, r.agentPhone, r.memberName, r.programName, r.paymentType, r.amount, r.method, r.transactionId]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => String(v ?? '').includes(',') ? `"${String(v).replace(/"/g, '""')}"` : v).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payment-history_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    message.success(`Exported ${rows.length} records`);
  };

  const exportExcel = async () => {
    const allTx = await fetchExportData();
    if (!allTx || !allTx.length) { message.warning('No data'); return; }
    const data = [...allTx.map(r => ({
      'Date': r.groupDate, 'Agent': r.agentName, 'Phone': r.agentPhone,
      'Member': r.memberName, 'Program': r.programName, 'Type': r.paymentType,
      'Amount': r.amount, 'Method': r.method, 'Tx ID': r.transactionId,
    })), { 'Date': '', 'Agent': 'TOTAL', 'Amount': allTx.reduce((s, r) => s + r.amount, 0) }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');
    XLSX.writeFile(wb, `payment-history_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    message.success(`Exported ${data.length - 1} records`);
  };

  const exportPDF = async () => {
    const allTx = await fetchExportData();
    if (!allTx || !allTx.length) { message.warning('No data'); return; }
    const rows = allTx.map((r, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${r.groupDate}</td>
      <td>${r.agentName}</td>
      <td>${r.memberName}</td>
      <td>${r.paymentType}</td>
      <td class="c">₹${r.amount.toLocaleString()}</td>
      <td class="c">${r.method}</td>
      <td>${r.transactionId}</td>
    </tr>`).join('');
    const t = allTx.reduce((s, r) => s + r.amount, 0);
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Payment History</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;background:#b0b0b0;color:#111}
        .print-bar{position:sticky;top:0;z-index:100;padding:12px 24px;background:#1B385A;display:flex;gap:12px;align-items:center}
        .btn-print{background:#D3292F;color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px}
        .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px}
        .page{width:210mm;min-height:297mm;background:#fff;margin:18px auto;padding:8mm;box-shadow:0 6px 28px rgba(0,0,0,.25)}
        h2{text-align:center;color:#1B385A;margin-bottom:4px;font-size:18px}
        .sub{text-align:center;color:#D3292F;font-size:12px;margin-bottom:10px}
        .filters{font-size:11px;color:#666;margin-bottom:8px;display:flex;gap:16px;flex-wrap:wrap}
        table{width:100%;border-collapse:collapse;border:1.5px solid #999;font-size:10px}
        th{padding:6px 4px;font-weight:700;color:#1B385A;text-align:center;border:1px solid #999;background:#f0f0f0}
        td{padding:5px 4px;color:#111;border:0.8px solid #c0c8d4}
        td.c{text-align:center}
        .total-row td{font-weight:700;background:#fff3f0}
        .footer{text-align:center;margin-top:10px;font-size:10px;color:#666;border-top:1.5px solid #D3292F;padding-top:6px}
        @media print{body{background:#fff}.print-bar{display:none!important}.page{margin:0;box-shadow:none}}
      </style>
    </head><body>
      <div class="print-bar">
        <button class="btn-print" onclick="window.print()">🖨 Print</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
        <span class="print-info">📄 ${allTx.length} records</span>
      </div>
      <div class="page">
        <h2>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</h2>
        <div class="sub">पूर्ण भुगतान इतिहास रिपोर्ट</div>
        <table>
          <thead><tr>
            <th style="width:25px">#</th><th style="width:65px">Date</th><th>Agent</th><th>Member</th>
            <th style="width:55px">Type</th><th style="width:65px">Amount</th><th style="width:50px">Method</th><th>Tx ID</th>
          </tr></thead>
          <tbody>${rows}
            <tr class="total-row"><td colspan="5" style="text-align:right">Total (${allTx.length}):</td><td class="c">₹${t.toLocaleString()}</td><td colspan="2"></td></tr>
          </tbody>
        </table>
        <div class="footer">Generated ${dayjs().format('DD MMM YYYY hh:mm A')}</div>
      </div>
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) { message.error('Popup blocked!'); return; }
    win.document.write(html);
    win.document.close();
  };

  const expandedRowRender = (record) => {
    const txs = record.transactions || [];
    if (!txs.length) return <Empty description="No transactions" style={{ margin: 16 }} />;
    return (
      <div style={{ padding: '8px 16px', background: '#fdf2f8', borderRadius: 8 }}>
        <Table
          columns={[
            { title: 'Member', dataIndex: 'memberName', key: 'member', width: 180 },
            { title: 'Program', dataIndex: 'programName', key: 'program', width: 150 },
            { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 100, align: 'right',
              render: (v) => <Text strong>₹{(v || 0).toLocaleString()}</Text> },
            { title: 'Method', dataIndex: 'paymentMode', key: 'method', width: 80,
              render: (v) => <Tag color={v === 'cash' ? 'green' : 'blue'}>{v || '—'}</Tag> },
            { title: 'Tx ID', dataIndex: 'transactionId', key: 'txId', width: 130,
              render: (v) => <Text copyable style={{ fontSize: 11 }}>{v || '—'}</Text> },
          ]}
          dataSource={txs}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </div>
    );
  };

  const columns = [
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 100,
      render: (d) => <Text>{d ? dayjs(d).format('DD/MM/YYYY') : '—'}</Text> },
    { title: 'Agent', key: 'agent', width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>{r.agent?.name || '—'}</Text>
          <Text style={{ fontSize: 10, color: C.muted }}>{r.agent?.phone1 || ''}</Text>
        </Space>
      ),
    },
    { title: 'Type', dataIndex: 'paymentType', key: 'type', width: 85,
      render: (v) => (
        <Tag color={v === 'closingPayment' ? 'volcano' : 'geekblue'} style={{ borderRadius: 10 }}>
          {v === 'closingPayment' ? 'Closing' : 'Join Fees'}
        </Tag>
      ),
    },
    { title: 'Amount', dataIndex: 'totalAmount', key: 'amount', width: 100, align: 'right',
      render: (v) => <Text strong>₹{(v || 0).toLocaleString()}</Text> },
    { title: 'Method', dataIndex: 'paymentMethod', key: 'method', width: 75,
      render: (v) => <Tag color={v === 'cash' ? 'success' : 'processing'}>{v === 'cash' ? 'Cash' : 'Online'}</Tag> },
    { title: 'Tx ID', dataIndex: 'transactionId', key: 'txId', width: 110,
      render: (v) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Members', key: 'members', width: 70, align: 'center',
      render: (_, r) => <Badge count={(r.transactions || []).length} style={{ backgroundColor: C.info }} showZero /> },
    { title: 'Note', dataIndex: 'paymentNote', key: 'note', width: 110, ellipsis: true,
      render: (v) => <Text style={{ fontSize: 11, color: C.muted }}>{v || '—'}</Text> },
  ];

  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, color: C.primary }}>Payment History</Title>
        <Text type="secondary">All join fees & closing payment transactions — max {PAGE_SIZE} per page</Text>
      </div>

      <Card style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, marginBottom: 16 }}
        bodyStyle={{ padding: '12px 16px' }}>
        <Flex wrap="wrap" gap={12} align="center">
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Date Range</Text>
            <RangePicker value={dateRange} onChange={(d) => { setDateRange(d || [dayjs().startOf('month'), dayjs().endOf('month')]); setCurrentPage(1); }}
              format="DD/MM/YYYY" size="small" style={{ width: 220 }} allowClear={false} />
          </div>
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Method</Text>
            <Select value={methodFilter} onChange={(v) => { setMethodFilter(v); setCurrentPage(1); }} size="small" style={{ width: 110 }}>
              <Select.Option value="all">All</Select.Option>
              <Select.Option value="cash">Cash</Select.Option>
              <Select.Option value="online">Online</Select.Option>
            </Select>
          </div>
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Type</Text>
            <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setCurrentPage(1); }} size="small" style={{ width: 120 }}>
              <Select.Option value="all">All Types</Select.Option>
              <Select.Option value="joinFees">Join Fees</Select.Option>
              <Select.Option value="closingPayment">Closing</Select.Option>
            </Select>
          </div>
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Agent</Text>
            <Select value={agentFilter} onChange={(v) => { setAgentFilter(v); setCurrentPage(1); }} size="small" showSearch optionFilterProp="children" style={{ width: 200 }}>
              <Select.Option value="all">All Agents</Select.Option>
              {agentList.map((a) => (
                <Select.Option key={a.id} value={a.id}>{a.name} - {a.phone1 || ''}</Select.Option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Search</Text>
            <Input placeholder="Member name / Tx ID ..." prefix={<SearchOutlined />} size="small"
              onChange={(e) => handleSearch(e.target.value)} allowClear style={{ width: '100%' }} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchData(currentPage)} loading={loading} size="small" />
              <Button icon={<DownloadOutlined />} onClick={exportCSV} loading={exportLoading} size="small">CSV</Button>
              <Button icon={<FileExcelOutlined style={{ color: '#217346' }} />} onClick={exportExcel} loading={exportLoading} size="small"
                style={{ borderColor: '#217346', color: '#217346' }}>Excel</Button>
              <Button type="primary" icon={<FilePdfOutlined />} onClick={exportPDF} loading={exportLoading} size="small"
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, border: 'none' }}>PDF</Button>
            </Space>
          </div>
        </Flex>
      </Card>

      <Card style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }}
        bodyStyle={{ padding: 0 }}
        extra={
          <Text style={{ fontSize: 11, color: C.muted }}>
            {pagination.totalGroups} groups · {pagination.totalTransactions} transactions · <Text strong style={{ color: C.primary }}>₹{(pagination.totalAmount || 0).toLocaleString()}</Text> total
          </Text>
        }>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : groups.length === 0 ? (
          <Empty description="No payment history found" style={{ padding: 60 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={groups}
            rowKey="id"
            pagination={{
              current: currentPage,
              pageSize: PAGE_SIZE,
              total: pagination.totalGroups,
              onChange: (p) => setCurrentPage(p),
              showTotal: (t) => `${t} groups`,
              size: 'small',
              showSizeChanger: false,
            }}
            size="middle"
            scroll={{ x: 1100 }}
            expandable={{
              expandedRowRender,
              expandedRowKeys,
              onExpand: (exp, rec) => setExpandedRowKeys(exp ? [rec.id] : []),
              expandIcon: ({ expanded, onExpand, record }) =>
                expanded
                  ? <DownOutlined onClick={(e) => onExpand(record, e)} style={{ color: C.primary, cursor: 'pointer' }} />
                  : <RightOutlined onClick={(e) => onExpand(record, e)} style={{ color: C.primary, cursor: 'pointer' }} />,
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default PaymentHistoryPage;
