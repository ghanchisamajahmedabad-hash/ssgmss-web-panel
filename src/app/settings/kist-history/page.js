'use client'
// Settings → Kist History
// Every removed kist (instalment): whose, from which closing group, which closing,
// amount, what happened to money already paid, why and by whom.
// Written by the Closing System Check (remove invalid events) and by the
// one-member revert on Closing Forms.
import React from 'react'
import { Card, Typography } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import KistHistoryTable from '@/components/KistHistory/KistHistoryTable'

export default function KistHistoryPage() {
  return (
    <div style={{ padding: 16 }}>
      <Card style={{ borderRadius: 12 }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          <HistoryOutlined /> Kist History — hatayi gayi kist
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Kis sadasya ki kist hati, kis closing group se, kis closing ki thi, kitni rakam, jama paisa kahan gaya, kyun aur kisne —
          sab yahan rehta hai. Closing System Check (galat kist hatana) aur Closing Forms par kisi closed sadasya ka Revert, dono yahan likhe jaate hain.
        </Typography.Paragraph>
        <KistHistoryTable />
      </Card>
    </div>
  )
}
