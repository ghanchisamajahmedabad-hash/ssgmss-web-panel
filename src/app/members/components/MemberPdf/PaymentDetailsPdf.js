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
  logoImg: { width: 52, height: 48, borderRadius: 3 },
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
  sectionTitle: { fontSize: 10, fontWeight: 'bold', color: BLUE, marginTop: 6, marginBottom: 3, borderBottomWidth: 1, borderBottomColor: BLUE, paddingBottom: 1 },
  summaryGrid: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  summaryCard: { flex: 1, backgroundColor: GREY, padding: 4, alignItems: 'center', borderRadius: 2 },
  summaryVal: { fontSize: 12, fontWeight: 'bold' },
  summaryLbl: { fontSize: 7, color: '#666' },
  table: { marginTop: 2, borderWidth: 1, borderColor: BORDER },
  thRow: { flexDirection: 'row', backgroundColor: GREY, borderBottomWidth: 1, borderBottomColor: BORDER },
  thCell: { fontSize: 7.5, fontWeight: 'bold', color: BLUE, padding: 3, textAlign: 'center' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  td: { fontSize: 7, padding: 2, textAlign: 'center' },
  tdL: { fontSize: 7, padding: 2, textAlign: 'left' },
  entryCard: { marginBottom: 4, borderWidth: 0.5, borderColor: BORDER, padding: 3, borderRadius: 2 },
  footer: { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 6, alignItems: 'center' },
  footerText: { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },
});

const fmtDate = (d) => d ? (dayjs(d).isValid() ? dayjs(d).format('DD/MM/YY') : d) : '—';

