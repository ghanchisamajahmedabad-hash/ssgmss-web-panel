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
  thRow: { flexDirection: 'row', backgroundColor: BLUE, borderBottomWidth: 1, borderBottomColor: BORDER, height: 16, alignItems: 'center' },
  thCell: { fontSize: 8, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3, textAlign: 'center' },
  // Fixed row height + single-line cells. Without this, a long yojana or
  // village name wrapped to a second line and the row's text bled into the
  // rows around it.
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, height: 14, alignItems: 'center' },
  trEven: { backgroundColor: '#f8fafc' },
  td: { fontSize: 7, paddingHorizontal: 3, textAlign: 'center' },
  tdL: { fontSize: 7, paddingHorizontal: 3, textAlign: 'left' },
  tdR: { fontSize: 7, paddingHorizontal: 3, textAlign: 'right' },

  footer: { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 6, alignItems: 'center' },
  footerText: { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },
});

// Old/legacy registration number carried over from the previous system.
// The field name isn't written anywhere in this codebase — it comes from the
// migration — so several likely spellings are accepted and the first non-empty
// one wins. Add to this list if your data uses a different key.
export const OLD_REG_FIELDS = [
  // Actual field used by the migration
  'legacyApplicationNo',
  // Other spellings kept as fallbacks
  'oldRegistrationNumber', 'oldRegNo', 'old_reg_no', 'oldRegno', 'old_registration_number',
  'previousRegistrationNumber', 'previousRegNo', 'prevRegNo',
  'legacyRegistrationNumber', 'legacyRegNo', 'oldMemberId', 'oldId',
];

export const getOldRegNo = (m) => {
  if (!m) return '';
  for (const key of OLD_REG_FIELDS) {
    const v = m[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

// Marriage/closing date. Written as an ISO string on the member doc when the
// closing is recorded; `member_closed_at` is the server timestamp fallback.
// Cells are a single fixed-height line, so anything longer than its column has
// to be cut here — otherwise react-pdf wraps it and the row overlaps its
// neighbours. Limits are approximate character counts for each column width
// at 7pt.
const clip = (value, max) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};

export const getClosedDate = (m) => {
  if (!m) return '';
  const raw = m.closed_date || m.marriageDate || m.member_closed_at;
  if (!raw) return '';
  const d = raw?.toDate ? dayjs(raw.toDate()) : dayjs(raw);
  return d.isValid() ? d.format('DD-MM-YYYY') : '';
};

const MemberListPdf = ({ members, filters, programList, agentList }) => {
  const getAgentName = (id) => agentList?.find(a => a.id === id)?.name || id

  // Only widen the table with a closing column when the export actually
  // contains closed members — otherwise every normal list loses space to it.
  const showClosedCol = members?.some(m => m.member_closed && getClosedDate(m))

  const filterParts = []
  const progIds = filters.programIds?.length ? filters.programIds
                : filters.programId && filters.programId !== 'all' ? [filters.programId] : []
  if (progIds.length) filterParts.push(`Yojna: ${progIds.map(id => programList?.find(p => p.id === id)?.name || id).join(', ')}`)
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
    const oldReg = getOldRegNo(m)
    return (
      <View key={m.id} style={[styles.tr, i % 2 === 1 && styles.trEven]} wrap={false}>
        <Text style={[styles.td, { width: 22 }]}>{m.srNo ?? i + 1}</Text>
        <Text style={[styles.td, { width: 76, fontWeight: 'bold', color: BLUE }]}>{clip(m.registrationNumber, 18)}</Text>
        <Text style={[styles.td, { width: 68, color: '#6b7280' }]}>{clip(oldReg, 16) || '-'}</Text>
        <Text style={[styles.tdL, { flex: 1 }]}>
          {clip(`${m.displayName || ''}${m.fatherName ? ` / ${m.fatherName}` : ''}`, 46)}
        </Text>
        <Text style={[styles.td, { width: 62 }]}>{clip(m.phone, 14) || '-'}</Text>
        <Text style={[styles.td, { width: 88 }]}>{clip(progName, 22)}</Text>
        <Text style={[styles.td, { width: 48 }]}>{clip(ageGroup, 12)}</Text>
        {/* Per-closing instalment amount — sits next to the age group because
            that is what determines it. */}
        <Text style={[styles.tdR, { width: 52, fontWeight: 'bold', color: BLUE }]}>
          ₹{(m.payAmount || 0).toLocaleString('en-IN')}
        </Text>
        <Text style={[styles.td, { width: 62 }]}>{clip(m.village, 15) || '-'}</Text>
        <Text style={[styles.td, { width: 52, color: statusText === 'Closed' ? RED : statusText === 'Active' ? '#16a34a' : '#888' }]}>{statusText}</Text>
        {showClosedCol && (
          <Text style={[styles.td, { width: 58, color: RED }]}>{getClosedDate(m) || '-'}</Text>
        )}
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
              <Text style={[styles.thCell, { width: 76 }]}>Reg No</Text>
              <Text style={[styles.thCell, { width: 68 }]}>Old Reg No</Text>
              <Text style={[styles.thCell, { flex: 1 }]}>नाम / पिता</Text>
              <Text style={[styles.thCell, { width: 62 }]}>फोन</Text>
              <Text style={[styles.thCell, { width: 88 }]}>योजना</Text>
              <Text style={[styles.thCell, { width: 48 }]}>आयु वर्ग</Text>
              <Text style={[styles.thCell, { width: 52 }]}>राशि</Text>
              <Text style={[styles.thCell, { width: 62 }]}>गाँव</Text>
              <Text style={[styles.thCell, { width: 52 }]}>Status</Text>
              {showClosedCol && <Text style={[styles.thCell, { width: 58 }]}>Closed Date</Text>}
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
