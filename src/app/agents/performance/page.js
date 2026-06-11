"use client"
import React, { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Tag, Select, Row, Col, Statistic, Avatar, Spin,
  Typography, Space, Divider, Progress, Badge, Tooltip, message,
  Grid, Tabs
} from 'antd'
import {
  TrophyOutlined, UserOutlined, DollarOutlined, RiseOutlined,
  TeamOutlined, WalletOutlined, PercentageOutlined,
  FireOutlined, StarOutlined, CrownOutlined, GoldOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import { auth } from '../../../../lib/firbase-client'


const { Title, Text } = Typography
const { useBreakpoint } = Grid

const periods = [
  { label: 'Today',     value: 'daily' },
  { label: 'This Week', value: 'weekly' },
  { label: 'This Month', value: 'monthly' },
  { label: 'This Year', value: 'yearly' },
  { label: 'All Time',  value: 'all' },
]

const metrics = [
  { label: 'Overall Score',  value: 'overall',   icon: <StarOutlined /> },
  { label: 'Members Joined', value: 'members',   icon: <TeamOutlined /> },
  { label: 'Join Fees',      value: 'joinFees',  icon: <DollarOutlined /> },
  { label: 'Closing Fees',   value: 'closing',   icon: <WalletOutlined /> },
  { label: 'Commission',     value: 'commission',icon: <RiseOutlined /> },
  { label: 'Efficiency',     value: 'efficiency',icon: <PercentageOutlined /> },
]

const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']
const rankIcons   = [<CrownOutlined />, <GoldOutlined />, <FireOutlined />]

export default function AgentPerformance() {
  const { user, can } = useAuth()
  const screens = useBreakpoint()
  const [period, setPeriod] = useState('monthly')
  const [metric, setMetric] = useState('overall')
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState(null)
  const [top3Metric, setTop3Metric] = useState('overall')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/agents/performance?period=${period}&metric=${metric}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setAgents(data.agents)
        setDateRange(data.dateRange)
      } else {
        message.error(data.message)
      }
    } catch (e) {
      console.error(e)
      message.error('Failed to fetch performance data')
    } finally {
      setLoading(false)
    }
  }, [period, metric, user])

  useEffect(() => { if (user) fetchData() }, [fetchData, user])

  const getMetricValue = (agent, key) => {
    switch (key) {
      case 'overall': return agent.score || 0
      case 'members': return agent.periodNewMembers || 0
      case 'joinFees': return agent.periodJoinFees || 0
      case 'closing': return agent.periodClosing || 0
      case 'commission': return agent.periodCommission || 0
      case 'efficiency': return agent.efficiency || 0
      default: return agent.score || 0
    }
  }

  const getMetricSuffix = (key) => {
    switch (key) {
      case 'members': return ' members'
      case 'efficiency': return '%'
      default: return ''
    }
  }

  const formatCurrency = (val) => {
    if (!val && val !== 0) return '—'
    return '₹' + val.toLocaleString('en-IN')
  }

  // Top agents for the hero section
  const topAgents = [...agents].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3)

  const columns = [
    {
      title: '#', key: 'rank', width: 60,
      render: (_, __, idx) => (
        <Space>
          {idx < 3 ? (
            <Avatar size={28} style={{ backgroundColor: rankColors[idx], color: '#000' }}>
              {rankIcons[idx]}
            </Avatar>
          ) : (
            <Text strong style={{ width: 28, textAlign: 'center', display: 'inline-block' }}>
              {idx + 1}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: 'Agent', dataIndex: 'name', key: 'name', width: 220,
      render: (name, r) => (
        <Space>
          <Avatar src={r.photoUrl} icon={<UserOutlined />} />
          <div>
            <Text strong>{name}</Text>
            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.village}{r.village && r.district ? ', ' : ''}{r.district}</Text></div>
          </div>
        </Space>
      )
    },
    {
      title: 'Members Joined', dataIndex: 'periodNewMembers', key: 'members', width: 140, align: 'center',
      render: (val) => <Text strong style={{ fontSize: 16 }}>{val || 0}</Text>,
      sorter: (a, b) => (a.periodNewMembers || 0) - (b.periodNewMembers || 0),
    },
    {
      title: 'Join Fees', dataIndex: 'periodJoinFees', key: 'joinFees', width: 140, align: 'right',
      render: (val) => <Text strong style={{ color: '#1890ff' }}>{formatCurrency(val)}</Text>,
      sorter: (a, b) => (a.periodJoinFees || 0) - (b.periodJoinFees || 0),
    },
    {
      title: 'Closing Paid', dataIndex: 'periodClosing', key: 'closing', width: 140, align: 'right',
      render: (val) => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(val)}</Text>,
      sorter: (a, b) => (a.periodClosing || 0) - (b.periodClosing || 0),
    },
    {
      title: 'Commission', dataIndex: 'periodCommission', key: 'commission', width: 140, align: 'right',
      render: (val) => <Text strong style={{ color: '#fa8c16' }}>{formatCurrency(val)}</Text>,
      sorter: (a, b) => (a.periodCommission || 0) - (b.periodCommission || 0),
    },
    {
      title: 'Efficiency', dataIndex: 'efficiency', key: 'efficiency', width: 160,
      render: (val) => (
        <Tooltip title={`${val}% collection rate`}>
          <Progress percent={Math.min(val, 100)} size="small" strokeColor={val >= 80 ? '#52c41a' : val >= 50 ? '#faad14' : '#ff4d4f'} />
        </Tooltip>
      ),
      sorter: (a, b) => (a.efficiency || 0) - (b.efficiency || 0),
    },
    {
      title: 'Score', dataIndex: 'score', key: 'score', width: 110, align: 'center',
      render: (val, r) => {
        const color = val >= 80 ? '#52c41a' : val >= 50 ? '#faad14' : '#ff4d4f'
        return (
          <Badge count={<Text style={{ color, fontWeight: 700, fontSize: 15 }}>{val || 0}</Text>} />
        )
      },
      defaultSortOrder: 'descend',
      sorter: { compare: (a, b) => (a.score || 0) - (b.score || 0) },
    },
  ]

  const top3Columns = [
    {
      title: 'Metric', dataIndex: 'label', key: 'label', width: 120,
    },
    ...topAgents.map((agent, i) => ({
      title: (
        <Space size={4}>
          <Avatar src={agent.photoUrl} icon={<UserOutlined />} size={20} />
          <Text strong>{i + 1}. {agent.name}</Text>
        </Space>
      ),
      dataIndex: agent.id, key: agent.id, align: 'right',
      render: (val) => {
        if (val === undefined || val === null) return '—'
        if (top3Metric === 'efficiency') return `${val.toFixed(1)}%`
        if (top3Metric === 'members') return val
        return formatCurrency(val)
      }
    }))
  ]

  const top3Data = [
    { label: 'Score', ...Object.fromEntries(topAgents.map(a => [a.id, a.score || 0])) },
    { label: 'Members Joined', ...Object.fromEntries(topAgents.map(a => [a.id, a.periodNewMembers || 0])) },
    { label: 'Join Fees', ...Object.fromEntries(topAgents.map(a => [a.id, a.periodJoinFees || 0])) },
    { label: 'Closing Paid', ...Object.fromEntries(topAgents.map(a => [a.id, a.periodClosing || 0])) },
    { label: 'Commission', ...Object.fromEntries(topAgents.map(a => [a.id, a.periodCommission || 0])) },
    { label: 'Efficiency', ...Object.fromEntries(topAgents.map(a => [a.id, (a.efficiency || 0).toFixed(1)])) },
  ]

  return (
    <div style={{ padding: screens.xs ? 12 : 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          <TrophyOutlined style={{ color: '#faad14', marginRight: 8 }} />
          Agent Performance Rankings
        </Title>
        <Space wrap>
          <Select
            value={period}
            onChange={setPeriod}
            options={periods}
            style={{ width: 140 }}
          />
          <Select
            value={metric}
            onChange={setMetric}
            options={metrics}
            style={{ width: 180 }}
          />
        </Space>
      </div>

      {dateRange && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Period: {new Date(dateRange.start).toLocaleDateString()} – {new Date(dateRange.end).toLocaleDateString()}
        </Text>
      )}

      <Spin spinning={loading}>

        {topAgents.length > 0 && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              {topAgents.map((agent, i) => {
                const metricVal = getMetricValue(agent, top3Metric)
                const maxVal = Math.max(1, ...topAgents.map(a => getMetricValue(a, top3Metric)))
                const pct = (metricVal / maxVal) * 100
                return (
                  <Col xs={24} sm={8} key={agent.id}>
                    <Card
                      hoverable
                      style={{
                        borderTop: `4px solid ${rankColors[i]}`,
                        textAlign: 'center',
                        boxShadow: i === 0 ? '0 4px 12px rgba(255,215,0,0.3)' : undefined,
                      }}
                    >
                      <Avatar
                        size={64}
                        src={agent.photoUrl}
                        icon={<UserOutlined />}
                        style={{ border: `3px solid ${rankColors[i]}`, marginBottom: 8 }}
                      />
                      <div>
                        <Space>
                          {rankIcons[i]}
                          <Text strong style={{ fontSize: 16 }}>{agent.name}</Text>
                        </Space>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{agent.village}</Text>
                      <Divider style={{ margin: '8px 0' }} />
                      <Progress
                        type="dashboard"
                        percent={Math.round(pct)}
                        size={80}
                        strokeColor={rankColors[i]}
                        format={() => (
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{metricVal}</div>
                            <div style={{ fontSize: 9, lineHeight: 1.2 }}>{metrics.find(m => m.value === top3Metric)?.label}</div>
                          </div>
                        )}
                      />
                      <div style={{ marginTop: 8 }}>
                        <Space size={12} wrap style={{ justifyContent: 'center' }}>
                          <Statistic title="Members" value={agent.periodNewMembers || 0} prefix={<TeamOutlined />} valueStyle={{ fontSize: 14 }} />
                          <Statistic title="Commission" value={agent.periodCommission || 0} prefix="₹" valueStyle={{ fontSize: 14, color: '#fa8c16' }} />
                        </Space>
                      </div>
                    </Card>
                  </Col>
                )
              })}
            </Row>

            <Card size="small" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>Top 3 Comparison</Text>
                <Select
                  size="small"
                  value={top3Metric}
                  onChange={setTop3Metric}
                  options={metrics}
                  style={{ width: 150 }}
                />
              </div>
              <Table
                dataSource={top3Data}
                columns={top3Columns}
                pagination={false}
                size="small"
                rowKey="label"
                bordered
              />
            </Card>
          </>
        )}

        <Table
          dataSource={agents}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
          scroll={{ x: 1100 }}
          size="middle"
          bordered
          locale={{ emptyText: 'No agent data found for this period' }}
        />
      </Spin>
    </div>
  )
}
