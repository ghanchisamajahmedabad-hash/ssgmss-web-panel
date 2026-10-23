"use client";
// Take an ADVANCE from a member (money given before it is due). It goes into
// the member's advance balance and is used later with the "Member Adv" method
// on this page. Backed by /api/members/advance.
import React, { useEffect, useRef, useState } from 'react';
import {
  Drawer, Typography, InputNumber, Radio, Input, DatePicker, Button, Space,
  Tag, Alert, Empty, Spin, Avatar, Popconfirm, message, Divider,
} from 'antd';
import { UserOutlined, WalletOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAuth } from 'firebase/auth';
import UtrAmountField from '../../components/UtrAmountField';

const { Text, Title } = Typography;
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const call = async (method, body, qs = '') => {
  const token = await getAuth().currentUser?.getIdToken();
  const res = await fetch(`/api/members/advance${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
};

const TYPE = {
  credit:   { color: 'green',  label: 'Jama' },
  debit:    { color: 'blue',   label: 'Closing me use' },
  reversal: { color: 'red',    label: 'Revert' },
};

const MemberAdvanceDrawer = ({ open, onClose, member, agentList = [], isSuperAdmin = false, onDone }) => {
  const [amount, setAmount]   = useState(null);
  const [method, setMethod]   = useState('cash');
  const [txId, setTxId]       = useState('');
  const [utrTotal, setUtrTotal] = useState(null);
  const [utrBlocked, setUtrBlocked] = useState(false);
  const [date, setDate]       = useState(dayjs());
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const idemRef = useRef(null);

  const loadHistory = async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      const r = await call('GET', null, `?memberId=${encodeURIComponent(member.id)}`);
      setHistory(r.data || []);
      setBalance(r.balance || 0);
    } catch (e) {
      message.error('Advance history load nahi hui: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setAmount(null); setMethod('cash'); setTxId(''); setUtrTotal(null);
    setDate(dayjs()); setNote(''); idemRef.current = null;
    setBalance(Number(member?.memberAdvanceBalance || 0));
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id]);

  const save = async () => {
    if (!(amount > 0)) { message.warning('Amount daalo'); return; }
    if (method === 'online' && !txId.trim()) { message.warning('Transaction ID / UTR daalo'); return; }
    if (!idemRef.current) idemRef.current = `adv_${member.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSaving(true);
    try {
      const r = await call('POST', {
        memberId: member.id,
        amount,
        paymentMethod: method,
        transactionId: method === 'online' ? txId.trim() : '',
        utrTotalAmount: method === 'online' ? (utrTotal || null) : null,
        paymentDate: date.toISOString(),
        note,
        idempotencyKey: idemRef.current,
      });
      idemRef.current = null;
      message.success(r.alreadyProcessed ? r.message : `${fmt(amount)} advance jama — naya balance ${fmt(r.newBalance)}`);
      setAmount(null); setTxId(''); setUtrTotal(null); setNote('');
      await loadHistory();
      onDone?.();
    } catch (e) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const revert = async (paymentGroupId) => {
    try {
      const r = await call('DELETE', { paymentGroupId });
      message.success(r.message);
      await loadHistory();
      onDone?.();
    } catch (e) {
      message.error(e.message);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      title={
        <Space>
          <WalletOutlined style={{ color: '#059669', fontSize: 18 }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>Member Advance</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Pehle se jama karwaya gaya paisa</Text>
          </div>
        </Space>
      }
      extra={
        <Button type="primary" loading={saving} onClick={save}
          disabled={!(amount > 0) || (method === 'online' && (!txId.trim() || utrBlocked))}
          style={{ background: '#059669', borderColor: '#059669' }}>
          Advance jama karo
        </Button>
      }
    >
      {/* member */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, marginBottom: 16 }}>
        <Avatar src={member?.photoURL} icon={<UserOutlined />} />
        <div style={{ flex: 1 }}>
          <Text strong>{member?.displayName}</Text>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{member?.registrationNumber} · Pending closing {fmt(member?.closing_pendingAmount)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#065f46' }}>Advance balance</div>
          <Text strong style={{ fontSize: 18, color: '#059669' }}>{fmt(balance)}</Text>
        </div>
      </div>

      {/* form */}
      <Text type="secondary">Amount</Text>
      <InputNumber
        style={{ width: '100%', marginTop: 4, marginBottom: 12 }} size="large" min={1} precision={0}
        value={amount} onChange={setAmount} placeholder="₹"
        formatter={v => v ? `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
        parser={v => v.replace(/[^\d]/g, '')}
      />

      <Text type="secondary">Payment method</Text>
      <div style={{ marginTop: 4, marginBottom: 12 }}>
        <Radio.Group value={method} onChange={e => setMethod(e.target.value)} buttonStyle="solid">
          <Radio.Button value="cash">Cash</Radio.Button>
          <Radio.Button value="online">Online</Radio.Button>
        </Radio.Group>
      </div>

      {method === 'online' && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">Transaction ID / UTR</Text>
          <Input value={txId} onChange={e => setTxId(e.target.value)} style={{ marginTop: 4 }} placeholder="UTR" />
          <UtrAmountField
            transactionId={txId}
            utrTotalAmount={utrTotal}
            setUtrTotalAmount={setUtrTotal}
            payingAmount={amount || 0}
            agentList={agentList}
            onBlockedChange={setUtrBlocked}
          />
        </div>
      )}

      <Text type="secondary">Date</Text>
      <DatePicker value={date} onChange={d => setDate(d || dayjs())} format="DD/MM/YYYY" allowClear={false}
        style={{ width: '100%', marginTop: 4, marginBottom: 12 }} />

      <Text type="secondary">Note (optional)</Text>
      <Input.TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} style={{ marginTop: 4 }} />

      <Alert type="info" showIcon style={{ marginTop: 12, fontSize: 12 }}
        message='Ye paisa member ke advance me jama hoga. Agli closing payment me "Member Adv" method chun ke isse kaat sakte ho.' />

      <Divider style={{ margin: '20px 0 12px' }}>Advance history</Divider>
      {loading ? <div style={{ textAlign: 'center' }}><Spin /></div>
        : !history.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Koi advance entry nahi" />
        : history.map(h => {
          const t = TYPE[h.type] || { color: 'default', label: h.type };
          // Only direct deposits are undone here; extra kept from a closing
          // payment is undone by reverting that payment.
          const isDirect = h.type === 'credit' && h.source === 'direct' && !h.reversed;
          return (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12 }}>
                  {h.createdAt ? dayjs(h.createdAt).format('DD/MM/YYYY') : ''}
                  {h.paymentMethod ? ` · ${h.paymentMethod}` : ''}
                  {h.transactionId ? ` · ${h.transactionId}` : ''}
                  {h.reversed ? <Tag color="red" style={{ marginLeft: 6 }}>reverted</Tag> : null}
                </div>
                {h.note ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{h.note}</div> : null}
              </div>
              <Text strong style={{ color: h.type === 'credit' || h.direction === 'in' ? '#059669' : '#dc2626' }}>
                {h.type === 'credit' || h.direction === 'in' ? '+' : '−'}{fmt(h.amount)}
              </Text>
              {isSuperAdmin && isDirect && h.paymentGroupId && (
                <Popconfirm title="Ye advance revert karein?" okText="Revert" okButtonProps={{ danger: true }}
                  onConfirm={() => revert(h.paymentGroupId)}>
                  <Button size="small" type="text" danger icon={<UndoOutlined />} />
                </Popconfirm>
              )}
            </div>
          );
        })}
    </Drawer>
  );
};

export default MemberAdvanceDrawer;
