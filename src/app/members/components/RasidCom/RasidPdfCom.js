import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

// ─── Colors ───────────────────────────────────────────────────────────────────
const RED    = '#D3292F';
const BLUE   = '#1B385A';
const BLACK  = '#000000';
const BORDER = '#aaaaaa';
const GREY   = '#f7f7f7';

// ─── Total table rows per page ────────────────────────────────────────────────
const TOTAL_ROWS = 20;

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
  },

  outerView: {
    width: '100%',
    height: '100%',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    flexDirection: 'column',
  },

  watermark: {
    position: 'absolute',
    top: '30%',
    left: '20%',
    width: '60%',
    opacity: 0.06,
    zIndex: 0,
  },

  // ════════ HEADER ════════
  topText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  smallText: {
    fontSize: 8.5,
    color: RED,
    fontWeight: 'bold',
  },

  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  imageBox: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
  },
  logoImage:  { width: 60, height: 55, borderRadius: 4 },
  logoImage1: { width: 60, height: 55, borderRadius: 4 },

  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  mainTitle: {
    fontSize: 17,
    color: BLUE,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 1,
    letterSpacing: 0.3,
  },
  subTitle: {
    fontSize: 13,
    color: BLUE,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 1,
  },
  addressLabel: { color: BLACK, fontSize: 7.5, fontWeight: 'bold' },
  addressValue: { color: BLACK, fontSize: 7.5, textAlign: 'center' },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  contactLabel: { fontSize: 7.5, fontWeight: 'bold', color: BLACK },
  contactValue: { fontSize: 7.5, fontWeight: 'bold', color: BLUE },

  // ── Since / Reg row ──
  sinceRegRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: BLUE,
    marginBottom: 0,
  },
  sinceText: { fontSize: 9, fontWeight: 'bold', color: BLUE },
  regText:   { fontSize: 9, fontWeight: 'bold', color: BLUE },

  // ════════ BADGE ════════
  badgeWrap: { alignItems: 'center', marginTop: 6, marginBottom: 6 },
  badge: {
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: RED, textAlign: 'center' },

  // ════════ INFO ROWS ════════
  infoRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'center' },
  infoLeft:  { flex: 1 },
  infoRight: { width: 150, alignItems: 'flex-end' },
  infoLabel: { fontSize: 11, fontWeight: 'bold', color: RED },
  infoValue: { fontSize: 11, color: BLACK, fontWeight: 'normal' },

  // ════════ TABLE ════════
  table: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: BORDER,
    flex: 1,           // fills all remaining vertical space
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: GREY,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    flex: 1,           // each row shares height equally
  },

  cellNo: {
    width: 24,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 2, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellCode: {
    width: 62,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellName: {
    flex: 1,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 4, paddingVertical: 3,
    justifyContent: 'center',
  },
  cellDate: {
    width: 66,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellMobile: {
    width: 76,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },

  headerCellText: { fontSize: 10, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  cellTextCenter: { fontSize: 10, color: BLACK, textAlign: 'center', fontWeight: 'normal' },
  cellTextLeft:   { fontSize: 10, color: BLACK, fontWeight: 'normal' },

  // ════════ TOTAL ════════
  totalRow: {
    flexDirection: 'row',
    marginTop: 5, marginBottom: 2,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  totalLabel:      { fontSize: 10, fontWeight: 'bold', color: BLACK, marginRight: 6 },
  totalAmount:     { fontSize: 12, fontWeight: 'bold', color: BLACK, marginRight: 16 },
  totalWordsLabel: { fontSize: 11, fontWeight: 'bold', color: BLACK, marginRight: 6 },
  totalWordsValue: { fontSize: 11, color: BLACK, fontWeight: 'normal' },

  // ════════ SIGNATURE + NOTE ════════
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4, marginBottom: 1,
    paddingHorizontal: 2,
  },
  signatureText: { fontSize: 10, fontWeight: 'bold', color: BLUE },
  noteText:      { fontSize: 9, color: '#444', marginTop: 1, lineHeight: 1.4, fontWeight: 'normal' },

  // ════════ FOOTER ════════
  footer: {
    borderTopWidth: 1,
    borderTopColor: RED,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerContact: { fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginBottom: 1 },
  footerSub:     { fontSize: 9, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  footerEoe:     { fontSize: 10, fontWeight: 'bold', color: BLACK, width: 50, textAlign: 'right' },
});

// ─── Single receipt page ──────────────────────────────────────────────────────
const RasidPage = ({ data }) => {
  const filledEntries = [
    ...data.entries,
    ...Array(Math.max(0, TOTAL_ROWS - data.entries.length)).fill(null),
  ];

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.outerView}>

        {/* Watermark */}
        <Image src="/Images/logoT.png" style={styles.watermark} />

        {/* ══ Blessing Row ══ */}
        <View style={styles.topText}>
          <Text style={styles.smallText}>॥ श्री गणेशाय नमः ॥</Text>
          <Text style={styles.smallText}>॥ श्री शनिदेवाय नमः ॥</Text>
          <Text style={styles.smallText}>॥ श्री सांवलाजी महाराज नमः ॥</Text>
        </View>

        {/* ══ Header ══ */}
        <View style={styles.headerSection}>
          <View style={styles.imageBox}>
            <Image src="/Images/logoT.png" style={styles.logoImage} />
          </View>

          <View style={styles.centerContent}>
            <Text style={styles.mainTitle}>
              श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट
            </Text>
            <Text style={styles.subTitle}>अहमदाबाद, गुजरात</Text>

            <View style={styles.addressRow}>
              <Text style={styles.addressLabel}>हेड ऑफिस : </Text>
              <Text style={styles.addressValue}>
                68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास,
                चांदखेडा, साबरमती, अहमदाबाद 382424 (O) 9898535345
              </Text>
            </View>

            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>संपर्क सूत्र : </Text>
              <Text style={styles.contactValue}>अध्यक्ष श्री वोरारामजी टी. बोराणा</Text>
            </View>
            <View style={styles.contactRow}>
              <Text style={styles.contactValue}>9374934004</Text>
              <Text style={styles.contactLabel}>  ऑफिस : </Text>
              <Text style={styles.contactValue}> 9898535345</Text>
            </View>
          </View>

          <View style={styles.imageBox}>
            <Image src="/Images/sanidevImg.jpeg" style={styles.logoImage1} />
          </View>
        </View>

        {/* ══ Since / Reg row ══ */}
        <View style={styles.sinceRegRow}>
          <Text style={styles.sinceText}>SINCE : 2024</Text>
          <Text style={styles.regText}>Reg. No: A/5231</Text>
        </View>

        {/* ══ Badge ══ */}
        <View style={styles.badgeWrap}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>सहयोग राशि रसीद</Text>
          </View>
        </View>

        {/* ══ Serial No + Date ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>क्र. सं. : </Text>
              <Text style={styles.infoValue}>{data.serialNo}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>दिनांक : </Text>
              <Text style={styles.infoValue}>{data.date}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Name + Phone ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>नाम : </Text>
              <Text style={styles.infoValue}>{data.name}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>फोन नं. : </Text>
              <Text style={styles.infoValue}>{data.phone}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Address ══ */}
        <View style={styles.infoRow}>
          <Text>
            <Text style={styles.infoLabel}>पता : </Text>
            <Text style={styles.infoValue}>{data.address}</Text>
          </Text>
        </View>

        {/* ══ Yojana + Sahyog Rashi ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>योजना : </Text>
              <Text style={styles.infoValue}>{data.yojana} Group : {data.group}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>सहयोग राशि : </Text>
              <Text style={styles.infoValue}>{data.sahyogRashi}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Table ══ */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.cellNo}>
              <Text style={styles.headerCellText}>#</Text>
            </View>
            <View style={styles.cellCode}>
              <Text style={styles.headerCellText}>कोड</Text>
            </View>
            <View style={styles.cellName}>
              <Text style={[styles.headerCellText, { textAlign: 'center' }]}>नाम</Text>
            </View>
            <View style={styles.cellDate}>
              <Text style={styles.headerCellText}>दिनांक</Text>
            </View>
            <View style={styles.cellMobile}>
              <Text style={styles.headerCellText}>मोबाइल न.</Text>
            </View>
          </View>

          {/* Data rows */}
          {filledEntries.map((entry, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.cellNo}>
                <Text style={styles.cellTextCenter}>{idx + 1}</Text>
              </View>
              <View style={styles.cellCode}>
                <Text style={styles.cellTextCenter}>{entry ? entry.code : ''}</Text>
              </View>
              <View style={styles.cellName}>
                <Text style={styles.cellTextLeft}>{entry ? entry.name : ''}</Text>
              </View>
              <View style={styles.cellDate}>
                <Text style={styles.cellTextCenter}>{entry ? entry.date : ''}</Text>
              </View>
              <View style={styles.cellMobile}>
                <Text style={styles.cellTextCenter}>{entry ? entry.mobile : ''}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ══ Total ══ */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>कुल राशि रु.: </Text>
          <Text style={styles.totalAmount}>{data.totalAmount}</Text>
          <Text style={styles.totalWordsLabel}>शब्दों में रूपये : </Text>
          <Text style={styles.totalWordsValue}>{data.totalInWords}</Text>
        </View>

        {/* ══ Signature ══ */}
        <View style={styles.signatureRow}>
          <Text style={styles.signatureText}>संस्थापक हस्ताक्षर</Text>
        </View>

        {/* ══ Note ══ */}
        <Text style={styles.noteText}>Note : {data.note}</Text>

        {/* ══ Footer ══ */}
        <View style={styles.footer}>
          <View style={{ width: 50 }} />
          <View style={styles.footerCenter}>
            <Text style={styles.footerContact}>
              संपर्क सूत्र : 9374934004, 9825289998, 9426517804, 9824017977
            </Text>
            <Text style={styles.footerSub}>
              Exclusive jurisdiction Ahmedabad, Gujarat
            </Text>
          </View>
          <Text style={styles.footerEoe}>E. &amp; O.E.</Text>
        </View>

      </View>
    </Page>
  );
};

// ─── Main component — accepts rasidList array ─────────────────────────────────
const RasidPdfCom = ({ rasidList = [] }) => {
  return (
    <Document>
      {rasidList.map((data, index) => (
        <RasidPage key={data.serialNo ?? index} data={data} />
      ))}
    </Document>
  );
};

export default RasidPdfCom;