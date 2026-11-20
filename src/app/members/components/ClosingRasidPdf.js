import NotoSansDevanagari from '../../api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '../../api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';
import dayjs from 'dayjs';
import { DEFAULT_RASID_DESIGN, normalizeRasidDesign } from '../../../lib/rasid/ssgmsDesign.js';

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
const GREEN  = '#16a34a';   // paid receipts

// Fixed row count so every receipt fills the page identically, exactly as the
// join-fees rasid does — short lists get blank ruled rows rather than a
// half-empty page.
const TOTAL_ROWS = 20;
// Rows per page a rasid run may choose (Closing Forms → Rasid): 10, 15 or 20 (default).
const rowsOf = (n) => ([10, 15, 20].includes(Number(n)) ? Number(n) : TOTAL_ROWS);

// ─── Styles — mirrored from RasidPdfCom so both receipts are identical ────────
// Height set aside at the bottom of every page for the footer, which is pinned
// there rather than flowing after the note. 1pt border + 4pt padding + two 9pt
// lines with their leading, rounded up so a slightly taller line still fits.
const FOOTER_SPACE = 44;

// Main / accent colours come from the rasid design (Settings → Rasid); defaults are BLUE / RED.
const makeStyles = (BLUE, RED) => StyleSheet.create({

  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
  },

  outerView: {
    width: '100%',
    height: '100%',
    paddingTop: 10,
    // Room reserved for the pinned footer below. The footer is no longer part of
    // this column, so without this the table's flex:1 would grow underneath it.
    paddingBottom: FOOTER_SPACE,
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
  // Paid receipts carry the same layout in green, so a settled receipt is
  // distinguishable from an outstanding one at a glance on a printed pile.
  badgePaid:     { borderColor: GREEN },
  badgeTextPaid: { color: GREEN },
  paidStamp: {
    marginTop: 3, borderWidth: 1, borderColor: GREEN, borderRadius: 3,
    paddingHorizontal: 10, paddingVertical: 1,
  },
  paidStampText: { fontSize: 9, fontWeight: 'bold', color: GREEN, textAlign: 'center' },

  // ════════ INFO ROWS ════════
  infoRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'center' },
  infoLeft:  { flex: 1 },
  infoRight: { width: 150, alignItems: 'flex-end' },
  infoLabel: { fontSize: 11, fontWeight: 'bold', color: RED },
  infoValue: { fontSize: 11, color: BLACK, fontWeight: 'normal' },

  // ════════ QR (rasid run: verify / UPI) ════════
  infoWithQr: { flexDirection: 'row', alignItems: 'flex-start' },
  infoCol:    { flex: 1 },
  qrBox:      { width: 78, alignItems: 'center', marginLeft: 8, borderWidth: 0.75, borderColor: BORDER, borderRadius: 3, paddingVertical: 3 },
  qrImg:      { width: 62, height: 62 },
  qrLabel:    { fontSize: 6.5, fontWeight: 'bold', color: BLUE, textAlign: 'center', marginTop: 1 },
  qrCode:     { fontSize: 6, color: '#555', textAlign: 'center' },

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
  // FIXED height, and every cell is a single line.
  //
  // Without a height, a long name or village wrapped onto a second line, that
  // row grew, and because the table holds a fixed TOTAL_ROWS inside a flex:1
  // box the extra height pushed the following rows over each other. Pinning the
  // height and clipping the text keeps the grid aligned.
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    height: 20,
    alignItems: 'center',
  },

  cellNo: {
    width: 24,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 2, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellCode: {
    // 62pt held only ~11 characters at the 10pt cell font, so a 12-character
    // registration number (MEM605866450) spilled into the name column.
    width: 86,
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
  // Multi-page receipts: the page's own total, then (last page) the grand total
  pageTotalCalc:   { fontSize: 9, color: '#555', marginRight: 10 },
  grandTotalRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 2, marginBottom: 2, paddingHorizontal: 2, paddingVertical: 2,
    borderTopWidth: 1, borderTopColor: BLUE,
  },
  pageLabel: { fontSize: 10, fontWeight: 'bold', color: BLUE },

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
  // Pinned to the bottom of the PAGE, not laid out after the note.
  //
  // In flow, the footer sat at the end of a column whose height was already
  // 100% of the page. When the content above came within a line of the bottom,
  // react-pdf split the footer and pushed its last line ("Exclusive
  // jurisdiction…") onto a second, otherwise-empty page. Anchoring it to the
  // page means it cannot be split or moved, whatever the rows above do.
  footer: {
    position: 'absolute',
    left: 12, right: 12, bottom: 10,
    borderTopWidth: 1,
    borderTopColor: RED,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerCenter:  { flex: 1, alignItems: 'center' },
  footerContact: { fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginBottom: 1 },
  footerSub:     { fontSize: 9, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  footerEoe:     { fontSize: 10, fontWeight: 'bold', color: BLACK, width: 50, textAlign: 'right' },
});
const styleCache = new Map();
const stylesFor = (main, accent) => {
  const k = `${main}|${accent}`;
  if (!styleCache.has(k)) styleCache.set(k, makeStyles(main, accent));
  return styleCache.get(k);
};

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
// Cells are a single fixed-height line, so anything longer than its column has
// to be cut here — otherwise react-pdf wraps it and the row overlaps the next.
// Limits are approximate character counts for each column width at 7.5pt.
const clip = (value, max) => {
  const t = String(value ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '…' : t;
};

// Browser: images come from /public. Server-side rendering (api/agent-rasid)
// has no /public to fetch from, so it passes the base64 versions instead.
const DEFAULT_IMAGES = { logo: '/Images/logoT.png', right: '/Images/sanidevImg.jpeg' };

const ClosingPage = ({ data, images = DEFAULT_IMAGES, rows = TOTAL_ROWS, design = DEFAULT_RASID_DESIGN }) => {
  const D = design;
  const show = D.show;
  const styles = stylesFor(D.colorMain, D.colorAccent);
  const sep = (label) => (label ? `${label} : ` : '');
  const entries = data.entries || [];
  const filledEntries = [
    ...entries,
    ...Array(Math.max(0, rows - entries.length)).fill(null),
  ];
  // 20 lines: the original fixed 20pt rows. 10 / 15 lines: rows share the table's height
  // equally (taller, easier to read / write on) and a long name may take two lines.
  const fewRows = rows < TOTAL_ROWS;
  const rowStyle = fewRows ? [styles.tableRow, { height: undefined, flex: 1 }] : styles.tableRow;
  const nameLines = fewRows ? 2 : 1;
  const qr = data.qr && data.qr.img ? data.qr : null;
  const joinOn = show.joinDate && !!data.joinDate;
  const nameCell = show.colDate || show.colMobile ? styles.cellName : [styles.cellName, { borderRightWidth: 0 }];
  const dateCell = show.colMobile ? styles.cellDate : [styles.cellDate, { borderRightWidth: 0 }];

  const total = Number(data.totalAmount || 0);
  // Page-wise figures (see ClosingRasidPdf below). On a one-page receipt the
  // page total IS the receipt total and the layout is unchanged.
  const pageNo    = data.pageNo || 1;
  const pageCount = data.pageCount || 1;
  const multiPage = pageCount > 1;
  const isLast    = pageNo === pageCount;
  const pageAmount = data.pageAmount ?? total;
  // `status` comes straight off the closing_payment doc ('paid' | 'partial' |
  // 'pending'), so the receipt reflects what was actually recorded rather than
  // which button produced it.
  const isPaid = data.status === 'paid';

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.outerView}>

        {/* Watermark */}
        {D.watermark ? <Image src={images.logo} style={styles.watermark} /> : null}

        {/* ══ Blessing Row ══ */}
        {D.blessings.some(Boolean) ? (
          <View style={styles.topText}>
            {D.blessings.map((b, i) => <Text key={i} style={styles.smallText}>{b}</Text>)}
          </View>
        ) : null}

        {/* ══ Header ══ */}
        <View style={styles.headerSection}>
          <View style={styles.imageBox}>
            <Image src={images.logo} style={styles.logoImage} />
          </View>

          <View style={styles.centerContent}>
            <Text style={styles.mainTitle}>{D.trustName}</Text>
            {D.cityState ? <Text style={styles.subTitle}>{D.cityState}</Text> : null}

            {D.officeAddress ? (
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>{sep(D.officeLabel)}</Text>
                <Text style={styles.addressValue}>{D.officeAddress}</Text>
              </View>
            ) : null}

            {D.contactName ? (
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>{sep(D.contactLabel)}</Text>
                <Text style={styles.contactValue}>{D.contactName}</Text>
              </View>
            ) : null}
            {D.contactPhone || D.officePhone ? (
              <View style={styles.contactRow}>
                <Text style={styles.contactValue}>{D.contactPhone}</Text>
                {D.officePhone ? <Text style={styles.contactLabel}>{`  ${sep(D.officePhoneLabel)}`}</Text> : null}
                {D.officePhone ? <Text style={styles.contactValue}> {D.officePhone}</Text> : null}
              </View>
            ) : null}
          </View>

          <View style={styles.imageBox}>
            <Image src={images.right} style={styles.logoImage1} />
          </View>
        </View>

        {/* ══ Since / Reg row ══ */}
        <View style={styles.sinceRegRow}>
          <Text style={styles.sinceText}>{D.since ? `SINCE : ${D.since}` : ''}</Text>
          <Text style={styles.regText}>{D.regNo ? `Reg. No: ${D.regNo}` : ''}</Text>
        </View>

        {/* ══ Badge — green when this receipt is fully paid ══ */}
        <View style={styles.badgeWrap}>
          <View style={[styles.badge, isPaid && styles.badgePaid]}>
            <Text style={[styles.badgeText, isPaid && styles.badgeTextPaid]}>
              {D.title}
            </Text>
          </View>
          {isPaid && D.paidStamp ? (
            <View style={styles.paidStamp}>
              <Text style={styles.paidStampText}>{D.paidStamp}</Text>
            </View>
          ) : null}
        </View>

        <View style={qr ? styles.infoWithQr : undefined}>
        <View style={qr ? styles.infoCol : undefined}>
        {/* ══ Serial No + Date ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>क्र. सं. : </Text>
              <Text style={styles.infoValue}>{data.serialNo || ''}</Text>
              <Text style={styles.infoValue}>{'      '}</Text>
              <Text style={styles.infoLabel}>पेज : </Text>
              <Text style={styles.pageLabel}>{pageNo} / {pageCount}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>दिनांक : </Text>
              <Text style={styles.infoValue}>{fmtDate(data.date) || dayjs().format('DD-MM-YYYY')}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Member: reg. no · join date · old application no. ══ */}
        {(show.regNo && data.regNo) || joinOn || (show.oldNo && data.oldNo) ? (
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              {show.regNo && data.regNo ? (
                <Text>
                  <Text style={styles.infoLabel}>{sep(D.regNoLabel)}</Text>
                  <Text style={[styles.infoValue, { fontWeight: 'bold' }]}>{data.regNo}</Text>
                </Text>
              ) : null}
            </View>
            {joinOn ? (
              <View style={{ flex: 1, alignItems: show.oldNo && data.oldNo ? 'center' : 'flex-end' }}>
                <Text>
                  <Text style={styles.infoLabel}>{sep(D.joinDateLabel)}</Text>
                  <Text style={[styles.infoValue, { fontWeight: 'bold' }]}>{fmtDate(data.joinDate)}</Text>
                </Text>
              </View>
            ) : null}
            {show.oldNo && data.oldNo ? (
              <View style={[styles.infoRight, { width: 190 }]}>
                <Text>
                  <Text style={styles.infoLabel}>{sep(D.oldNoLabel)}</Text>
                  <Text style={[styles.infoValue, { fontWeight: 'bold' }]}>{data.oldNo}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ══ Name + Phone ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>नाम : </Text>
              <Text style={styles.infoValue}>{data.name || ''}</Text>
            </Text>
          </View>
          {show.phone ? (
            <View style={styles.infoRight}>
              <Text>
                <Text style={styles.infoLabel}>फोन नं. : </Text>
                <Text style={styles.infoValue}>{data.phone || ''}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {/* ══ Address ══ */}
        {show.address ? (
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              {show.address ? (
                <Text>
                  <Text style={styles.infoLabel}>पता : </Text>
                  <Text style={styles.infoValue}>{data.address || ''}</Text>
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ══ Yojana + Sahyog Rashi ══ */}
        {show.yojana || show.ageGroup || show.sahyogRashi ? (
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              {show.yojana || (show.ageGroup && data.ageGroup) ? (
                <Text>
                  <Text style={styles.infoLabel}>{show.yojana ? 'योजना : ' : 'Group : '}</Text>
                  <Text style={styles.infoValue}>
                    {show.yojana ? data.yojana || '' : ''}
                    {show.ageGroup && data.ageGroup ? (show.yojana ? ` Group : ${data.ageGroup}` : data.ageGroup) : ''}
                  </Text>
                </Text>
              ) : null}
            </View>
            {show.sahyogRashi ? (
              <View style={styles.infoRight}>
                <Text>
                  <Text style={styles.infoLabel}>सहयोग राशि : </Text>
                  <Text style={styles.infoValue}>{data.sahyogRashi ?? ''}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        </View>
        {qr ? (
          <View style={styles.qrBox}>
            <Image src={qr.img} style={styles.qrImg} />
            <Text style={styles.qrLabel}>{qr.label || ''}</Text>
            {qr.code ? <Text style={styles.qrCode}>{qr.code}</Text> : null}
          </View>
        ) : null}
        </View>

        {/* ══ Table ══ (columns can be switched off in Settings → Rasid; the last one has no right line) */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <View style={styles.cellNo}><Text style={styles.headerCellText}>#</Text></View>
            {show.colCode ? <View style={styles.cellCode}><Text style={styles.headerCellText}>कोड</Text></View> : null}
            <View style={nameCell}>
              <Text style={[styles.headerCellText, { textAlign: 'center' }]}>नाम</Text>
            </View>
            {show.colDate ? <View style={dateCell}><Text style={styles.headerCellText}>दिनांक</Text></View> : null}
            {show.colMobile ? <View style={styles.cellMobile}><Text style={styles.headerCellText}>मोबाइल न.</Text></View> : null}
          </View>

          {filledEntries.map((entry, idx) => (
            <View key={idx} style={rowStyle}>
              <View style={styles.cellNo}>
                <Text style={styles.cellTextCenter}>
                  {entry ? (data.startIndex || 0) + idx + 1 : ''}
                </Text>
              </View>
              {show.colCode ? (
                <View style={styles.cellCode}>
                  <Text style={styles.cellTextCenter} maxLines={1} ellipsizeMode="tail">{entry ? clip(entry.code, 15) : ''}</Text>
                </View>
              ) : null}
              <View style={nameCell}>
                {/* Village appended to the name — no separate column */}
                {/* One line, cut at the column's REAL width (maxLines + ellipsis),
                    not at a guessed character count — the old 46-char clip
                    put "…" on names that still had plenty of room. The 120
                    clip only guards against absurdly long values. */}
                <Text style={[styles.cellTextLeft, { textOverflow: 'ellipsis' }]} maxLines={nameLines}>
                  {entry ? clip([entry.name, show.colVillage ? entry.village : ''].filter(Boolean).join('  '), 120) : ''}
                </Text>
              </View>
              {show.colDate ? (
                <View style={dateCell}>
                  <Text style={styles.cellTextCenter} maxLines={1}>{entry ? fmtDate(entry.date) : ''}</Text>
                </View>
              ) : null}
              {show.colMobile ? (
                <View style={styles.cellMobile}>
                  <Text style={styles.cellTextCenter} maxLines={1} ellipsizeMode="tail">{entry ? clip(entry.mobile, 13) : ''}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* ══ Total ══
            One page   → कुल राशि (unchanged).
            Many pages → every page: this page's total (its closings × instalment);
                         last page: also the receipt's full total. */}
        {multiPage ? (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>इस पेज का योग रु.: </Text>
              <Text style={styles.totalAmount}>{pageAmount.toLocaleString('en-IN')}</Text>
              {data.pageCalc ? <Text style={styles.pageTotalCalc}>({data.pageCalc})</Text> : null}
              {show.amountWords ? <Text style={styles.totalWordsValue}>{numberToHindiWords(pageAmount)}</Text> : null}
            </View>
            {isLast ? (
              <View style={styles.grandTotalRow}>
                <Text style={styles.totalLabel}>कुल राशि रु. (सभी {pageCount} पेज): </Text>
                <Text style={styles.totalAmount}>{total.toLocaleString('en-IN')}</Text>
                {show.amountWords ? <Text style={styles.totalWordsLabel}>शब्दों में रूपये : </Text> : null}
                {show.amountWords ? <Text style={styles.totalWordsValue}>
                  {data.totalInWords || numberToHindiWords(total)}
                </Text> : null}
              </View>
            ) : (
              <Text style={[styles.pageTotalCalc, { paddingHorizontal: 2 }]}>
                पेज {pageNo} / {pageCount} — कुल राशि अंतिम पेज पर
              </Text>
            )}
          </>
        ) : (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>कुल राशि रु.: </Text>
            <Text style={styles.totalAmount}>{total.toLocaleString('en-IN')}</Text>
            {show.amountWords ? <Text style={styles.totalWordsLabel}>शब्दों में रूपये : </Text> : null}
            {show.amountWords ? <Text style={styles.totalWordsValue}>
              {data.totalInWords || numberToHindiWords(total)}
            </Text> : null}
          </View>
        )}

        {/* ══ Worker + Signature ══ */}
        <View style={styles.workerRow}>
          <Text>
            {show.worker ? <Text style={styles.workerLabel}>{sep(D.workerLabel)}</Text> : null}
            {show.worker ? <Text style={styles.workerValue}>{data.worker || ''}</Text> : null}
          </Text>
          <Text style={styles.signatureText}>{D.signLabel}</Text>
        </View>

        {/* ══ Note ══ */}
        {show.note ? <Text style={styles.noteText}>Note : {data.note || ''}</Text> : null}

      </View>

      {/* ══ Footer — anchored to the page, never breaks to a second page ══ */}
      <View style={styles.footer} fixed>
        <Text style={{ width: 50, fontSize: 9, fontWeight: 'bold', color: D.colorMain }}>पेज {pageNo}/{pageCount}</Text>
        <View style={styles.footerCenter}>
          {D.footerContacts ? (
            <Text style={styles.footerContact}>
              {sep(D.contactLabel)}{D.footerContacts}
            </Text>
          ) : null}
          {D.jurisdiction ? <Text style={styles.footerSub}>{D.jurisdiction}</Text> : null}
        </View>
        <Text style={styles.footerEoe}>{D.eoe}</Text>
      </View>
    </Page>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
// Accepts the same shape as before. Lists longer than TOTAL_ROWS are split
// across pages so the layout stays fixed instead of overflowing.
// design: Settings → Rasid design (lib/rasid/ssgmsDesign.js); missing → the original rasid.
const ClosingRasidPdf = ({ entries = [], images = DEFAULT_IMAGES, rowsPerPage = TOTAL_ROWS, design }) => {
  const pages = [];
  const ROWS = rowsOf(rowsPerPage);
  const D = design ? normalizeRasidDesign(design) : DEFAULT_RASID_DESIGN;
  // an uploaded logo replaces the default one (the server sends it as a data URI)
  const imgs = { logo: D.logo || images.logo, right: D.rightLogo || images.right };

  entries.forEach((receipt, rIdx) => {
    const list = receipt.entries || [];
    const chunks = list.length > ROWS
      ? Array.from({ length: Math.ceil(list.length / ROWS) },
          (_, i) => list.slice(i * ROWS, (i + 1) * ROWS))
      : [list];
    // rasid runs give every line its own amount (a part-paid closing has a smaller baki)
    const lineAmounts = list.length > 0 && list.every((e) => typeof e?.amount === 'number');

    // Page total = closings on the page × the member's instalment
    // (sahyogRashi). If no instalment was passed, share the receipt total out
    // by row count instead — exact whenever every closing costs the same.
    const perRow = Number(receipt.sahyogRashi) || 0;
    const total  = Number(receipt.totalAmount || 0);
    chunks.forEach((chunk, cIdx) => {
      const chunkSum = lineAmounts ? chunk.reduce((a, e) => a + e.amount, 0) : 0;
      const sameEach = lineAmounts && chunk.every((e) => e.amount === chunk[0].amount);
      const pageAmount = lineAmounts
        ? Math.round(chunkSum)
        : perRow > 0
        ? chunk.length * perRow
        : (list.length ? Math.round(total * chunk.length / list.length) : 0);
      pages.push(
        <ClosingPage
          key={`${receipt.id || rIdx}_${cIdx}`}
          data={{
            ...receipt,
            entries: chunk,
            startIndex: cIdx * ROWS,
            pageNo: cIdx + 1,
            pageCount: chunks.length,
            pageAmount,
            pageCalc: lineAmounts
              ? (sameEach ? `${chunk.length} × ${Math.round(chunk[0].amount).toLocaleString('en-IN')}` : '')
              : perRow > 0 ? `${chunk.length} × ${perRow.toLocaleString('en-IN')}` : '',
          }}
          images={imgs}
          rows={ROWS}
          design={D}
        />
      );
    });
  });

  return <Document>{pages}</Document>;
};

export default ClosingRasidPdf;
