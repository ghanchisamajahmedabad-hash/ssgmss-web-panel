import React from 'react';
import {
  Drawer, Space, Typography, Card, Row, Col, Tag, Avatar,
  Divider, List, Button, DatePicker, Input, Upload, Alert, Spin, Progress
} from 'antd';
import {
  UserOutlined, DollarCircleOutlined, CalendarOutlined,
  UploadOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea }    = Input;

// ─── Join Fees Payment Confirmation Drawer ────────────────────────────────────
// Used in: JoinFeesMemberPaymentPage (/payments/join-fees/[agentId])
// Member fields used: pendingAmount, paidAmount, joinFees, paymentStatus
// ─────────────────────────────────────────────────────────────────────────────
const PaymentConfirmationDrawer = ({
  visible, onClose, onConfirm, uploading,
  processingPayments, selectedMembersData, memberPayments,
  currentAgent, paymentMethod, transactionId, totalPaymentAmount,
  paymentDate, setPaymentDate, paymentNote, setPaymentNote,
  uploadedFile, setUploadedFile, colors
}) => {
  return (
    <Drawer
      title={
        <Space size={12}>
          <div style={{ width:40,height:40,borderRadius:'50%',background:`linear-gradient(135deg,${colors.primary}20,${colors.secondary}20)`,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <DollarCircleOutlined style={{ color:colors.primary, fontSize:20 }} />
          </div>
          <div>
            <Title level={5} style={{ margin:0 }}>Confirm Join Fees Payment</Title>
            <Text type="secondary">Review before processing</Text>
          </div>
        </Space>
      }
      placement="right" width={600}
      onClose={onClose} open={visible}
      extra={
        <Space>
          <Button onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button type="primary" onClick={onConfirm} loading={uploading}
            style={{ background:colors.primary, borderColor:colors.primary }}>
            Confirm Payment
          </Button>
        </Space>
      }
    >
      {uploading ? (
        <div style={{ textAlign:'center', padding:'40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop:16, color:colors.primary, fontWeight:600 }}>Processing join fee payments...</div>
        </div>
      ) : (
        <div style={{ padding:'8px 0' }}>

          {/* ── Agent ── */}
          <Card size="small" style={{ marginBottom:16, background:colors.background }}>
            <Row gutter={16} align="middle">
              <Col><Avatar src={currentAgent?.photoUrl} icon={<UserOutlined/>} size={40} /></Col>
              <Col flex="auto">
                <Text strong>{currentAgent?.name}</Text>
                <div><Text type="secondary" style={{ fontSize:12 }}>{currentAgent?.phone1}</Text></div>
              </Col>
              <Col><Tag color="purple">{currentAgent?.caste}</Tag></Col>
            </Row>
          </Card>

          {/* ── Payment summary ── */}
          <Card size="small" style={{ marginBottom:16, border:`1px dashed ${colors.primary}`, background:`${colors.primary}08` }}>
            <Row gutter={[16,16]}>
              <Col span={12}>
                <Text type="secondary">Payment Method</Text>
                <div style={{ marginTop:4 }}>
                  <Tag color={paymentMethod==='cash'?'green':'blue'} style={{ padding:'4px 12px' }}>
                    {paymentMethod==='cash'?'💵 Cash Payment':'📱 Online Transfer'}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Total Amount</Text>
                <Title level={4} style={{ margin:0, color:colors.primary }}>
                  ₹{totalPaymentAmount.toLocaleString()}
                </Title>
              </Col>
              {paymentMethod==='online' && transactionId && (
                <Col span={24}>
                  <Text type="secondary">Transaction ID</Text>
                  <div style={{ marginTop:4 }}><Text code style={{ fontSize:13 }}>{transactionId}</Text></div>
                </Col>
              )}
            </Row>
          </Card>

          {/* ── Payment date ── */}
          <div style={{ marginBottom:16 }}>
            <Text type="secondary">Payment Date</Text>
            <DatePicker
              style={{ width:'100%', marginTop:4 }}
              value={paymentDate} onChange={setPaymentDate}
              format="DD/MM/YYYY" allowClear={false} size="middle"
              suffixIcon={<CalendarOutlined style={{ color:colors.primary }}/>}
            />
          </div>

          {/* ── File upload (online only) ── */}
          {paymentMethod==='online' && (
            <div style={{ marginBottom:16 }}>
              <Text type="secondary">Upload Payment Screenshot (Optional)</Text>
              <Upload
                beforeUpload={(file) => { setUploadedFile(file); return false; }}
                onRemove={() => setUploadedFile(null)}
                fileList={uploadedFile ? [{ uid:'-1', name:uploadedFile.name, status:'done' }] : []}
                maxCount={1} listType="picture"
                accept="image/*,.pdf"
              >
                {!uploadedFile && (
                  <Button size="middle" icon={<UploadOutlined/>} style={{ marginTop:4, width:'100%' }}>
                    Select File
                  </Button>
                )}
              </Upload>
              {uploadedFile && (
                <div style={{ marginTop:6, fontSize:11, color:colors.success }}>
                  ✓ {uploadedFile.name} ({(uploadedFile.size/1024).toFixed(1)} KB) — will upload on confirm
                </div>
              )}
            </div>
          )}

          {/* ── Note ── */}
          <div style={{ marginBottom:16 }}>
            <Text type="secondary">Note (Optional)</Text>
            <TextArea rows={3} placeholder="Add any notes about this payment..." value={paymentNote}
              onChange={e=>setPaymentNote(e.target.value)} style={{ marginTop:4 }} />
          </div>

          <Divider style={{ margin:'16px 0' }}>
            <Tag color="pink">Join Fees — {selectedMembersData?.length || 0} Members</Tag>
          </Divider>

          {/* ── Member list ── */}
          <List
            itemLayout="horizontal"
            dataSource={selectedMembersData || []}
            renderItem={member => {
              const amount       = parseFloat(memberPayments?.[member.id]) || 0;
              // Join fees specific fields
              const pending      = Number(member.pendingAmount     || 0);
              const paid         = Number(member.paidAmount        || 0);
              const totalFees    = Number(member.joinFees          || 0);
              const afterPending = Math.max(0, pending - amount);
              const newPaid      = paid + amount;
              const newPct       = totalFees > 0 ? Math.min(Math.round((newPaid / totalFees) * 100), 100) : 0;
              const willClear    = afterPending === 0 && amount > 0;

              return (
                <List.Item style={{ padding:'12px', marginBottom:8, background:colors.background, borderRadius:8, border:`1px solid ${colors.border}` }}>
                  <List.Item.Meta
                    avatar={<Avatar src={member.photoURL} icon={<UserOutlined/>} />}
                    title={
                      <Space>
                        <Text strong>{member.displayName}</Text>
                        <Text type="secondary" style={{ fontSize:11 }}>{member.registrationNumber}</Text>
                      </Space>
                    }
                    description={
                      <div>
                        <Space size={4} wrap style={{ marginBottom: 4 }}>
                          {member.programName && (
                            <Tag color="geekblue" style={{ fontSize:11 }}>{member.programName}</Tag>
                          )}
                          <Tag color="orange" style={{ fontSize:11 }}>
                            Pending: ₹{pending.toLocaleString()}
                          </Tag>
                          <Tag color="default" style={{ fontSize:11 }}>
                            Total Fees: ₹{totalFees.toLocaleString()}
                          </Tag>
                          {willClear && (
                            <Tag icon={<CheckCircleOutlined/>} color="success" style={{ fontSize:11 }}>Fully Paid</Tag>
                          )}
                        </Space>
                        {/* Progress bar showing new paid % after this payment */}
                        {totalFees > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <Progress
                              percent={newPct}
                              size="small"
                              strokeColor={willClear ? '#52c41a' : colors.primary}
                              format={(p) => <span style={{ fontSize:10 }}>{p}%</span>}
                            />
                          </div>
                        )}
                      </div>
                    }
                  />
                  <div style={{ textAlign:'right', minWidth:90 }}>
                    <Tag color="pink" style={{ fontSize:13, padding:'4px 12px', fontWeight:600 }}>
                      ₹{amount.toLocaleString()}
                    </Tag>
                    {afterPending > 0 && (
                      <div style={{ fontSize:10, color:colors.warning, marginTop:2 }}>
                        Still due: ₹{afterPending.toLocaleString()}
                      </div>
                    )}
                    {willClear && (
                      <div style={{ fontSize:10, color:'#52c41a', marginTop:2 }}>
                        ✓ Balance cleared
                      </div>
                    )}
                  </div>
                </List.Item>
              );
            }}
          />

          {/* ── Footer summary ── */}
          <Card size="small" style={{ marginTop:16, background:colors.background }}>
            <Row justify="space-between">
              <Col><Text type="secondary">Members</Text><div><Text strong>{selectedMembersData?.length || 0}</Text></div></Col>
              <Col><Text type="secondary">Total</Text><div><Text strong style={{ color:colors.primary }}>₹{totalPaymentAmount.toLocaleString()}</Text></div></Col>
              <Col>
                <Text type="secondary">Method</Text>
                <div><Tag color={paymentMethod==='cash'?'green':'blue'}>{paymentMethod==='cash'?'Cash':'Online'}</Tag></div>
              </Col>
            </Row>
          </Card>

          <Alert message="This action will update member join fee records and cannot be undone"
            type="warning" showIcon icon={<ExclamationCircleOutlined/>} style={{ marginTop:16 }} />
        </div>
      )}
    </Drawer>
  );
};

export default PaymentConfirmationDrawer;