const PayPage = ({ member, transactions, closingTransactions, closingEntries }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.outerView}>
      <Image src="/Images/logoT.png" style={styles.watermark} />

      {/* Header — Rasid style */}
      <View style={styles.header}>
        <View style={styles.logoBox}><Image src="/Images/logoT.png" style={styles.logoImg} /></View>
        <View style={styles.centerBlock}>
          <Text style={styles.mainTitle}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
          <Text style={styles.subTitle}>अहमदाबाद, गुजरात</Text>
          <Text style={styles.addrText}>68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424</Text>
          <Text style={styles.contactLine}>अध्यक्ष : 9374934004 | ऑफिस : 9898535345</Text>
        </View>
        <View style={styles.logoBox}><Image src="/Images/sanidevimg.jpeg" style={styles.logoImg} /></View>
      </View>
      <View style={styles.regBar}>
        <Text style={styles.regText}>SINCE : 2024</Text>
        <Text style={styles.regText}>Reg. No: A/5231</Text>
      </View>

      {/* Badge */}
      <View style={styles.badgeWrap}>
        <View style={styles.badge}><Text style={styles.badgeText}>भुगतान विवरण</Text></View>
      </View>

      {/* Member info */}
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>नाम : </Text><Text style={styles.infoValue}>{member.displayName} {member.fatherName}</Text></Text>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>पंजीयन क्र. : </Text><Text style={styles.infoValue}>{member.registrationNumber}</Text></Text>
        <View style={styles.infoRight}><Text><Text style={styles.infoLabel}>फोन : </Text><Text style={styles.infoValue}>{member.phone}</Text></Text></View>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>योजना : </Text><Text style={styles.infoValue}>{member.programName || '—'}</Text></Text>
      </View>

    {/* Join Fee Summary */}
    <Text style={styles.sectionTitle}>Join Fee Summary</Text>
    <View style={styles.summaryGrid}>
      {[
        { label: 'Total Fees', value: `₹${(member.joinFees || 0).toLocaleString()}`, color: BLUE },
        { label: 'Paid', value: `₹${(member.paidAmount || 0).toLocaleString()}`, color: '#16a34a' },
        { label: 'Pending', value: `₹${(member.pendingAmount || 0).toLocaleString()}`, color: (member.pendingAmount||0) > 0 ? RED : '#16a34a' },
      ].map((s, i) => (
        <View key={i} style={styles.summaryCard}>
          <Text style={{ ...styles.summaryVal, color: s.color }}>{s.value}</Text>
          <Text style={styles.summaryLbl}>{s.label}</Text>
        </View>
      ))}
    </View>

    {/* Closing Summary */}
    {(member.closing_totalAmount || 0) > 0 && (
      <>
        <Text style={styles.sectionTitle}>Closing Summary</Text>
        <View style={styles.summaryGrid}>
          {[
            { label: 'Total', value: `₹${(member.closing_totalAmount||0).toLocaleString()}`, color: '#7c3aed' },
            { label: 'Paid', value: `₹${(member.closing_paidAmount||0).toLocaleString()}`, color: '#16a34a' },
            { label: 'Pending', value: `₹${(member.closing_pendingAmount||0).toLocaleString()}`, color: (member.closing_pendingAmount||0) > 0 ? RED : '#16a34a' },
            { label: 'Events', value: `${member.paidClosingCount||0}/${member.totalClosingCount||0}`, color: BLUE },
          ].map((s, i) => (
            <View key={i} style={styles.summaryCard}>
              <Text style={{ ...styles.summaryVal, color: s.color }}>{s.value}</Text>
              <Text style={styles.summaryLbl}>{s.label}</Text>
            </View>
          ))}
        </View>
      </>
    )}

    {/* Closing Entries */}
    {closingEntries.length > 0 && (
      <>
        <Text style={styles.sectionTitle}>Closing Entries</Text>
        {closingEntries.map((entry, ei) => (
          <View key={ei} style={styles.entryCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 8, fontWeight: 'bold', color: entry.status === 'paid' ? '#16a34a' : RED }}>
                {entry.status === 'paid' ? 'PAID' : 'PENDING'} — ₹{(entry.totalAmount||0).toLocaleString()} ({entry.closingCount||0} members)
              </Text>
              <Text style={{ fontSize: 7, color: '#666' }}>{entry.closingGroupName || entry.closingGroupId?.slice(-6) || ''}</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.thRow}>
                <Text style={{ ...styles.thCell, width: 20 }}>#</Text>
                <Text style={{ ...styles.thCell, flex: 1 }}>Name</Text>
                <Text style={{ ...styles.thCell, width: 55 }}>Reg No</Text>
                <Text style={{ ...styles.thCell, width: 40 }}>Village</Text>
              </View>
              {(entry.closingDetails || []).map((d, di) => (
                <View key={di} style={styles.tr}>
                  <Text style={{ ...styles.td, width: 20 }}>{di + 1}</Text>
                  <Text style={{ ...styles.tdL, flex: 1 }}>{d.closed_memberName}</Text>
                  <Text style={{ ...styles.td, width: 55, fontFamily: 'Courier', fontSize: 6 }}>{d.closed_registrationNumber || entry.closing_registrationNumber || '—'}</Text>
                  <Text style={{ ...styles.td, width: 40 }}>{d.closed_village || '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </>
    )}

    {/* Join Fee Transactions */}
    {transactions.length > 0 && (
      <>
        <Text style={styles.sectionTitle}>Join Fee Transactions</Text>
        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={{ ...styles.thCell, width: 22 }}>#</Text>
            <Text style={{ ...styles.thCell, flex: 1 }}>Type</Text>
            <Text style={{ ...styles.thCell, width: 50 }}>Amount</Text>
            <Text style={{ ...styles.thCell, width: 40 }}>Mode</Text>
            <Text style={{ ...styles.thCell, width: 50 }}>Date</Text>
            <Text style={{ ...styles.thCell, width: 45 }}>Status</Text>
          </View>
          {transactions.map((t, i) => (
            <View key={i} style={styles.tr}>
              <Text style={{ ...styles.td, width: 22 }}>{i + 1}</Text>
              <Text style={{ ...styles.tdL, flex: 1 }}>{t.transactionType === 'join_fee' ? 'Join Fee' : 'Additional'}</Text>
              <Text style={{ ...styles.td, width: 50, color: '#16a34a', fontWeight: 'bold' }}>₹{(t.amount||0).toLocaleString()}</Text>
              <Text style={{ ...styles.td, width: 40 }}>{t.paymentMode || '—'}</Text>
              <Text style={{ ...styles.td, width: 50 }}>{fmtDate(t.transactionDate || t.date)}</Text>
              <Text style={{ ...styles.td, width: 45, color: t.status === 'completed' ? '#16a34a' : '#ea580c' }}>{t.status}</Text>
            </View>
          ))}
        </View>
      </>
    )}

    {/* Closing Transactions */}
    {closingTransactions.length > 0 && (
      <>
        <Text style={styles.sectionTitle}>Closing Payment Transactions</Text>
        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={{ ...styles.thCell, width: 22 }}>#</Text>
            <Text style={{ ...styles.thCell, width: 50 }}>Amount</Text>
            <Text style={{ ...styles.thCell, width: 35 }}>Mode</Text>
            <Text style={{ ...styles.thCell, width: 50 }}>Date</Text>
            <Text style={{ ...styles.thCell, flex: 1 }}>Note</Text>
          </View>
          {closingTransactions.map((t, i) => (
            <View key={i} style={styles.tr}>
              <Text style={{ ...styles.td, width: 22 }}>{i + 1}</Text>
              <Text style={{ ...styles.td, width: 50, color: '#7c3aed', fontWeight: 'bold' }}>₹{(t.amount||t.amountPaid||0).toLocaleString()}</Text>
              <Text style={{ ...styles.td, width: 35 }}>{t.paymentMode || '—'}</Text>
              <Text style={{ ...styles.td, width: 50 }}>{fmtDate(t.transactionDate || t.date)}</Text>
              <Text style={{ ...styles.tdL, flex: 1 }}>{t.paymentNote || '—'}</Text>
            </View>
          ))}
        </View>
      </>
    )}

    <View style={styles.footer}>
      <Text style={styles.footerText}>संपर्क सूत्र : 9374934004, 9825289998, 9426517804, 9824017977</Text>
    </View>
  </View>
</Page>);

const PaymentDetailsPdf = ({ member, transactions, closingTransactions, closingEntries }) => (
  <Document>
    <PayPage member={member} transactions={transactions} closingTransactions={closingTransactions} closingEntries={closingEntries} />
  </Document>
);

export default PaymentDetailsPdf;
