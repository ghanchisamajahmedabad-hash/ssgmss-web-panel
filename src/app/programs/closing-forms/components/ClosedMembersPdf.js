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
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, height: 14, alignItems: 'center' },
  trEven: { backgroundColor: '#f8fafc' },
  td: { fontSize: 7, paddingHorizontal: 3, textAlign: 'center' },
  tdL: { fontSize: 7, paddingHorizontal: 3, textAlign: 'left' },

  footer: { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 6, alignItems: 'center' },
  footerText: { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },
});

const clip = (value, max) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};

const fmtDate = (raw) => {
  if (!raw) return '';
  const d = raw?.toDate ? dayjs(raw.toDate()) : dayjs(raw);
  return d.isValid() ? d.format('DD-MM-YYYY') : String(raw);
};

const ClosedMembersPdf = ({ members, filters, programList, agentList, closingGroups }) => {
  const progName = (id) => {
    const p = programList?.find(x => x.id === id);
    return p?.name || id || '-';
  };
  const getAgentName = (id) => agentList?.find(a => a.id === id)?.name || '-';
  const getGroupName = (id) => {
    const g = closingGroups?.find(x => x.id === id);
    return g?.groupName || (id ? id.slice(-6) : '-');
  };

  const filterParts = [];
  if (filters.programName) filterParts.push(`Yojna: ${filters.programName}`);
  if (filters.groupName) filterParts.push(`Group: ${filters.groupName}`);
  if (filters.agentName) filterParts.push(`Agent: ${filters.agentName}`);
  if (filters.fromDate) filterParts.push(`From: ${filters.fromDate}`);
  if (filters.toDate) filterParts.push(`To: ${filters.toDate}`);
  const filterStr = filterParts.length > 0 ? filterParts.join('  |  ') : null;

  const today = dayjs().format('DD-MM-YYYY');
  const rows = (members || []).map((m, i) => (
    <View key={m.id} style={[styles.tr, i % 2 === 1 && styles.trEven]} wrap={false}>
      <Text style={[styles.td, { width: 24 }]}>{m.srNo ?? i + 1}</Text>
      <Text style={[styles.td, { width: 84, fontWeight: 'bold', color: BLUE }]}>{clip(m.registrationNumber, 18)}</Text>
      <Text style={[styles.tdL, { flex: 1 }]}>
        {clip(`${m.displayName || ''}${m.fatherName ? ` / ${m.fatherName}` : ''}`, 44)}
      </Text>
      <Text style={[styles.td, { width: 64 }]}>{clip(m.phone, 13) || '-'}</Text>
      <Text style={[styles.td, { width: 88 }]}>{clip(progName(m.member_closed_program || m.programId), 20)}</Text>
      <Text style={[styles.td, { width: 60 }]}>{clip(getGroupName(m.closingGroupId), 14)}</Text>
      <Text style={[styles.td, { width: 58 }]}>{clip(fmtDate(m.closed_date), 12) || '-'}</Text>
      <Text style={[styles.td, { width: 78 }]}>{clip(getAgentName(m.agentId), 18)}</Text>
      <Text style={[styles.td, { width: 68, color: m.closed_invitation_url ? '#16a34a' : '#888' }]}>
        {m.closed_invitation_url ? 'Yes' : 'No'}
      </Text>
    </View>
  ));

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
            <View style={styles.badge}><Text style={styles.badgeText}>क्लोजिंग सदस्य सूची</Text></View>
          </View>

          {filterStr && <Text style={styles.filterRow}>Filters: {filterStr}</Text>}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryCount}>कुल क्लोजिंग: {(members || []).length}</Text>
            <Text style={styles.summaryDate}>{today}</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.thCell, { width: 24 }]}>#</Text>
              <Text style={[styles.thCell, { width: 84 }]}>Reg No</Text>
              <Text style={[styles.thCell, { flex: 1 }]}>नाम / पिता</Text>
              <Text style={[styles.thCell, { width: 64 }]}>फोन</Text>
              <Text style={[styles.thCell, { width: 88 }]}>योजना</Text>
              <Text style={[styles.thCell, { width: 60 }]}>ग्रुप</Text>
              <Text style={[styles.thCell, { width: 58 }]}>क्लोजिंग</Text>
              <Text style={[styles.thCell, { width: 78 }]}>एजेंट</Text>
              <Text style={[styles.thCell, { width: 68 }]}>Invitation Card</Text>
            </View>
            {rows}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Generated by SSGMS Web Panel • {dayjs().format('DD-MM-YYYY HH:mm')}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default ClosedMembersPdf;