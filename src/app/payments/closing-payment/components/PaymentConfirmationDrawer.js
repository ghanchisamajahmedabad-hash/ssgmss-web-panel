import React from 'react';
import {
  Drawer, Space, Typography, Card, Row, Col, Tag, Avatar, Divider, Button,
  DatePicker, Input, Upload, Alert, Spin, Collapse, Checkbox, Switch, Empty
} from 'antd';
import {
  UserOutlined, DollarCircleOutlined, CalendarOutlined,
  UploadOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  WalletOutlined
} from '@ant-design/icons';
import UtrAmountField from '../../components/UtrAmountField';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

const METHOD_LABEL = {
  cash: 'Cash Payment', online: 'Online Transfer',
  advance: 'Agent Advance', memberAdvance: 'Member Advance',
};
const METHOD_COLOR = { cash: 'green', online: 'blue', advance: 'gold', memberAdvance: 'cyan' };
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const ClosingPaymentConfirmationDrawer = ({
  visible, onClose, onConfirm, uploading,
  processingPayments, selectedMembersData, closingGroupsMap,
  currentAgent, paymentMethod, transactionId, totalPaymentAmount,
  paymentDate, setPaymentDate, paymentNote, setPaymentNote,
  uploadedFile, setUploadedFile, colors,
  // closing-group selection
  groupOptions = [], selectedGroupIds = [], setSelectedGroupIds,
  // extra amount → member advance
  advanceCredits = [], allowsExtra = false, keepExtraAsAdvance, setKeepExtraAsAdvance,
  extraTotal = 0,
  notCharged = [], notChargedTotal = 0,
  // UTR sharing
  utrTotalAmount, setUtrTotalAmount, setUtrBlocked, utrBlocked = false, agentList = [],
}) => {

  // Group payments by member for display (members with only an advance
  // credit — all their groups unticked — still show up).
  const memberGrouped = {};
  const ensure = (memberId, name) => {
    if (!memberGrouped[memberId]) {
      const member = selectedMembersData?.find(m => m.id === memberId);
      memberGrouped[memberId] = {
        memberId, member,
        memberName: name || member?.displayName || '',
        groups: [], totalAmt: 0, credit: 0,
      };
    }
    return memberGrouped[memberId];
  };
  for (const p of processingPayments) {
    const g = ensure(p.memberId, p.memberName);
    g.groups.push(p);
    g.totalAmt += p.amount;
  }
  for (const c of advanceCredits) {
    const g = ensure(c.memberId, c.memberName);
    g.credit += c.amount;
  }
  const groupedList = Object.values(memberGrouped);

  const allGroupIds = groupOptions.map(g => g.id);
  const allChecked  = allGroupIds.length > 0 && selectedGroupIds.length === allGroupIds.length;
  const toggleGroup = (id, checked) =>
    setSelectedGroupIds(checked ? [...selectedGroupIds, id] : selectedGroupIds.filter(x => x !== id));

  const confirmDisabled = totalPaymentAmount <= 0 || (paymentMethod === 'online' && utrBlocked);

  return (
    <Drawer
      title={
        <Space size={12}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `linear-gradient(135deg, ${colors.primary}20 0%, ${colors.secondary}20 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarCircleOutlined style={{ color: colors.primary, fontSize: 20 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0 }}>Confirm Payment</Title>
            <Text type="secondary">
              {selectedGroupIds.length} of {groupOptions.length} closing group{groupOptions.length !== 1 ? 's' : ''} selected
            </Text>
          </div>
        </Space>
      }
      placement="right"
      size={650}
      onClose={onClose}
      destroyOnHidden
      open={visible}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={onConfirm} loading={uploading} disabled={confirmDisabled}
            style={{ background: colors.primary, borderColor: colors.primary }}>
            Confirm {fmt(totalPaymentAmount)}
          </Button>
        </Space>
      }
    >
      {uploading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Processing payments...</div>
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {/* Agent Info Summary */}
          <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
            <Row gutter={16} align="middle">
              <Col><Avatar src={currentAgent?.photoUrl} icon={<UserOutlined />} size={40} /></Col>
              <Col flex="auto">
                <Text strong>{currentAgent?.name}</Text>
                <div><Text type="secondary" style={{ fontSize: '12px' }}>{currentAgent?.phone1}</Text></div>
              </Col>
              <Col><Tag color="purple">{currentAgent?.caste}</Tag></Col>
            </Row>
          </Card>

          {/* ── Which closing groups to pay ── */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderColor: colors.primaryMid }}
            title={<Text strong style={{ color: colors.primary }}>Kaunse closing group ka jama karna hai?</Text>}
            extra={groupOptions.length > 1 && (
              <Checkbox
                checked={allChecked}
                indeterminate={selectedGroupIds.length > 0 && !allChecked}
                onChange={e => setSelectedGroupIds(e.target.checked ? allGroupIds : [])}
              >
                All
              </Checkbox>
            )}
          >
            {groupOptions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending closing groups for these members" />
            ) : groupOptions.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <Checkbox checked={selectedGroupIds.includes(g.id)} onChange={e => toggleGroup(g.id, e.target.checked)}>
                  <span style={{ fontWeight: 500 }}>{g.name}</span>
                  <div style={{ fontSize: 10, color: '#999' }}>
                    {g.subtitle}{g.subtitle ? ' · ' : ''}{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}
                  </div>
                </Checkbox>
                <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12 }}>
                  <div style={{ color: '#ff4d4f' }}>Pending {fmt(g.pending)}</div>
                  {selectedGroupIds.includes(g.id) && (
                    <div style={{ color: colors.primary, fontWeight: 600 }}>Paying {fmt(g.paying)}</div>
                  )}
                </div>
              </div>
            ))}
            {selectedGroupIds.length === 0 && groupOptions.length > 0 && (
              <Alert type="info" showIcon style={{ marginTop: 8, fontSize: 12 }}
                message="Koi group select nahi hai — sirf extra amount (agar hai) advance me jayega." />
            )}
          </Card>

          {notChargedTotal > 0 && (
            <Alert
              type="warning" showIcon style={{ marginBottom: 16, fontSize: 12 }}
              message={`${fmt(notChargedTotal)} is baar nahi katega`}
              description={
                <div>
                  <div style={{ marginBottom: 4 }}>
                    In members ka amount kisi ticked closing group me nahi gaya — group untick hai, ya member ka closing record (closing_payment) nahi mila:
                  </div>
                  {notCharged.map(x => (
                    <div key={x.memberId}>• {x.memberName}: {fmt(x.amount)}</div>
                  ))}
                </div>
              }
            />
          )}

          {/* Payment Summary Card */}
          <Card size="small" style={{ marginBottom: 16, border: `1px dashed ${colors.primary}`, background: `${colors.primary}08` }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">Payment Method</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color={METHOD_COLOR[paymentMethod] || 'default'} style={{ padding: '4px 12px' }}>
                    {METHOD_LABEL[paymentMethod] || paymentMethod}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Total Amount</Text>
                <Title level={4} style={{ margin: 0, color: colors.primary }}>
                  {fmt(totalPaymentAmount)}
                </Title>
                {extraTotal > 0 && (
                  <Text style={{ fontSize: 11, color: keepExtraAsAdvance ? '#059669' : '#9ca3af' }}>
                    incl. {fmt(extraTotal)} extra → {keepExtraAsAdvance ? 'member advance' : 'not taken'}
                  </Text>
                )}
              </Col>
              {paymentMethod === 'online' && (
                <Col span={24}>
                  <Text type="secondary">Transaction ID</Text>
                  <div style={{ marginTop: 4 }}><Text code>{transactionId}</Text></div>
                  <UtrAmountField
                    transactionId={transactionId}
                    utrTotalAmount={utrTotalAmount}
                    setUtrTotalAmount={setUtrTotalAmount}
                    payingAmount={totalPaymentAmount}
                    agentList={agentList}
                    onBlockedChange={setUtrBlocked}
                  />
                </Col>
              )}
            </Row>
          </Card>

          {/* Extra amount → member advance */}
          {allowsExtra && extraTotal > 0 && (
            <Card size="small" style={{ marginBottom: 16, background: '#f0fdf4', borderColor: '#a7f3d0' }}>
              <Row align="middle" gutter={12}>
                <Col><WalletOutlined style={{ fontSize: 20, color: '#059669' }} /></Col>
                <Col flex="auto">
                  <Text strong>Extra {fmt(extraTotal)} — member ke advance me daalein?</Text>
                  <div style={{ fontSize: 11, color: '#065f46' }}>
                    Pending se zyada jo diya, woh us member ke advance me jama hoga aur agli closing me "Member Advance" se kat sakta hai.
                  </div>
                </Col>
                <Col><Switch checked={keepExtraAsAdvance} onChange={setKeepExtraAsAdvance} /></Col>
              </Row>
            </Card>
          )}

          {/* Payment Date */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Payment Date</Text>
            <DatePicker style={{ width: '100%', marginTop: 4 }} value={paymentDate}
              onChange={setPaymentDate} format="DD/MM/YYYY" allowClear={false} size="middle"
              suffixIcon={<CalendarOutlined style={{ color: colors.primary }} />} />
          </div>

          {/* Online Payment Upload */}
          {paymentMethod === 'online' && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Upload Payment Screenshot (Optional)</Text>
              <Upload beforeUpload={(file) => { setUploadedFile(file); return false; }}
                onRemove={() => setUploadedFile(null)}
                fileList={uploadedFile ? [{ uid: '-1', name: uploadedFile.name, status: 'done' }] : []}
                maxCount={1} listType="picture" accept="image/*,.pdf">
                <Button size="middle" icon={<UploadOutlined />} style={{ marginTop: 4, width: '100%' }}>
                  Select File
                </Button>
              </Upload>
            </div>
          )}

          {/* Payment Note */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Note (Optional)</Text>
            <TextArea rows={3} placeholder="Add any notes about this payment..."
              value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} style={{ marginTop: 4 }} />
          </div>

          <Divider style={{ margin: '16px 0' }}>
            <Tag color="purple">Closing-wise Breakdown ({groupedList.length} members)</Tag>
          </Divider>

          {/* Per-member breakdown */}
          <Collapse bordered={false} ghost style={{ background: 'transparent' }}
            defaultActiveKey={groupedList.slice(0, 3).map(g => g.memberId)}>
            {groupedList.map(group => {
              const member = group.member;
              const mGroups = closingGroupsMap?.[group.memberId] || [];
              const shownCredit = keepExtraAsAdvance ? group.credit : 0;
              return (
                <Panel
                  key={group.memberId}
                  header={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space>
                        <Avatar src={member?.photoURL} icon={<UserOutlined />} size={28} />
                        <div>
                          <Text strong style={{ fontSize: 13 }}>{group.memberName}</Text>
                          <div style={{ fontSize: 10, color: '#999' }}>
                            {member?.registrationNumber || ''} · {group.groups.length} closing group{group.groups.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </Space>
                      <Tag color="purple" style={{ fontWeight: 600, fontSize: 12 }}>
                        {fmt(group.totalAmt + shownCredit)}
                      </Tag>
                    </div>
                  }
                  style={{ marginBottom: 8, borderRadius: 8, background: '#fafafa' }}
                >
                  <div style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', fontWeight: 600, padding: '6px 8px', background: '#f0f0f0', borderRadius: 4, marginBottom: 4 }}>
                      <div style={{ flex: 1 }}>Closing Group</div>
                      <div style={{ width: 80, textAlign: 'right' }}>Pending</div>
                      <div style={{ width: 90, textAlign: 'right' }}>Paying</div>
                      <div style={{ width: 80, textAlign: 'right' }}>Remaining</div>
                    </div>
                    {group.groups.map((g, i) => {
                      const grpDetail = mGroups.find(mg => mg.closingGroupId === g.closingGroupId) || {};
                      const pendingAmt = grpDetail.pendingAmount || 0;
                      const remaining = pendingAmt - g.amount;
                      return (
                        <div key={i} style={{ display: 'flex', padding: '5px 8px', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500 }}>{grpDetail.closingDetails?.[0]?.closed_memberName || grpDetail.closingGroupName || g.closingGroupId?.slice(-8) || '—'}</span>
                            <div style={{ fontSize: 10, color: '#999' }}>
                              {grpDetail.closingGroupName ? `${grpDetail.closingGroupName} · ` : ''}{grpDetail.closingCount || 0} event(s) · ₹{grpDetail.payAmount || 0}/event
                            </div>
                          </div>
                          <div style={{ width: 80, textAlign: 'right', color: '#ff4d4f' }}>{fmt(pendingAmt)}</div>
                          <div style={{ width: 90, textAlign: 'right', fontWeight: 600, color: colors.primary }}>{fmt(g.amount)}</div>
                          <div style={{ width: 80, textAlign: 'right', color: remaining <= 0 ? '#52c41a' : '#faad14' }}>
                            {remaining <= 0 ? <CheckCircleOutlined /> : fmt(remaining)}
                          </div>
                        </div>
                      );
                    })}
                    {group.credit > 0 && (
                      <div style={{ display: 'flex', padding: '5px 8px', alignItems: 'center', background: keepExtraAsAdvance ? '#f0fdf4' : '#fafafa' }}>
                        <div style={{ flex: 1, color: keepExtraAsAdvance ? '#065f46' : '#9ca3af' }}>
                          <WalletOutlined /> Extra → member advance
                        </div>
                        <div style={{ width: 90, textAlign: 'right', fontWeight: 600, color: keepExtraAsAdvance ? '#059669' : '#9ca3af', textDecoration: keepExtraAsAdvance ? 'none' : 'line-through' }}>
                          {fmt(group.credit)}
                        </div>
                        <div style={{ width: 80 }} />
                      </div>
                    )}
                  </div>
                </Panel>
              );
            })}
          </Collapse>

          {/* Summary Footer */}
          <Card size="small" style={{ marginTop: 16, background: colors.background }}>
            <Row justify="space-between">
              <Col><Text type="secondary">Members</Text><div><Text strong>{groupedList.length}</Text></div></Col>
              <Col><Text type="secondary">Groups</Text><div><Text strong>{processingPayments.length}</Text></div></Col>
              <Col><Text type="secondary">Total</Text><div><Text strong style={{ color: colors.primary }}>{fmt(totalPaymentAmount)}</Text></div></Col>
              <Col><Text type="secondary">Method</Text><div><Tag color={METHOD_COLOR[paymentMethod] || 'default'}>{METHOD_LABEL[paymentMethod] || paymentMethod}</Tag></div></Col>
            </Row>
          </Card>

          <Alert
            message="This action will update per-closing-group payment records and cannot be undone"
            type="warning" showIcon icon={<ExclamationCircleOutlined />} style={{ marginTop: 16 }}
          />
        </div>
      )}
    </Drawer>
  );
};

export default ClosingPaymentConfirmationDrawer;
