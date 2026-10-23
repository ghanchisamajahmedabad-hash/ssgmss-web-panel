"use client";
// One bank transfer (UTR) can pay for several agents' members, or for closing
// AND join fees. This field asks for the UTR's total bank amount and shows how
// much of it earlier payments already used, so the same UTR can be entered
// again until it's used up. Server rule lives in app/api/db/utrLedger.js.
import React, { useEffect, useMemo, useState } from 'react';
import { InputNumber, Typography, Alert, Spin, Tag } from 'antd';
import { paymentApi } from '@/utils/api';

const { Text } = Typography;

const TYPE_LABEL = { joinFees: 'Join Fees', closingPayment: 'Closing', agentAdvance: 'Agent Advance' };
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const UtrAmountField = ({
  transactionId,
  utrTotalAmount, setUtrTotalAmount,
  payingAmount = 0,
  agentList = [],
  onBlockedChange,           // (blocked: boolean) → parent disables Confirm
}) => {
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(false);
  const utr = (transactionId || '').trim();

  useEffect(() => {
    // New UTR typed — forget the total entered for the previous one
    setUtrTotalAmount(null);
    if (utr.length < 4) { setInfo(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await paymentApi.utrCheck(utr);
        if (cancelled) return;
        setInfo(res.data || null);
        // A UTR seen before already has its bank amount saved — use that.
        if (res.data?.totalAmount != null) setUtrTotalAmount(res.data.totalAmount);
      } catch {
        if (!cancelled) setInfo(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utr]);

  const locked = info?.totalAmount != null;
  const used   = info?.used || 0;
  const total  = locked ? info.totalAmount : (Number(utrTotalAmount) > 0 ? Number(utrTotalAmount) : null);
  const after  = used + Number(payingAmount || 0);

  const status = useMemo(() => {
    if (!utr) return { blocked: false };
    if (total == null && used > 0)
      return { blocked: true, type: 'error', msg: `This UTR was already used for ${fmt(used)}. Enter the UTR's total bank amount to use it again.` };
    if (total != null && after > total + 0.001)
      return { blocked: true, type: 'error', msg: `Too much: ${fmt(used)} already used + ${fmt(payingAmount)} now = ${fmt(after)}, but the UTR total is only ${fmt(total)}.` };
    if (total != null)
      return { blocked: false, type: 'success', msg: `After this payment: ${fmt(after)} of ${fmt(total)} used — ${fmt(total - after)} left on this UTR.` };
    return { blocked: false };
  }, [utr, total, used, after, payingAmount]);

  useEffect(() => { onBlockedChange?.(status.blocked); }, [status.blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!utr) return null;

  const agentName = (id) => agentList.find(a => a.uid === id)?.name || 'Other agent';

  return (
    <div style={{ marginTop: 10 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        UTR total (full bank transfer amount) {loading && <Spin size="small" style={{ marginLeft: 6 }} />}
      </Text>
      <InputNumber
        style={{ width: '100%', marginTop: 4 }}
        value={total}
        disabled={locked}
        min={0}
        precision={0}
        placeholder={`Leave empty if this UTR is only for this payment (${fmt(payingAmount)})`}
        onChange={(v) => setUtrTotalAmount(v)}
        formatter={v => v ? `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
        parser={v => v.replace(/[^\d]/g, '')}
      />
      {locked && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          Saved the first time this UTR was used.
        </div>
      )}

      {info?.entries?.length > 0 && (
        <div style={{ marginTop: 8, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: '6px 10px' }}>
          <Text style={{ fontSize: 11, fontWeight: 600 }}>Already used by this UTR</Text>
          {info.entries.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 }}>
              <span>
                <Tag style={{ fontSize: 10, margin: 0, marginRight: 4 }}>{TYPE_LABEL[e.paymentType] || e.paymentType}</Tag>
                {agentName(e.agentId)}{e.date ? ` · ${e.date}` : ''}
              </span>
              <strong>{fmt(e.amount)}</strong>
            </div>
          ))}
        </div>
      )}

      {status.msg && (
        <Alert type={status.type} showIcon message={status.msg} style={{ marginTop: 8, fontSize: 12 }} />
      )}
    </div>
  );
};

export default UtrAmountField;
