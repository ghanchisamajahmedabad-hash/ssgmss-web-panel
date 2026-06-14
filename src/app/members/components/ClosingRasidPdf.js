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

const RED    = '#D3292F';
const BLUE   = '#1B385A';
const BLACK  = '#000';
const BORDER = '#aaa';
const GREY   = '#f7f7f7';

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari' },
  outerView: { width: '100%', padding: 14, flexDirection: 'column' },
  watermark: { position: 'absolute', top: '30%', left: '20%', width: '60%', opacity: 0.06, zIndex: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logoBox: { width: 60, alignItems: 'center' },
  logo: { width: 52, height: 48, borderRadius: 3 },
  centerBlock: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  mainTitle: { fontSize: 16, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 1 },
  subTitle: { fontSize: 12, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  addrText: { fontSize: 7, color: BLACK, textAlign: 'center' },
  contactLine: { fontSize: 7.5, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  regBar: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: BLUE, marginBottom: 4 },
  regText: { fontSize: 9, fontWeight: 'bold', color: BLUE },
  badgeWrap: { alignItems: 'center', marginVertical: 6 },
  badge: { borderWidth: 1.5, borderColor: RED, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: RED, textAlign: 'center' },
  infoRow: { flexDirection: 'row', marginBottom: 3, alignItems: 'center' },
  infoLabel: { fontSize: 10, fontWeight: 'bold', color: RED },
  infoValue: { fontSize: 10, color: BLACK },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: BLUE, marginTop: 6, marginBottom: 3, borderBottomWidth: 1, borderBottomColor: BLUE, paddingBottom: 1 },
  table: { marginTop: 4, borderWidth: 1, borderColor: BORDER },
  thRow: { flexDirection: 'row', backgroundColor: GREY, borderBottomWidth: 1, borderBottomColor: BORDER },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  cellSn: { width: 20, borderRightWidth: 0.5, borderRightColor: BORDER, padding: 3, alignItems: 'center' },
  cellName: { flex: 1.2, borderRightWidth: 0.5, borderRightColor: BORDER, paddingHorizontal: 4, paddingVertical: 3 },
  cellFather: { width: 72, borderRightWidth: 0.5, borderRightColor: BORDER, padding: 3 },
  cellVillage: { width: 52, borderRightWidth: 0.5, borderRightColor: BORDER, padding: 3, alignItems: 'center' },
  cellReg: { width: 65, borderRightWidth: 0.5, borderRightColor: BORDER, padding: 3, alignItems: 'center' },
  cellPhone: { width: 65, borderRightWidth: 0.5, borderRightColor: BORDER, padding: 3, alignItems: 'center' },
  cellDate: { width: 55, padding: 3, alignItems: 'center' },
  thText: { fontSize: 7.5, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  tdText: { fontSize: 8, color: BLACK },
  tdCenter: { fontSize: 8, color: BLACK, textAlign: 'center' },
  groupInfoRow: { flexDirection: 'row', marginTop: 2, marginBottom: 2 },
  groupInfoLabel: { fontSize: 8, fontWeight: 'bold', color: '#666' },
  groupInfoValue: { fontSize: 8, color: BLACK },
  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, gap: 12 },
  summaryLabel: { fontSize: 10, fontWeight: 'bold', color: BLACK },
  summaryValue: { fontSize: 11, fontWeight: 'bold', color: RED },
  footer: { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 6, alignItems: 'center' },
  footerText: { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },
  footerSub: { fontSize: 8, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
});

const fmtDate = (d) => {
  if (!d) return '—';
  const parsed = dayjs(d);
  return parsed.isValid() ? parsed.format('DD/MM/YY') : d;
};

