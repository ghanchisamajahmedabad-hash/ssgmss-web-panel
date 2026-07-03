import React, { useState } from 'react';
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
  Button,
  Popconfirm,
  message,
  Alert
} from 'antd';
import {
  FileTextOutlined,
  UserOutlined,
  CalendarOutlined,
  DeleteOutlined,
  WarningOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAuth } from 'firebase/auth';

const { Text } = Typography;

const TransactionDetailDrawer = ({
  visible,
  onClose,
  transaction,
  selectedMember,
  programList,
  colors,
  isSuperAdmin,
  onDeleteSuccess,
}) => {
  const [deleting, setDeleting] = useState(false);

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date?.toDate?.() || date).format('DD MMM YYYY, hh:mm A');
  };

  const getPaymentMethodIcon = (method) => method === 'cash' ? '💵' : '📱';

  const handleDelete = async () => {
    if (!transaction?.id) return;
    setDeleting(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/join-fees-revert-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ feeDocId: transaction.id }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Transaction reverted successfully');
        onClose();
        if (onDeleteSuccess) onDeleteSuccess(transaction);
      } else {
        message.error(data.message || 'Failed to revert transaction');
      }
    } catch (err) {
      message.error('Network error while reverting transaction');
    } finally {
      setDeleting(false);
    }
  };

  if (!transaction) return null;

  const programName = transaction.programName ||
    programList?.find(p => p.id === transaction.programId)?.name;

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined style={{ color: colors.primary }} />
          <span>Transaction Details</span>
        </Space>
      }
      placement="right"
      width={420}
      onClose={onClose}
      open={visible}
      extra={
        isSuperAdmin && (
          <Popconfirm
            title="Revert this transaction?"
            description={
              <span>
                ₹{transaction.amount?.toLocaleString()} will be <strong>reversed</strong> for {transaction.memberName}.
                This cannot be undone.
              </span>
            }
            icon={<WarningOutlined style={{ color: 'red' }} />}
            onConfirm={handleDelete}
            okText="Yes, Revert"
            okButtonProps={{ danger: true, loading: deleting }}
            cancelText="Cancel"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              size="small"
            >
              Revert
            </Button>
          </Popconfirm>
        )
      }
    >
      <div>
        {/* Payment Info */}
        <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
          <Descriptions column={1} bordered={false} size="small">
            <Descriptions.Item label="Transaction ID">
              <Text code style={{ fontSize: 11 }}>{transaction.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Amount">
              <Text strong style={{ fontSize: 22, color: colors.primary }}>
                ₹{transaction.amount?.toLocaleString()}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Payment Mode">
              <Tag color={transaction.paymentMode === 'cash' ? 'green' : 'blue'}>
                {getPaymentMethodIcon(transaction.paymentMode)}{' '}
                {transaction.paymentMode === 'cash' ? 'Cash' : 'Online'}
              </Tag>
            </Descriptions.Item>
            {transaction.transactionId && (
              <Descriptions.Item label="Reference ID">
                <Text code>{transaction.transactionId}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Date">
              <Space>
                <CalendarOutlined />
                {formatDate(transaction.transactionDate || transaction.createdAt)}
              </Space>
            </Descriptions.Item>
            {programName && (
              <Descriptions.Item label="Program">
                <Tag color="geekblue">{programName}</Tag>
              </Descriptions.Item>
            )}
            {transaction.paymentNote && (
              <Descriptions.Item label="Note">
                <div style={{ background: colors.surface, padding: 8, borderRadius: 4 }}>
                  {transaction.paymentNote}
                </div>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Created By">
              <Text type="secondary">{transaction.createdBy}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Group ID">
              <Text type="secondary" style={{ fontSize: 11 }}>{transaction.groupId}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Divider orientation="left">Member</Divider>

        <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
          <Row gutter={[16, 8]} align="middle">
            <Col>
              <Avatar
                src={selectedMember?.photoURL}
                icon={<UserOutlined />}
                size={44}
                style={{ background: colors.primary }}
              />
            </Col>
            <Col flex="auto">
              <Text strong style={{ fontSize: 14 }}>{transaction.memberName}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {transaction.memberRegNo || selectedMember?.registrationNumber}
                </Text>
              </div>
              {transaction.memberPhone && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {transaction.memberPhone}
                  </Text>
                </div>
              )}
            </Col>
          </Row>
        </Card>

        {isSuperAdmin && (
          <Alert
            message="Reverting this transaction will deduct ₹{amount} from this member's paid amount and increase their pending balance."
            description={`₹${transaction.amount?.toLocaleString()} will be reversed. Agent and program stats will also be updated.`}
            type="warning"
            showIcon
            icon={<WarningOutlined />}
          />
        )}
      </div>
    </Drawer>
  );
};

export default TransactionDetailDrawer;
