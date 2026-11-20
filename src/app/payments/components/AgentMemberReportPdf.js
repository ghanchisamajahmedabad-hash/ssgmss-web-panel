// Agent-wise closing payment report — one agent, every member of theirs.
//
// Used from /payments/closing-payment (a "Report" button on each agent row, and
// "Report PDF" for the agents on screen) and from /payments/closing-payment/[agentId].
//
// Per agent:
//   एजेंट का नाम, कोड, फोन
//   cards: कुल सदस्य · क्लोज हुए सदस्य · जमा पूरा (paid members) · बाकी वाले (pending members)
//          · कुल जमा राशि · कुल बाकी राशि
//   table: one row per member — reg. no, name / father, village, phone,
//          closings (paid / total), total, paid, pending, status
//   last page: the totals row
//
// Several agents in one file: each agent starts on a new page.
// Rows have a fixed height and are packed into pages here (react-pdf stacks the
// overflow of one long page on top of itself — the same reason AgentPaymentsPdf
// paginates by hand).

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
const NAVY   = '#1B385A';
const GREEN  = '#16a34a';
const AMBER  = '#b45309';
const BORDER = '#c7ced8';
const GREY   = '#6b7280';

const ROW_H = 18;
const FIRST_PAGE_ROWS = 28;   // letterhead + agent box + cards take the top of page 1
const OTHER_PAGE_ROWS = 38;

