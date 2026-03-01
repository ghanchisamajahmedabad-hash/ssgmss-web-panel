import React from 'react';
import {
  Drawer,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Avatar,
  Divider,
  List,
  Button,
  DatePicker,
  Input,
  Upload,
  Alert,
  Spin
} from 'antd';
import {
  UserOutlined,
  DollarCircleOutlined,
  WalletOutlined,
  CalendarOutlined,
  UploadOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

const PaymentConfirmationDrawer = ({
  visible,
  onClose,
  onConfirm,
  uploading,
  processingPayments,
  selectedMembersData,
  memberPayments,
  currentAgent,
  paymentMethod,
  transactionId,
  totalPaymentAmount,
  paymentDate,
  setPaymentDate,
  paymentNote,
  setPaymentNote,
  uploadedFile,
  setUploadedFile,
  colors
}) => {
  return (
    <Drawer
      title={
        <Space size={12}>
          <div style={{ 
            width: 40, 
            height: 40, 
            borderRadius: '50%', 
            background: `linear-gradient(135deg, ${colors.primary}20 0%, ${colors.secondary}20 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <DollarCircleOutlined style={{ color: colors.primary, fontSize: 20 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0 }}>Confirm Payment</Title>
            <Text type="secondary">Review payment details before processing</Text>
          </div>
        </Space>
      }
      placement="right"
      width={600}
      onClose={onClose}
      open={visible}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="primary" 
            onClick={onConfirm}
            loading={uploading}
            style={{ background: colors.primary, borderColor: colors.primary }}
          >
            Confirm Payment
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
              <Col>
                <Avatar src={currentAgent?.photoUrl} icon={<UserOutlined />} size={40} />
              </Col>
              <Col flex="auto">
                <Text strong>{currentAgent?.name}</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>{currentAgent?.phone1}</Text>
                </div>
              </Col>
              <Col>
                <Tag color="purple">{currentAgent?.caste}</Tag>
              </Col>
            </Row>
          </Card>

          {/* Payment Summary Card */}
          <Card 
            size="small" 
            style={{ 
              marginBottom: 16,
              border: `1px dashed ${colors.primary}`,
              background: `${colors.primary}08`
            }}
          >
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">Payment Method</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color={paymentMethod === 'cash' ? 'green' : 'blue'} style={{ padding: '4px 12px' }}>
                    {paymentMethod === 'cash' ? '💵 Cash Payment' : '📱 Online Transfer'}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Total Amount</Text>
                <Title level={4} style={{ margin: 0, color: colors.primary }}>
                  ₹{totalPaymentAmount.toLocaleString()}
                </Title>
              </Col>
              {paymentMethod === 'online' && (
                <Col span={24}>
                  <Text type="secondary">Transaction ID</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text code style={{ fontSize: '13px' }}>{transactionId}</Text>
                  </div>
                </Col>
              )}
            </Row>
          </Card>

          {/* Payment Date */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Payment Date</Text>
            <DatePicker 
              style={{ width: '100%', marginTop: 4 }}
              value={paymentDate}
              onChange={setPaymentDate}
              format="DD/MM/YYYY"
              allowClear={false}
              size="middle"
              suffixIcon={<CalendarOutlined style={{ color: colors.primary }} />}
            />
          </div>

          {/* Online Payment Upload */}
          {paymentMethod === 'online' && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Upload Payment Screenshot (Optional)</Text>
              <Upload
                beforeUpload={(file) => {
                  setUploadedFile(file);
                  return false;
                }}
                onRemove={() => setUploadedFile(null)}
                maxCount={1}
                listType="picture"
              >
                <Button 
                  size="middle" 
                  icon={<UploadOutlined />}
                  style={{ marginTop: 4, width: '100%' }}
                >
                  Select File
                </Button>
              </Upload>
            </div>
          )}

          {/* Payment Note */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Note (Optional)</Text>
            <TextArea
              rows={3}
              placeholder="Add any notes about this payment..."
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>

          <Divider style={{ margin: '16px 0' }}>
            <Tag color="purple">Selected Members ({selectedMembersData.length})</Tag>
          </Divider>

          {/* Selected Members List */}
          <List
            itemLayout="horizontal"
            dataSource={selectedMembersData}
            renderItem={member => {
              const amount = parseFloat(memberPayments[member.id]) || 0;
              return (
                <List.Item
                  style={{ 
                    padding: '12px',
                    marginBottom: 8,
                    background: colors.background,
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <List.Item.Meta
                    avatar={<Avatar src={member.photoURL} icon={<UserOutlined />} />}
                    title={
                      <Space>
                        <Text strong>{member.displayName}</Text>
                        <Text type="secondary" style={{ fontSize: '11px' }}>{member.registrationNumber}</Text>
                      </Space>
                    }
                    description={
                      <Space size={4}>
                        <Tag color="geekblue" style={{ fontSize: '11px' }}>
                          {member.programPaymentSummary?.totalPrograms || 0} Programs
                        </Tag>
                        <Tag color="orange" style={{ fontSize: '11px' }}>
                          Pending: ₹{member.pendingAmount.toLocaleString()}
                        </Tag>
                      </Space>
                    }
                  />
                  <div>
                    <Tag color="purple" style={{ fontSize: '13px', padding: '4px 12px' }}>
                      ₹{amount.toLocaleString()}
                    </Tag>
                  </div>
                </List.Item>
              );
            }}
          />

          {/* Payment Summary Footer */}
          <Card size="small" style={{ marginTop: 16, background: colors.background }}>
            <Row justify="space-between">
              <Col>
                <Text type="secondary">Total Members</Text>
                <div><Text strong>{selectedMembersData.length}</Text></div>
              </Col>
              <Col>
                <Text type="secondary">Total Amount</Text>
                <div><Text strong style={{ color: colors.primary }}>₹{totalPaymentAmount.toLocaleString()}</Text></div>
              </Col>
              <Col>
                <Text type="secondary">Payment Method</Text>
                <div>
                  <Tag color={paymentMethod === 'cash' ? 'green' : 'blue'}>
                    {paymentMethod === 'cash' ? 'Cash' : 'Online'}
                  </Tag>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Warning Message */}
          <Alert
            message="This action will update member payment records and cannot be undone"
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            style={{ marginTop: 16 }}
          />
        </div>
      )}
    </Drawer>
  );
};

export default PaymentConfirmationDrawer;