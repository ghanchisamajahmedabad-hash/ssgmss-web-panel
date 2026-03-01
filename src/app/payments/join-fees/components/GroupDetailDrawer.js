import React from 'react';
import {
  Drawer,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Divider,
  List,
  Avatar,
  Button
} from 'antd';
import {
  FileTextOutlined,
  UserOutlined,
  PrinterOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const GroupDetailDrawer = ({
  visible,
  onClose,
  group,
  programList,
  colors
}) => {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date.toDate?.() || date).format('DD MMM YYYY, hh:mm A');
  };

  if (!group) return null;

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined style={{ color: colors.primary }} />
          <span>Payment Group Details</span>
        </Space>
      }
      placement="right"
      width={500}
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
        {/* Group Header */}
        <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
          <Row gutter={[12, 12]}>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">Payment Method</Text>
                <Tag color={group.paymentMethod === 'cash' ? 'green' : 'blue'} style={{ padding: '4px 12px' }}>
                  {group.paymentMethod === 'cash' ? '💵 Cash' : '📱 Online'}
                </Tag>
              </div>
            </Col>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">Total Amount</Text>
                <Text strong style={{ fontSize: 20, color: colors.primary }}>
                  ₹{group.totalAmount?.toLocaleString()}
                </Text>
              </div>
            </Col>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">Payment Date</Text>
                <Text>{formatDate(group.paymentDate)}</Text>
              </div>
            </Col>
            {group.transactionId && (
              <Col span={24}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">Transaction ID</Text>
                  <Text code>{group.transactionId}</Text>
                </div>
              </Col>
            )}
            {group.paymentNote && (
              <Col span={24}>
                <Text type="secondary">Note</Text>
                <div style={{ background: colors.surface, padding: 8, borderRadius: 4, marginTop: 4 }}>
                  <Text>{group.paymentNote}</Text>
                </div>
              </Col>
            )}
          </Row>
        </Card>

        <Divider orientation="left">Transactions in this Group</Divider>

        <List
          itemLayout="horizontal"
          dataSource={group.transactions || []}
          renderItem={(transaction) => (
            <List.Item
              style={{
                padding: '12px',
                marginBottom: 8,
                background: colors.background,
                borderRadius: 8,
                border: `1px solid ${colors.border}`
              }}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} />}
                title={
                  <Space>
                    <Text strong>{transaction.memberName}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {transaction.registrationNumber}
                    </Text>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Space>
                      <Tag color="geekblue" style={{ fontSize: 11 }}>
                        ₹{transaction.amount?.toLocaleString()}
                      </Tag>
                      {transaction.programIds?.map(pid => {
                        const program = programList.find(p => p.id === pid);
                        return program ? (
                          <Tag key={pid} color="purple" style={{ fontSize: 11 }}>
                            {program.name}
                          </Tag>
                        ) : null;
                      })}
                    </Space>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Drawer>
  );
};

export default GroupDetailDrawer;