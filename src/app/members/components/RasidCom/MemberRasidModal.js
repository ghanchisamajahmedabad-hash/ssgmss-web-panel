"use client"
import React, { useEffect, useState } from 'react'
import { Modal, Spin, Empty, Tag, Space, Alert, message } from 'antd'
import { FilePdfOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { fetchMemberClosingEntries, groupIdOf, isEntryPaid } from './memberRasid'
import RasidDownloadButton from './RasidDownloadButton'

// Opened from the members table row menu. Lists every closing group the member
// has been charged for, each with its own download, plus All / Paid / Pending.
const MemberRasidModal = ({ member, open, onClose }) => {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !member?.id) return
    let alive = true
    setLoading(true)
    fetchMemberClosingEntries(member.id)
      .then(list => { if (alive) setEntries(list.filter(e => e.isReversed !== true)) })
      .catch(err => { console.error(err); message.error('Closing groups load nahi hue') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, member?.id])

  const paidCount = entries.filter(isEntryPaid).length
  const pendingCount = entries.length - paidCount

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnClose
      title={
        <div className="flex items-center gap-2">
          <FilePdfOutlined style={{ color: '#D3292F' }} />
          <span>सहयोग राशि रसीद — {member?.displayName} {member?.fatherName}</span>
          {member?.registrationNumber && <Tag style={{ margin: 0 }}>{member.registrationNumber}</Tag>}
        </div>
      }
    >
      <Spin spinning={loading}>
        {!loading && entries.length === 0 ? (
          <Empty description="इस सदस्य की कोई क्लोजिंग ग्रुप रसीद नहीं है" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3 p-3 bg-gray-50 rounded-lg border">
              <RasidDownloadButton member={member} entries={entries} which="all" size="small"
                style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}>
                All Rasid ({entries.length})
              </RasidDownloadButton>
              {paidCount > 0 && (
                <RasidDownloadButton member={member} entries={entries} which="paid" size="small"
                  style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}>
                  Paid ({paidCount})
                </RasidDownloadButton>
              )}
              {pendingCount > 0 && (
                <RasidDownloadButton member={member} entries={entries} which="pending" size="small"
                  style={{ background: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' }}>
                  Pending ({pendingCount})
                </RasidDownloadButton>
              )}
            </div>

            <div className="text-xs text-gray-500 mb-2">क्लोजिंग ग्रुप अनुसार रसीद</div>
            <div className="space-y-2" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {entries.map(e => {
                const paid = isEntryPaid(e)
                const partial = e.status === 'partial'
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2 border rounded-lg p-2 px-3"
                    style={{ borderLeft: `4px solid ${paid ? '#52c41a' : partial ? '#faad14' : '#ff4d4f'}` }}>
                    <div className="min-w-0">
                      <Space size={4} wrap>
                        <Tag color="purple" style={{ margin: 0 }}>{e.closingGroupName || groupIdOf(e).slice(-6) || '—'}</Tag>
                        <Tag color={paid ? 'green' : partial ? 'orange' : 'red'} style={{ margin: 0, fontSize: 10 }}>
                          {paid ? 'PAID' : partial ? 'PARTIAL' : 'PENDING'}
                        </Tag>
                      </Space>
                      <div className="text-xs text-gray-500 mt-1">
                        ₹{Number(e.totalAmount || 0).toLocaleString('en-IN')}
                        {' · '}{e.closingCount || (e.closingDetails || []).length || 0} closing
                        {partial && <> · paid ₹{Number(e.paidAmount || 0).toLocaleString('en-IN')}</>}
                        {' · '}{dayjs(e.date).format('DD MMM YYYY')}
                      </div>
                    </div>
                    <RasidDownloadButton member={member} entries={entries} which={e.id} size="small"
                      type="primary" icon={<DownloadOutlined />}
                      style={{ background: '#1B385A', borderColor: '#1B385A' }}>
                      Rasid
                    </RasidDownloadButton>
                  </div>
                )
              })}
            </div>
            <Alert type="info" showIcon className="mt-3" style={{ fontSize: 11 }}
              message="रसीद एजेंट रसीद जैसी ही बनती है — हर ग्रुप की अलग रसीद, बंद सदस्यों का विवरण उनके अपने रिकॉर्ड से।" />
          </>
        )}
      </Spin>
    </Modal>
  )
}

export default MemberRasidModal