const ClosingPage = ({ data }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.outerView}>
      <Image src="/Images/logoT.png" style={styles.watermark} />
      <View style={styles.header}>
        <View style={styles.logoBox}><Image src="/Images/logoT.png" style={styles.logo} /></View>
        <View style={styles.centerBlock}>
          <Text style={styles.mainTitle}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
          <Text style={styles.subTitle}>अहमदाबाद, गुजरात</Text>
          <Text style={styles.addrText}>68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424</Text>
          <Text style={styles.contactLine}>अध्यक्ष : 9374934004 | ऑफिस : 9898535345</Text>
        </View>
        <View style={styles.logoBox}><Image src="/Images/sanidevImg.jpeg" style={styles.logo} /></View>
      </View>
      <View style={styles.regBar}>
        <Text style={styles.regText}>SINCE : 2024</Text>
        <Text style={styles.regText}>Reg. No: A/5231</Text>
      </View>
      <View style={styles.badgeWrap}>
        <View style={styles.badge}><Text style={styles.badgeText}>क्लोज़िंग रसीद</Text></View>
      </View>

      {/* Member info */}
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>नाम : </Text><Text style={styles.infoValue}>{data.displayName} {data.fatherName} {data.surname}</Text></Text>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>पंजीयन क्र. : </Text><Text style={styles.infoValue}>{data.registrationNumber}</Text></Text>
        <View style={styles.infoRight}><Text><Text style={styles.infoLabel}>दिनांक : </Text><Text style={styles.infoValue}>{fmtDate(data.date)}</Text></Text></View>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>फोन : </Text><Text style={styles.infoValue}>{data.phone}</Text></Text>
        <View style={styles.infoRight}><Text><Text style={styles.infoLabel}>गाँव : </Text><Text style={styles.infoValue}>{data.village || '—'}</Text></Text></View>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>योजना : </Text><Text style={styles.infoValue}>{data.programName}</Text></Text>
        <View style={styles.infoRight}><Text><Text style={styles.infoLabel}>आयु वर्ग : </Text><Text style={styles.infoValue}>{data.ageGroupName || '—'}</Text></Text></View>
      </View>

      {/* Closing group info */}
      {(data.closingGroupName || data.closingGroupId) && (
        <View style={styles.groupInfoRow}>
          <Text><Text style={styles.groupInfoLabel}>ग्रुप : </Text><Text style={styles.groupInfoValue}>{data.closingGroupName || data.closingGroupId}</Text></Text>
          <View style={{ flex: 1 }} />
          <Text><Text style={styles.groupInfoLabel}>स्थिति : </Text><Text style={{ ...styles.groupInfoValue, color: data.status === 'paid' ? '#52c41a' : '#ff4d4f' }}>{data.status?.toUpperCase() || '—'}</Text></Text>
        </View>
      )}

      {/* Closing entries table */}
      <Text style={styles.sectionTitle}>क्लोज़िंग विवरण</Text>
      <View style={styles.table}>
        <View style={styles.thRow}>
          <View style={styles.cellSn}><Text style={styles.thText}>#</Text></View>
          <View style={styles.cellName}><Text style={styles.thText}>सदस्य नाम</Text></View>
          <View style={styles.cellFather}><Text style={styles.thText}>पिता का नाम</Text></View>
          <View style={styles.cellVillage}><Text style={styles.thText}>गाँव</Text></View>
          <View style={styles.cellReg}><Text style={styles.thText}>पंजीयन क्र.</Text></View>
          <View style={styles.cellPhone}><Text style={styles.thText}>फोन</Text></View>
          <View style={styles.cellDate}><Text style={styles.thText}>क्लोज़ तिथि</Text></View>
        </View>
        {(data.entries || []).map((e, i) => (
          <View key={i} style={styles.tr}>
            <View style={styles.cellSn}><Text style={styles.tdCenter}>{i + 1}</Text></View>
            <View style={styles.cellName}><Text style={styles.tdText}>{e.closed_memberName || e.name || ''}</Text></View>
            <View style={styles.cellFather}><Text style={styles.tdText}>{e.closed_fatherName || ''}</Text></View>
            <View style={styles.cellVillage}><Text style={styles.tdCenter}>{e.closed_village || ''}</Text></View>
            <View style={styles.cellReg}><Text style={styles.tdCenter}>{e.closed_registrationNumber || data.closing_registrationNumber || ''}</Text></View>
            <View style={styles.cellPhone}><Text style={styles.tdCenter}>{e.closingPhone || data.closingPhone || ''}</Text></View>
            <View style={styles.cellDate}><Text style={styles.tdCenter}>{fmtDate(e.closed_date)}</Text></View>
          </View>
        ))}
      </View>
      <View style={styles.summaryRow}>
        <Text><Text style={styles.summaryLabel}>कुल राशि : </Text><Text style={styles.summaryValue}>₹{data.totalAmount?.toLocaleString() || 0}</Text></Text>
        {data.status && (
          <Text><Text style={styles.summaryLabel}>स्थिति : </Text><Text style={{ ...styles.summaryValue, color: data.status === 'paid' ? '#52c41a' : '#ff4d4f' }}>{data.status?.toUpperCase()}</Text></Text>
        )}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>संपर्क सूत्र : 9374934004, 9825289998, 9426517804, 9824017977</Text>
        <Text style={styles.footerSub}>Exclusive jurisdiction Ahmedabad, Gujarat</Text>
      </View>
    </View>
  </Page>
);

const ClosingRasidPdf = ({ entries = [] }) => (
  <Document>
    {entries.map((entry, i) => (
      <ClosingPage key={entry.id || i} data={entry} />
    ))}
  </Document>
);

export default ClosingRasidPdf;