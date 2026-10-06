'use client'
// Search Index Rebuild
//
// The search box queries `search_keywords`, which was only written when a
// member was created or approved — never when one was edited. Members edited
// before that was fixed still answer to their old name, phone or village. This
// rebuilds the index from each member's current details.
//
// Runs in passes with a cursor so a large collection can't time out, and is
// safe to re-run: members whose index already matches are skipped.

import React, { useState } from 'react'
import { useAuth } from '@/components/Base/AuthProvider'
import {
  Card, Button, Typography, Space, Alert, Progress, Row, Col, Statistic,
  Table, Tag, message, Result,
} from 'antd'
import {
  SearchOutlined, PlayCircleOutlined, ThunderboltOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { auth } from '../../../../lib/firbase-client'

const { Title, Text } = Typography

const C = {
  primary: '#db2777', success: '#16a34a', info: '#2563eb',
  warning: '#f59e0b', border: '#fde2d8', muted: '#6b7280', bg: '#fff8f5',
}

const SearchIndexPage = () => {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'

  const [running, setRunning] = useState(false)
  const [mode, setMode]       = useState(null)      // 'check' | 'fix'
  const [stats, setStats]     = useState(null)
  const [samples, setSamples] = useState([])
  const [pages, setPages]     = useState(0)

  const run = async (dryRun) => {
    setRunning(true)
    setMode(dryRun ? 'check' : 'fix')
    setStats(null); setSamples([]); setPages(0)

    const agg = { scanned: 0, updated: 0, unchanged: 0, skipped: 0 }
    const seen = []
    let cursor = null
    let guard = 0

    try {
      const token = await auth.currentUser?.getIdToken()
      do {
        const res = await fetch('/api/members/rebuild-search-index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cursor, pageSize: 300, dryRun }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'Request failed')

        agg.scanned   += data.scanned
        agg.updated   += data.updated
        agg.unchanged += data.unchanged
        agg.skipped   += data.skipped
        if (seen.length < 10) seen.push(...(data.samples || []).slice(0, 10 - seen.length))

        cursor = data.nextCursor
        setStats({ ...agg })
        setSamples([...seen])
        setPages(p => p + 1)
      } while (cursor && ++guard < 200)   // 200 x 300 = 60,000 members

      message.success(
        dryRun
          ? `जाँच पूरी — ${agg.updated} सदस्यों का index पुराना है`
          : `${agg.updated} सदस्यों का search index दोबारा बन गया`
      )
    } catch (e) {
      message.error('विफल: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <Result status="403" title="केवल सुपरएडमिन"
          subTitle="सर्च index दोबारा बनाने की अनुमति सिर्फ़ सुपरएडमिन को है।" />
      </div>
    )
  }

  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: C.primary }}>
          <SearchOutlined /> सर्च index दोबारा बनाएँ
        </Title>
        <Text style={{ fontSize: 12, color: C.muted }}>
          जो सदस्य पहले edit हो चुके हैं, उन्हें उनके मौजूदा नाम/फोन/गाँव से खोजने लायक बनाता है।
        </Text>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
        message="यह क्या ठीक करता है"
        description={
          <span style={{ fontSize: 12 }}>
            सर्च बॉक्स <code>search_keywords</code> पर चलता है, जो पहले सिर्फ़ सदस्य बनाते या approve
            करते समय लिखा जाता था — edit पर कभी नहीं। इसलिए edit किया हुआ सदस्य अपने <b>पुराने</b> नाम,
            फोन या गाँव से ही मिलता था। यह हर सदस्य का index उसकी <b>मौजूदा</b> जानकारी से दोबारा बनाता है।
            कुछ और नहीं बदलता — न कोई रकम, न स्थिति। दोबारा चलाना भी सुरक्षित है।
          </span>
        }
      />

      <Card size="small" style={{ borderRadius: 12, borderColor: C.border, marginBottom: 12 }}>
        <Space wrap>
          <Button icon={<PlayCircleOutlined />} loading={running && mode === 'check'}
            disabled={running} onClick={() => run(true)}>
            पहले जाँचें
          </Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={running && mode === 'fix'}
            disabled={running} onClick={() => run(false)}
            style={{ background: C.primary }}>
            index दोबारा बनाएँ
          </Button>
          {running && <Text style={{ fontSize: 12, color: C.muted }}>पास {pages} चल रहा है…</Text>}
        </Space>
        {running && <Progress percent={100} status="active" showInfo={false} strokeColor={C.primary} style={{ marginTop: 10 }} />}
        {stats && mode === 'check' && !running && (
          <Text style={{ display: 'block', marginTop: 8, fontSize: 11, color: C.muted }}>
            यह सिर्फ़ जाँच थी — अभी कुछ नहीं बदला।
          </Text>
        )}
      </Card>

      {stats && (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
            {[
              { t: 'देखे गए',                         v: stats.scanned,   c: C.info },
              { t: mode === 'fix' ? 'ठीक किए' : 'पुराने', v: stats.updated, c: C.warning },
              { t: 'पहले से सही',                      v: stats.unchanged, c: C.success },
              { t: 'छोड़े गए (हटाए हुए)',               v: stats.skipped,   c: C.muted },
            ].map((s, i) => (
              <Col xs={12} md={6} key={i}>
                <Card size="small" style={{ borderRadius: 10, borderColor: C.border, textAlign: 'center' }}>
                  <Statistic title={<span style={{ fontSize: 11 }}>{s.t}</span>}
                    value={s.v} valueStyle={{ color: s.c, fontSize: 22 }} />
                </Card>
              </Col>
            ))}
          </Row>

          {mode === 'fix' && !running && (
            <Alert
              type="success" showIcon icon={<CheckCircleOutlined />}
              style={{ marginBottom: 12, borderRadius: 10 }}
              message={`${stats.updated} सदस्यों का search index दोबारा बन गया`}
              description={<span style={{ fontSize: 12 }}>अब इन्हें इनके मौजूदा नाम, फोन, गाँव और रजि. नंबर से खोजा जा सकता है।</span>}
            />
          )}

          {samples.length > 0 && (
            <Card size="small" title={<span style={{ fontSize: 13 }}>कुछ उदाहरण</span>}
              style={{ borderRadius: 12, borderColor: C.border }}>
              <Table
                size="small" rowKey="memberId" pagination={false}
                dataSource={samples}
                columns={[
                  { title: 'सदस्य', dataIndex: 'name', render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
                  { title: 'रजि. नं.', dataIndex: 'registrationNumber', width: 140,
                    render: v => <Tag color="blue" style={{ fontSize: 11 }}>{v || '—'}</Tag> },
                  { title: 'पहले', dataIndex: 'before', width: 90,
                    render: v => <span style={{ fontSize: 12, color: C.muted }}>{v} शब्द</span> },
                  { title: 'अब', dataIndex: 'after', width: 90,
                    render: v => <span style={{ fontSize: 12, color: C.success }}>{v} शब्द</span> },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default SearchIndexPage