const styles = StyleSheet.create({
  page:  { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari', padding: 16 },
  frame: { flex: 1, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 3, padding: 12 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  logoBox:   { width: 58, alignItems: 'center' },
  logo:      { width: 52, height: 50, borderRadius: 3, objectFit: 'contain' },
  headCenter:{ flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  trustName: { fontSize: 16, fontWeight: 'bold', color: RED, textAlign: 'center' },
  trustPlace:{ fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginTop: 2 },
  trustAddr: { fontSize: 7, color: '#444', textAlign: 'center', marginTop: 2 },
  trustPhone:{ fontSize: 8, fontWeight: 'bold', color: NAVY, textAlign: 'center', marginTop: 2 },
  sinceRow:  { flexDirection: 'row', justifyContent: 'space-between',
               borderTopWidth: 0.8, borderTopColor: NAVY, paddingTop: 3, marginBottom: 6 },
  sinceText: { fontSize: 7.5, fontWeight: 'bold', color: NAVY },

  badgeWrap: { alignItems: 'center', marginBottom: 6 },
  badge:     { borderWidth: 1, borderColor: NAVY, borderRadius: 3,
               paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#f5f7fa' },
  badgeText: { fontSize: 10.5, fontWeight: 'bold', color: NAVY, textAlign: 'center' },

  agentBox:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
               borderWidth: 0.8, borderColor: BORDER, borderRadius: 3, backgroundColor: '#f8fafc',
               paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6 },
  agentName: { fontSize: 11, fontWeight: 'bold', color: NAVY },
  agentSub:  { fontSize: 7.5, color: GREY, marginTop: 1 },
  agentRight:{ fontSize: 7.5, color: GREY, textAlign: 'right' },

  filterText:{ fontSize: 7, color: GREY, marginBottom: 5 },

  cards:     { flexDirection: 'row', marginBottom: 8 },
  card:      { flex: 1, borderWidth: 0.8, borderColor: BORDER, borderRadius: 3,
               paddingVertical: 4, paddingHorizontal: 5, marginRight: 4 },
  cardLast:  { marginRight: 0 },
  cardLabel: { fontSize: 6.5, color: GREY },
  cardValue: { fontSize: 10, fontWeight: 'bold', color: NAVY, marginTop: 1 },

  contHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
               borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 3, marginBottom: 6 },
  contTitle: { fontSize: 9.5, fontWeight: 'bold', color: NAVY },
  contSub:   { fontSize: 7.5, color: GREY },

  table:   { borderWidth: 0.8, borderColor: BORDER },
  thRow:   { flexDirection: 'row', backgroundColor: NAVY, height: 20, alignItems: 'center' },
  th:      { fontSize: 7, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3 },
  row:     { flexDirection: 'row', height: ROW_H, alignItems: 'center',
             borderTopWidth: 0.3, borderTopColor: '#e5e7eb' },
  rowAlt:  { backgroundColor: '#f8fafc' },
  td:      { fontSize: 7, color: '#111', paddingHorizontal: 3 },
  tdSub:   { fontSize: 6, color: GREY },

  totalRow:{ flexDirection: 'row', height: 20, alignItems: 'center', backgroundColor: NAVY },
  totalTd: { fontSize: 7.5, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3 },

  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                borderTopWidth: 0.8, borderTopColor: BORDER, paddingTop: 5, marginTop: 'auto' },
  footerText: { fontSize: 6.5, color: GREY },
});

const COL = {
  sr:      { width: 20, textAlign: 'center' },
  reg:     { width: 62 },
  name:    { flex: 1 },
  village: { width: 62 },
  phone:   { width: 56 },
  cl:      { width: 40, textAlign: 'center' },
  total:   { width: 50, textAlign: 'right' },
  paid:    { width: 50, textAlign: 'right' },
  pending: { width: 50, textAlign: 'right' },
  status:  { width: 40, textAlign: 'center' },
};

const txt = (v) => {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
};
const clip = (v, max) => {
  const s = txt(v);
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};
const rs = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const num = (v) => Number(v) || 0;

/** A member's closing figures as the payment screens show them. */
export const memberClosingFigures = (m = {}) => {
  const total   = m.delete_flag ? 0 : num(m.closing_totalAmount);
  const paid    = num(m.closing_paidAmount);
  const pending = m.delete_flag ? 0 : (m.closing_pendingAmount ?? Math.max(0, total - paid));
  return {
    total, paid, pending: num(pending),
    totalCount: num(m.totalClosingCount),
    paidCount:  num(m.paidClosingCount),
    closed:     m.member_closed === true,
  };
};

/** status of one member for the report */
const statusOf = (f) => (f.closed ? 'Closed'
  : f.total <= 0 ? '—'
  : f.pending > 0 ? (f.paid > 0 ? 'Partial' : 'Pending')
  : 'Paid');
const statusColor = (s) => (s === 'Paid' ? GREEN : s === 'Closed' ? NAVY : s === 'Partial' ? AMBER : s === 'Pending' ? RED : GREY);

/** The six summary figures the report asks for. */
export const agentReportTotals = (members = []) => {
  const live = members.filter((m) => !m.delete_flag && !m.isDeleted);
  const fig = live.map(memberClosingFigures);
  return {
    members:        live.length,
    closedMembers:  fig.filter((f) => f.closed).length,
    paidMembers:    fig.filter((f) => f.total > 0 && f.pending <= 0).length,
    pendingMembers: fig.filter((f) => f.pending > 0).length,
    totalAmount:    fig.reduce((s, f) => s + f.total, 0),
    paidAmount:     fig.reduce((s, f) => s + f.paid, 0),
    pendingAmount:  fig.reduce((s, f) => s + f.pending, 0),
    closings:       fig.reduce((s, f) => s + f.totalCount, 0),
    paidClosings:   fig.reduce((s, f) => s + f.paidCount, 0),
  };
};

const Letterhead = () => (
  <>
    <View style={styles.headerRow}>
      <View style={styles.logoBox}><Image src="/Images/logoT.png" style={styles.logo} /></View>
      <View style={styles.headCenter}>
        <Text style={styles.trustName}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
        <Text style={styles.trustPlace}>अहमदाबाद, गुजरात</Text>
        <Text style={styles.trustAddr}>हेड ऑफिस : 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424</Text>
        <Text style={styles.trustPhone}>9374934004  •  9825289998  •  9426517804  •  9824017977</Text>
      </View>
      <View style={styles.logoBox}><Image src="/Images/sanidevImg.jpeg" style={styles.logo} /></View>
    </View>
    <View style={styles.sinceRow}>
      <Text style={styles.sinceText}>SINCE : 2024</Text>
      <Text style={styles.sinceText}>Reg. No: A/5231</Text>
    </View>
  </>
);

const TableHead = () => (
  <View style={styles.thRow}>
    <Text style={[styles.th, COL.sr]}>#</Text>
    <Text style={[styles.th, COL.reg]}>रजि. नं.</Text>
    <Text style={[styles.th, COL.name]}>नाम / पिता</Text>
    <Text style={[styles.th, COL.village]}>गाँव</Text>
    <Text style={[styles.th, COL.phone]}>मोबाइल</Text>
    <Text style={[styles.th, COL.cl]}>क्लोजिंग जमा/कुल</Text>
    <Text style={[styles.th, COL.total]}>कुल</Text>
    <Text style={[styles.th, COL.paid]}>जमा</Text>
    <Text style={[styles.th, COL.pending]}>बाकी</Text>
    <Text style={[styles.th, COL.status]}>स्थिति</Text>
  </View>
);

const Card = ({ label, value, color, last }) => (
  <View style={[styles.card, last && styles.cardLast]}>
    <Text style={styles.cardLabel}>{label}</Text>
    <Text style={[styles.cardValue, color ? { color } : null]}>{value}</Text>
  </View>
);

/** pages for one agent: [{ rows, first, last }] */
const pagesFor = (members) => {
  const out = [];
  let i = 0;
  let cap = FIRST_PAGE_ROWS;
  do {
    const rows = members.slice(i, i + cap);
    out.push({ rows, start: i, first: i === 0 });
    i += rows.length;
    cap = OTHER_PAGE_ROWS;
  } while (i < members.length);
  // the totals row needs one more line on the last page
  const lastPg = out[out.length - 1];
  if (lastPg.rows.length >= (lastPg.first ? FIRST_PAGE_ROWS : OTHER_PAGE_ROWS)) out.push({ rows: [], start: i, first: false });
  out[out.length - 1].last = true;
  return out;
};

/**
 * @param agents  [{ agent: { name, agentCode, phone, village, district }, members: [member docs] }]
 * @param title   heading on the badge
 * @param filterText  filters shown on the screen, or ''
 */
const AgentMemberReportPdf = ({ agents = [], title = 'एजेंट सदस्य भुगतान रिपोर्ट  •  Agent Member Payment Report', filterText = '' }) => {
  const generatedAt = dayjs().format('DD-MM-YYYY hh:mm A');
  const allPages = [];
  agents.forEach(({ agent = {}, members = [] }) => {
    const live = members
      .filter((m) => !m.delete_flag && !m.isDeleted)
      .sort((a, b) => String(a.registrationNumber || '').localeCompare(String(b.registrationNumber || ''), 'en', { numeric: true }));
    const t = agentReportTotals(live);
    pagesFor(live).forEach((p) => allPages.push({ ...p, agent, totals: t, count: live.length }));
  });
  const totalPages = allPages.length || 1;

  return (
    <Document>
      {allPages.map(({ agent: a, totals: t, rows, start, first, last }, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          <View style={styles.frame}>
            {first ? (
              <>
                <Letterhead />
                <View style={styles.badgeWrap}>
                  <View style={styles.badge}><Text style={styles.badgeText}>{title}</Text></View>
                </View>
                <View style={styles.agentBox}>
                  <View>
                    <Text style={styles.agentName}>
                      एजेंट : {clip(a.name, 50) || '—'}{a.agentCode ? `  (${a.agentCode})` : ''}
                    </Text>
                    <Text style={styles.agentSub}>
                      {[txt(a.phone1 || a.phone), [a.village, a.district].filter(Boolean).join(', ')].filter(Boolean).join('  •  ')}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.agentRight}>दिनांक : {dayjs().format('DD-MM-YYYY')}</Text>
                    <Text style={styles.agentRight}>क्लोजिंग : {t.paidClosings} / {t.closings} जमा</Text>
                  </View>
                </View>
                {filterText ? <Text style={styles.filterText}>Filters: {filterText}</Text> : null}
                <View style={styles.cards}>
                  <Card label="कुल सदस्य" value={t.members} />
                  <Card label="क्लोज हुए सदस्य" value={t.closedMembers} />
                  <Card label="जमा पूरा (सदस्य)" value={t.paidMembers} color={GREEN} />
                  <Card label="बाकी वाले (सदस्य)" value={t.pendingMembers} color={RED} />
                  <Card label="कुल जमा राशि" value={rs(t.paidAmount)} color={GREEN} />
                  <Card label="कुल बाकी राशि" value={rs(t.pendingAmount)} color={RED} last />
                </View>
              </>
            ) : (
              <View style={styles.contHead}>
                <Text style={styles.contTitle}>एजेंट : {clip(a.name, 50)}{a.agentCode ? ` (${a.agentCode})` : ''} — सदस्य सूची (जारी)</Text>
                <Text style={styles.contSub}>{dayjs().format('DD-MM-YYYY')}</Text>
              </View>
            )}

            <View style={styles.table}>
              <TableHead />
              {rows.map((m, i) => {
                const f = memberClosingFigures(m);
                const st = statusOf(f);
                return (
                  <View key={m.id || i} style={[styles.row, (start + i) % 2 ? styles.rowAlt : null]} wrap={false}>
                    <Text style={[styles.td, COL.sr]}>{start + i + 1}</Text>
                    <Text style={[styles.td, COL.reg]}>{clip(m.registrationNumber, 14) || '—'}</Text>
                    <Text style={[styles.td, COL.name]}>
                      {clip([m.displayName, m.fatherName ? '/ ' + m.fatherName : ''].filter(Boolean).join(' '), 44) || '—'}
                    </Text>
                    <Text style={[styles.td, COL.village]}>{clip(m.village, 14) || '—'}</Text>
                    <Text style={[styles.td, COL.phone]}>{txt(m.phone) || '—'}</Text>
                    <Text style={[styles.td, COL.cl]}>{f.paidCount}/{f.totalCount}</Text>
                    <Text style={[styles.td, COL.total]}>{rs(f.total)}</Text>
                    <Text style={[styles.td, COL.paid, { color: GREEN }]}>{rs(f.paid)}</Text>
                    <Text style={[styles.td, COL.pending, { color: f.pending > 0 ? RED : GREY, fontWeight: f.pending > 0 ? 'bold' : 'normal' }]}>{rs(f.pending)}</Text>
                    <Text style={[styles.td, COL.status, { color: statusColor(st), fontWeight: 'bold' }]}>{st}</Text>
                  </View>
                );
              })}
              {last && (
                <View style={styles.totalRow} wrap={false}>
                  <Text style={[styles.totalTd, COL.sr]}></Text>
                  <Text style={[styles.totalTd, COL.reg]}>कुल</Text>
                  <Text style={[styles.totalTd, COL.name]}>{t.members} सदस्य · {t.closedMembers} क्लोज · {t.paidMembers} जमा · {t.pendingMembers} बाकी</Text>
                  <Text style={[styles.totalTd, COL.village]}></Text>
                  <Text style={[styles.totalTd, COL.phone]}></Text>
                  <Text style={[styles.totalTd, COL.cl]}>{t.paidClosings}/{t.closings}</Text>
                  <Text style={[styles.totalTd, COL.total]}>{rs(t.totalAmount)}</Text>
                  <Text style={[styles.totalTd, COL.paid]}>{rs(t.paidAmount)}</Text>
                  <Text style={[styles.totalTd, COL.pending]}>{rs(t.pendingAmount)}</Text>
                  <Text style={[styles.totalTd, COL.status]}></Text>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Generated : {generatedAt}</Text>
              <Text style={styles.footerText}>Page {pageIdx + 1} of {totalPages}</Text>
              <Text style={styles.footerText}>SSGMS Web Panel</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
};

export default AgentMemberReportPdf;

// react-pdf is loaded only when the button is clicked.
export const downloadAgentMemberReportPdf = async ({ fileName, ...props }) => {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<AgentMemberReportPdf {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
