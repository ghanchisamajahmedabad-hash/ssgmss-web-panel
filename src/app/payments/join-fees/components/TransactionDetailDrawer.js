import React from 'react';
import {
  Drawer,
  Space,
  Typography,
  Card,
  Descriptions,
  Tag,
  Avatar,
  Row,
  Col,
  Divider,
  Button
} from 'antd';
import {
  FileTextOutlined,
  UserOutlined,
  CalendarOutlined,
  PrinterOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const TransactionDetailDrawer = ({
  visible,
  onClose,
  transaction,
  selectedMember,
  programList,
  colors
}) => {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date).format('DD MMM YYYY, hh:mm A');
  };

  const getPaymentMethodIcon = (method) => {
    return method === 'cash' ? '💵' : '📱';
  };

  if (!transaction) return null;

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined style={{ color: colors.primary }} />
          <span>Transaction Details</span>
        </Space>
      }
      placement="right"
      width={400}
      onClose={onClose}
      open={visible}
    //   extra={
    //     <Space>
    //       <Button icon={<PrinterOutlined />}>Print</Button>
    //       <Button type="primary" icon={<DownloadOutlined />}>Download</Button>
    //     </Space>
    //   }
    >
      <div>
        <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
          <Descriptions column={1} bordered={false} size="small">
            <Descriptions.Item label="Transaction ID">
              <Text code>{transaction.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Amount">
              <Text strong style={{ fontSize: 20, color: colors.primary }}>
                ₹{transaction.amount?.toLocaleString()}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Payment Mode">
              <Tag color={transaction.paymentMode === 'cash' ? 'green' : 'blue'}>
                {getPaymentMethodIcon(transaction.paymentMode)} {transaction.paymentMode === 'cash' ? 'Cash' : 'Online'}
              </Tag>
            </Descriptions.Item>
            {transaction.transactionId && (
              <Descriptions.Item label="Reference ID">
                <Text>{transaction.transactionId}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Date">
              <Space>
                <CalendarOutlined />
                {formatDate(transaction.transactionDate || transaction.createdAt)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Programs">
              {transaction.programIds?.map(pid => {
                const program = programList.find(p => p.id === pid);
                return program ? (
                  <Tag key={pid} color="geekblue">{program.name}</Tag>
                ) : null;
              })}
            </Descriptions.Item>
            {transaction.paymentNote && (
              <Descriptions.Item label="Note">
                <div style={{ background: colors.surface, padding: 8, borderRadius: 4 }}>
                  {transaction.paymentNote}
                </div>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Created By">
              <Text>{transaction.createdBy}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Group ID">
              <Text type="secondary">{transaction.groupId}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Divider orientation="left">Member Information</Divider>
        
        <Card size="small" style={{ background: colors.background }}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Space>
                <Avatar 
                  src={selectedMember?.photoURL} 
                  icon={<UserOutlined />}
                  size={40}
                />
                <div>
                  <Text strong>{transaction.memberName}</Text>
                  <div>
                    <Text type="secondary">{transaction.registrationNumber}</Text>
                  </div>
                </div>
              </Space>
            </Col>
          </Row>
        </Card>
      </div>
    </Drawer>
  );
};

export default TransactionDetailDrawer;