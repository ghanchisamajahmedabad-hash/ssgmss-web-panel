"use client"
import React, { useState } from 'react'
import { Button, Tooltip, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { downloadMemberRasid } from './memberRasid'

// One-click receipt download for a single member.
//   which: 'all' | 'paid' | 'pending' | <closing_payment id / groupId>
//   entries: the member's closing_payment docs if already loaded (else fetched)
const RasidDownloadButton = ({
  member, entries, which = 'all', children, tooltip, icon, ...btnProps
}) => {
  const [busy, setBusy] = useState(false)

  const run = async (e) => {
    e?.stopPropagation?.()
    setBusy(true)
    try {
      const n = await downloadMemberRasid({ member, entries, which })
      if (!n) message.info('इस विकल्प के लिए कोई रसीद नहीं है')
      else message.success(n === 1 ? 'रसीद डाउनलोड हो गई' : `${n} रसीद डाउनलोड हो गईं`)
    } catch (err) {
      console.error('Rasid download failed:', err)
      message.error('रसीद नहीं बनी: ' + (err?.message || 'unknown error'))
    } finally {
      setBusy(false)
    }
  }

  const btn = (
    <Button icon={icon ?? <DownloadOutlined />} loading={busy} onClick={run} {...btnProps}>
      {children}
    </Button>
  )
  return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn
}

export default RasidDownloadButton
