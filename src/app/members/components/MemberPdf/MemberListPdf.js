import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';
import dayjs from 'dayjs';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

const RED  = '#D3292F';
const BLUE = '#1B385A';
const BORDER = '#bbb';

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari' },
  outerView: { width: '100%', flexDirection: 'column', padding: 14 },
  watermark: { position: 'absolute', top: '30%', left: '20%', width: '60%', opacity: 0.06, zIndex: 0 },

  topText: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 4 },
  smallText: { fontSize: 8.5, color: RED, fontWeight: 'bold' },

  headerSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  imageBox: { width: 60, alignItems: 'center' },
  logoImage: { width: 52, height: 48, borderRadius: 3 },
  centerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  mainTitle: { fontSize: 16, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 1 },
  subTitle: { fontSize: 12, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  addrLine: { fontSize: 7, color: '#000', textAlign: 'center' },
  contactLine: { fontSize: 7.5, fontWeight: 'bold', color: BLUE, textAlign: 'center', marginTop: 1 },

  sinceRegRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: BLUE, marginBottom: 4 },
  sinceRegText: { fontSize: 9, fontWeight: 'bold', color: BLUE },

  badgeWrap: { alignItems: 'center', marginVertical: 6 },
  badge: { borderWidth: 1.5, borderColor: RED, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: RED, textAlign: 'center' },

  filterRow: { fontSize: 8, color: '#666', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryCount: { fontSize: 10, fontWeight: 'bold', color: '#fff', backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 3 },
  summaryDate: { fontSize: 8, color: '#999' },

  table: { borderWidth: 1, borderColor: BORDER, marginTop: 2 },
  thRow: { flexDirection: 'row', backgroundColor: BLUE, borderBottomWidth: 1, borderBottomColor: BORDER },
  thCell: { fontSize: 8, fontWeight: 'bold', color: '#fff', padding: 3, textAlign: 'center' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  trEven: { backgroundColor: '#f8fafc' },
  td: { fontSize: 7, padding: 3, textAlign: 'center' },
  tdL: { fontSize: 7, padding: 3, textAlign: 'left' },

  footer: { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 6, alignItems: 'center' },
  footerText: { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },
});

const MemberListPdf = ({ members, filters, programList, agentList }) => {
  const getAgentName = (id) => agentList?.find(a => a.id === id)?.name || id

  const filterParts = []
  if (filters.programId && filters.programId !== 'all') filterParts.push(`Yojna: ${programList?.find(p => p.id === filters.programId)?.name || filters.programId}`)
  if (filters.agentId && filters.agentId !== 'all') filterParts.push(`Agent: ${getAgentName(filters.agentId)}`)
  if (filters.status && filters.status !== 'all') filterParts.push(`Status: ${filters.status}`)
  if (filters.paymentStatus && filters.paymentStatus !== 'all') filterParts.push(`Payment: ${filters.paymentStatus}`)
  if (filters.closingPaymentStatus && filters.closingPaymentStatus !== 'all') filterParts.push(`Closing: ${filters.closingPaymentStatus}`)
  const filterStr = filterParts.length > 0 ? filterParts.join(' | ') : null

  const today = dayjs().format('DD-MM-YYYY')

  const rows = members.map((m, i) => {
    const progName = m.programName || (programList?.find(p => p.id === m.programId)?.name || '-')
    const ageGroup = m.ageGroupName || m.memberGroupName || m.ageGroup || '-'
    const statusText = m.member_closed ? 'Closed' : m.active_flag ? 'Active' : 'Inactive'
    return (
      <View key={m.id} style={[styles.tr, i % 2 === 1 && styles.trEven]} wrap={false}>
        <Text style={[styles.td, { width: 22 }]}>{i + 1}</Text>
        <Text style={[styles.td, { width: 60, fontWeight: 'bold', color: BLUE }]}>{m.registrationNumber || ''}</Text>
        <Text style={[styles.tdL, { flex: 1 }]}>{m.displayName}{m.fatherName ? ` / ${m.fatherName}` : ''}</Text>
        <Text style={[styles.td, { width: 65 }]}>{m.phone || '-'}</Text>
        <Text style={[styles.td, { width: 80 }]}>{progName}</Text>
        <Text style={[styles.td, { width: 55 }]}>{ageGroup}</Text>
        <Text style={[styles.td, { width: 55 }]}>{m.village || '-'}</Text>
        <Text style={[styles.td, { width: 52, color: statusText === 'Closed' ? RED : statusText === 'Active' ? '#16a34a' : '#888' }]}>{statusText}</Text>
      </View>
    )
  })

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.outerView}>
          <Image src="/Images/logoT.png" style={styles.watermark} />

          <View style={styles.topText}>
            <Text style={styles.smallText}>॥ श्री गणेशाय नमः ॥</Text>
            <Text style={styles.smallText}>॥ श्री शनिदेवाय नमः ॥</Text>
            <Text style={styles.smallText}>॥ श्री सांवलाजी महाराज नमः ॥</Text>
          </View>

          <View style={styles.headerSection}>
            <View style={styles.imageBox}><Image src="/Images/logoT.png" style={styles.logoImage} /></View>
            <View style={styles.centerContent}>
              <Text style={styles.mainTitle}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
              <Text style={styles.subTitle}>अहमदाबाद, गुजरात</Text>
              <Text style={styles.addrLine}>हेड ऑफिस : 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424</Text>
              <Text style={styles.contactLine}>संपर्क : 9374934004, 9825289998, 9426517804, 9824017977</Text>
            </View>
            <View style={styles.imageBox}><Image src="/Images/sanidevImg.jpeg" style={styles.logoImage} /></View>
          </View>

          <View style={styles.sinceRegRow}>
            <Text style={styles.sinceRegText}>SINCE : 2024</Text>
            <Text style={styles.sinceRegText}>Reg. No: A/5231</Text>
          </View>

          <View style={styles.badgeWrap}>
            <View style={styles.badge}><Text style={styles.badgeText}>सदस्य सूची</Text></View>
          </View>

          {filterStr && <Text style={styles.filterRow}>Filters: {filterStr}</Text>}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCount}>कुल सदस्य: {members.length}</Text>
            <Text style={styles.summaryDate}>{today}</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.thCell, { width: 22 }]}>#</Text>
              <Text style={[styles.thCell, { width: 60 }]}>Reg No</Text>
              <Text style={[styles.thCell, { flex: 1 }]}>नाम / पिता</Text>
              <Text style={[styles.thCell, { width: 65 }]}>फोन</Text>
              <Text style={[styles.thCell, { width: 80 }]}>योजना</Text>
              <Text style={[styles.thCell, { width: 55 }]}>आयु वर्ग</Text>
              <Text style={[styles.thCell, { width: 55 }]}>गाँव</Text>
              <Text style={[styles.thCell, { width: 52 }]}>Status</Text>
            </View>
            {rows}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Generated by SSGMS Web Panel • {dayjs().format('DD-MM-YYYY HH:mm')}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export default MemberListPdf
