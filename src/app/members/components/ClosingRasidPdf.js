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

// ─── Colors ───────────────────────────────────────────────────────────────────
const RED    = '#D3292F';
const BLUE   = '#1B385A';
const BLACK  = '#000000';
const BORDER = '#aaaaaa';
const GREY   = '#f7f7f7';

// Fixed row count so every receipt fills the page identically, exactly as the
// join-fees rasid does — short lists get blank ruled rows rather than a
// half-empty page.
const TOTAL_ROWS = 20;

// ─── Styles — mirrored from RasidPdfCom so both receipts are identical ────────
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
  smallText: { fontSize: 8.5, color: RED, fontWeight: 'bold' },

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

  centerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  mainTitle: {
    fontSize: 17, color: BLUE, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 1, letterSpacing: 0.3,
  },
  subTitle: {
    fontSize: 13, color: BLUE, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 3,
  },
  addressRow: {
    flexDirection: 'row', justifyContent: 'center',
    flexWrap: 'wrap', marginBottom: 1,
  },
  addressLabel: { color: BLACK, fontSize: 7.5, fontWeight: 'bold' },
  addressValue: { color: BLACK, fontSize: 7.5, textAlign: 'center' },
  contactRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 1,
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
    borderWidth: 1.5, borderColor: RED, borderRadius: 4,
    paddingHorizontal: 20, paddingVertical: 3,
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
  // No village column — village is appended to the name, as on the printed receipt
  cellDate: {
    width: 72,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellMobile: {
    width: 82,
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

  // ════════ WORKER + SIGNATURE + NOTE ════════
  workerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  workerLabel: { fontSize: 10, fontWeight: 'bold', color: RED },
  workerValue: { fontSize: 10, color: BLUE, fontWeight: 'normal' },
  signatureText: { fontSize: 10, fontWeight: 'bold', color: BLUE },
  noteText: { fontSize: 9, color: '#444', marginTop: 1, lineHeight: 1.4, fontWeight: 'normal' },

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
  footerCenter:  { flex: 1, alignItems: 'center' },
  footerContact: { fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginBottom: 1 },
  footerSub:     { fontSize: 9, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  footerEoe:     { fontSize: 10, fontWeight: 'bold', color: BLACK, width: 50, textAlign: 'right' },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Closing dates reach us in three shapes and each needs different handling:
//   • Firestore Timestamp        → .toDate()
//   • "DD-MM-YYYY" string        → dayjs() reads this as MM-DD (or fails), and
//                                  dayjs(s, 'DD-MM-YYYY') only parses correctly
//                                  with the customParseFormat plugin, which is
//                                  not loaded — so the components are rebuilt
//                                  manually instead of round-tripping dayjs.
//   • ISO string ("…T18:30:00Z") → written with .toISOString() from a local
//                                  date, so the UTC instant is the day BEFORE
//                                  when the local time was before 05:30 IST.
//                                  Taking the calendar date directly avoids
//                                  the off-by-one.
const fmtDate = (d) => {
  if (!d) return '';

  // Firestore Timestamp
  if (d?.toDate) {
    const t = dayjs(d.toDate());
    return t.isValid() ? t.format('DD-MM-YYYY') : '';
  }

  if (typeof d === 'string') {
    const s = d.trim();

    // Already DD-MM-YYYY — rebuild the components directly (no dayjs parsing,
    // so a day/month swap is impossible) and zero-pad for a uniform look.
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      const [da, mo, y] = s.split('-').map(Number);
      if (da >= 1 && da <= 31 && mo >= 1 && mo <= 12 && y > 0) {
        return (
          String(da).padStart(2, '0') +
          '-' + String(mo).padStart(2, '0') +
          '-' + y
        );
      }
      return s;
    }

    // ISO with a time component: read the calendar date from the string itself
    // so the printed day matches the day that was picked, whatever timezone
    // the PDF happens to be rendered in.
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (iso) {
      const [, y, mo, da] = iso;
      const local = dayjs(`${y}-${mo}-${da}`);
      // A UTC instant before ~05:30 means the local date was the next day
      const hour = Number(s.slice(11, 13));
      return hour >= 18
        ? local.add(1, 'day').format('DD-MM-YYYY')
        : local.format('DD-MM-YYYY');
    }
  }

  const parsed = dayjs(d);
  return parsed.isValid() ? parsed.format('DD-MM-YYYY') : String(d);
};

// Amount → Hindi words, matching the "छह हज़ार रुपये मात्र" style on the receipt
const ONES = ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
  'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस'];
const TENS = ['', '', 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे'];

const twoDigit = (n) => {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
};

const numberToHindiWords = (num) => {
  const n = Math.floor(Number(num) || 0);
  if (n === 0) return 'शून्य रुपये मात्र';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh  = Math.floor((n % 10000000) / 100000);
  const thou  = Math.floor((n % 100000) / 1000);
  const hund  = Math.floor((n % 1000) / 100);
  const rest  = n % 100;
  if (crore) parts.push(`${twoDigit(crore)} करोड़`);
  if (lakh)  parts.push(`${twoDigit(lakh)} लाख`);
  if (thou)  parts.push(`${twoDigit(thou)} हज़ार`);
  if (hund)  parts.push(`${ONES[hund]} सौ`);
  if (rest)  parts.push(twoDigit(rest));
  return parts.join(' ') + ' रुपये मात्र';
};

// ─── Single receipt page ─────────────────────────────────────────────────────
const ClosingPage = ({ data }) => {
  const entries = data.entries || [];
  const filledEntries = [
    ...entries,
    ...Array(Math.max(0, TOTAL_ROWS - entries.length)).fill(null),
  ];

  const total = Number(data.totalAmount || 0);

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
            <Text style={styles.mainTitle}>श्री क्षत्रिय घाँची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
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
              <Text style={styles.infoValue}>{data.serialNo || ''}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>दिनांक : </Text>
              <Text style={styles.infoValue}>{fmtDate(data.date) || dayjs().format('DD-MM-YYYY')}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Name + Phone ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>नाम : </Text>
              <Text style={styles.infoValue}>{data.name || ''}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>फोन नं. : </Text>
              <Text style={styles.infoValue}>{data.phone || ''}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Address ══ */}
        <View style={styles.infoRow}>
          <Text>
            <Text style={styles.infoLabel}>पता : </Text>
            <Text style={styles.infoValue}>{data.address || ''}</Text>
          </Text>
        </View>

        {/* ══ Yojana + Sahyog Rashi ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>योजना : </Text>
              <Text style={styles.infoValue}>
                {data.yojana || ''}{data.ageGroup ? ` Group : ${data.ageGroup}` : ''}
              </Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>सहयोग राशि : </Text>
              <Text style={styles.infoValue}>{data.sahyogRashi ?? ''}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Table ══ */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <View style={styles.cellNo}><Text style={styles.headerCellText}>#</Text></View>
            <View style={styles.cellCode}><Text style={styles.headerCellText}>कोड</Text></View>
            <View style={styles.cellName}>
              <Text style={[styles.headerCellText, { textAlign: 'center' }]}>नाम</Text>
            </View>
            <View style={styles.cellDate}><Text style={styles.headerCellText}>दिनांक</Text></View>
            <View style={styles.cellMobile}><Text style={styles.headerCellText}>मोबाइल न.</Text></View>
          </View>

          {filledEntries.map((entry, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.cellNo}>
                <Text style={styles.cellTextCenter}>
                  {entry ? (data.startIndex || 0) + idx + 1 : ''}
                </Text>
              </View>
              <View style={styles.cellCode}>
                <Text style={styles.cellTextCenter}>{entry ? entry.code || '' : ''}</Text>
              </View>
              <View style={styles.cellName}>
                {/* Village appended to the name — no separate column */}
                <Text style={styles.cellTextLeft}>
                  {entry ? [entry.name, entry.village].filter(Boolean).join('  ') : ''}
                </Text>
              </View>
              <View style={styles.cellDate}>
                <Text style={styles.cellTextCenter}>{entry ? fmtDate(entry.date) : ''}</Text>
              </View>
              <View style={styles.cellMobile}>
                <Text style={styles.cellTextCenter}>{entry ? entry.mobile || '' : ''}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ══ Total ══ */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>कुल राशि रु.: </Text>
          <Text style={styles.totalAmount}>{total.toLocaleString('en-IN')}</Text>
          <Text style={styles.totalWordsLabel}>शब्दों में रूपये : </Text>
          <Text style={styles.totalWordsValue}>
            {data.totalInWords || numberToHindiWords(total)}
          </Text>
        </View>

        {/* ══ Worker + Signature ══ */}
        <View style={styles.workerRow}>
          <Text>
            <Text style={styles.workerLabel}>कार्यकर्ता : </Text>
            <Text style={styles.workerValue}>{data.worker || ''}</Text>
          </Text>
          <Text style={styles.signatureText}>संस्थापक हस्ताक्षर</Text>
        </View>

        {/* ══ Note ══ */}
        <Text style={styles.noteText}>Note : {data.note || ''}</Text>

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

// ─── Main component ──────────────────────────────────────────────────────────
// Accepts the same shape as before. Lists longer than TOTAL_ROWS are split
// across pages so the layout stays fixed instead of overflowing.
const ClosingRasidPdf = ({ entries = [] }) => {
  const pages = [];

  entries.forEach((receipt, rIdx) => {
    const list = receipt.entries || [];
    const chunks = list.length > TOTAL_ROWS
      ? Array.from({ length: Math.ceil(list.length / TOTAL_ROWS) },
          (_, i) => list.slice(i * TOTAL_ROWS, (i + 1) * TOTAL_ROWS))
      : [list];

    chunks.forEach((chunk, cIdx) => {
      pages.push(
        <ClosingPage
          key={`${receipt.id || rIdx}_${cIdx}`}
          data={{ ...receipt, entries: chunk, startIndex: cIdx * TOTAL_ROWS }}
        />
      );
    });
  });

  return <Document>{pages}</Document>;
};

export default ClosingRasidPdf;
