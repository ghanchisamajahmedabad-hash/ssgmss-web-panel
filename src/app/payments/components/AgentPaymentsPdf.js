// Agent-wise payment report — shared by /payments/join-fees and
// /payments/closing-payment.
//
// One row per agent (name, village, phone, members, total, paid, pending),
// with that agent's yojna rows indented underneath, and a grand-total row at
// the end. The calling page passes rows that are already filtered and
// normalised, so this file knows nothing about join-fee vs closing fields.
//
// Pagination is done here, by measuring blocks, rather than letting react-pdf
// break one long <Page>: with a few hundred rows react-pdf stacks the
// overflow on top of itself on the last sheet (the same bug the member list
// PDF had). An agent and its yojna rows are kept together on one page.

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
const BORDER = '#c7ced8';
const GREY   = '#6b7280';

// Heights used for packing rows into pages (pt). Rows have fixed heights so
// these are exact; page budgets are kept a little under what fits and were
// verified by rendering.
const AGENT_ROW_H = 24;
const PROG_ROW_H  = 14;
const FIRST_PAGE_BUDGET = 500;
const OTHER_PAGE_BUDGET = 660;

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

  badgeWrap: { alignItems: 'center', marginBottom: 8 },
  badge:     { borderWidth: 1, borderColor: NAVY, borderRadius: 3,
               paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#f5f7fa' },
  badgeText: { fontSize: 10.5, fontWeight: 'bold', color: NAVY, textAlign: 'center' },

  filterText:{ fontSize: 7.5, color: GREY, marginBottom: 5 },

  cards:     { flexDirection: 'row', marginBottom: 8 },
  card:      { flex: 1, borderWidth: 0.8, borderColor: BORDER, borderRadius: 3,
               paddingVertical: 5, paddingHorizontal: 6, marginRight: 5 },
  cardLast:  { marginRight: 0 },
  cardLabel: { fontSize: 6.5, color: GREY },
  cardValue: { fontSize: 10.5, fontWeight: 'bold', color: NAVY, marginTop: 1 },

  contHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
               borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 3, marginBottom: 6 },
  contTitle: { fontSize: 9.5, fontWeight: 'bold', color: NAVY },
  contSub:   { fontSize: 7.5, color: GREY },

  table:   { borderWidth: 0.8, borderColor: BORDER },
  thRow:   { flexDirection: 'row', backgroundColor: NAVY, height: 18, alignItems: 'center' },
  th:      { fontSize: 7.5, fontWeight: 'bold', color: '#fff', paddingHorizontal: 4 },

  agentRow:{ flexDirection: 'row', height: AGENT_ROW_H, alignItems: 'center',
             borderTopWidth: 0.5, borderTopColor: BORDER, backgroundColor: '#f1f5f9' },
  progRow: { flexDirection: 'row', height: PROG_ROW_H, alignItems: 'center',
             borderTopWidth: 0.3, borderTopColor: '#e5e7eb' },
  td:      { fontSize: 7.5, color: '#111', paddingHorizontal: 4 },
  tdBold:  { fontSize: 8, fontWeight: 'bold', color: '#111' },
  tdSub:   { fontSize: 6.5, color: GREY },
  tdProg:  { fontSize: 7, color: '#374151', paddingHorizontal: 4 },

  totalRow:{ flexDirection: 'row', height: 20, alignItems: 'center', backgroundColor: NAVY },
  totalTd: { fontSize: 8, fontWeight: 'bold', color: '#fff', paddingHorizontal: 4 },

  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                borderTopWidth: 0.8, borderTopColor: BORDER, paddingTop: 5, marginTop: 'auto' },
  footerText: { fontSize: 6.5, color: GREY },
});

// Column widths, shared by heading, agent rows, yojna rows and the total row
const COL = {
  sr:      { width: 24, textAlign: 'center' },
  agent:   { flex: 1 },
  phone:   { width: 64 },
  members: { width: 44, textAlign: 'center' },
  total:   { width: 62, textAlign: 'right' },
  paid:    { width: 62, textAlign: 'right' },
  pending: { width: 62, textAlign: 'right' },
  status:  { width: 52, textAlign: 'center' },
};

const txt = (v) => {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
};
const clip = (v, max) => {
  const s = txt(v);
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};
const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

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
    <Text style={[styles.th, COL.agent]}>एजेंट / योजना</Text>
    <Text style={[styles.th, COL.phone]}>मोबाइल</Text>
    <Text style={[styles.th, COL.members]}>सदस्य</Text>
    <Text style={[styles.th, COL.total]}>कुल राशि</Text>
    <Text style={[styles.th, COL.paid]}>जमा</Text>
    <Text style={[styles.th, COL.pending]}>बकाया</Text>
    <Text style={[styles.th, COL.status]}>Status</Text>
  </View>
);

/**
 * @param {string} title       e.g. 'जॉइन फीस रिपोर्ट • Join Fees Report'
 * @param {string} filterText  human-readable filters applied on screen, or ''
 * @param {Array}  agents      [{ name, place, phone, members, total, paid, pending,
 *                               programs: [{ name, members, total, paid, pending }] }]
 */
const AgentPaymentsPdf = ({ title, filterText = '', agents = [] }) => {
  const generatedAt = dayjs().format('DD-MM-YYYY hh:mm A');

  const sum = (k) => agents.reduce((s, a) => s + (Number(a[k]) || 0), 0);
  const totals = {
    members: sum('members'), total: sum('total'), paid: sum('paid'), pending: sum('pending'),
  };
  const pct = totals.total ? Math.round((totals.paid / totals.total) * 100) : 0;

  // ── Pack agent blocks into pages ─────────────────────────────────────────
  // A block is the agent row plus its yojna rows. A block that wouldn't fit in
  // what's left of a page starts a new page; one bigger than a whole page is
  // split (its continuation repeats the agent row).
  const pages = [[]];
  let left = FIRST_PAGE_BUDGET;
  const newPage = () => { pages.push([]); left = OTHER_PAGE_BUDGET; };

  agents.forEach((a, idx) => {
    let progs = a.programs || [];
    let first = true;
    do {
      const need = AGENT_ROW_H + progs.length * PROG_ROW_H;
      if (need > left && pages[pages.length - 1].length > 0) newPage();
      const fit = Math.max(0, Math.floor((left - AGENT_ROW_H) / PROG_ROW_H));
      const chunk = progs.slice(0, fit);
      pages[pages.length - 1].push({ agent: a, sr: idx + 1, progs: chunk, cont: !first });
      left -= AGENT_ROW_H + chunk.length * PROG_ROW_H;
      progs = progs.slice(chunk.length);
      first = false;
      if (progs.length) newPage();
    } while (progs.length);
  });
  // Grand-total row needs room on the last page
  if (left < 22) newPage();
  const totalPages = pages.length;

  return (
    <Document>
      {pages.map((blocks, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          <View style={styles.frame}>
            {pageIdx === 0 ? (
              <>
                <Letterhead />
                <View style={styles.badgeWrap}>
                  <View style={styles.badge}><Text style={styles.badgeText}>{title}</Text></View>
                </View>
                {filterText ? <Text style={styles.filterText}>Filters: {filterText}</Text> : null}
                <View style={styles.cards}>
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>एजेंट / सदस्य</Text>
                    <Text style={styles.cardValue}>{agents.length} / {totals.members}</Text>
                  </View>
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>कुल राशि</Text>
                    <Text style={styles.cardValue}>{rs(totals.total)}</Text>
                  </View>
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>जमा ({pct}%)</Text>
                    <Text style={[styles.cardValue, { color: GREEN }]}>{rs(totals.paid)}</Text>
                  </View>
                  <View style={[styles.card, styles.cardLast]}>
                    <Text style={styles.cardLabel}>बकाया</Text>
                    <Text style={[styles.cardValue, { color: RED }]}>{rs(totals.pending)}</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.contHead}>
                <Text style={styles.contTitle}>{title}</Text>
                <Text style={styles.contSub}>{dayjs().format('DD-MM-YYYY')}</Text>
              </View>
            )}

            <View style={styles.table}>
              <TableHead />
              {blocks.map(({ agent: a, sr, progs, cont }, bi) => (
                <React.Fragment key={`${sr}-${bi}`}>
                  <View style={styles.agentRow} wrap={false}>
                    <Text style={[styles.td, COL.sr]}>{sr}</Text>
                    <View style={[styles.td, COL.agent]}>
                      <Text style={styles.tdBold}>{clip(a.name, 40) || '—'}{cont ? ' (contd.)' : ''}</Text>
                      <Text style={styles.tdSub}>{clip(a.place, 50)}</Text>
                    </View>
                    <Text style={[styles.td, COL.phone]}>{txt(a.phone) || '—'}</Text>
                    <Text style={[styles.td, COL.members]}>{a.members || 0}</Text>
                    <Text style={[styles.td, COL.total]}>{rs(a.total)}</Text>
                    <Text style={[styles.td, COL.paid, { color: GREEN }]}>{rs(a.paid)}</Text>
                    <Text style={[styles.td, COL.pending, { color: a.pending > 0 ? RED : GREEN, fontWeight: 'bold' }]}>{rs(a.pending)}</Text>
                    <Text style={[styles.td, COL.status, { color: a.pending > 0 ? RED : GREEN }]}>
                      {a.pending > 0 ? 'Pending' : 'Paid'}
                    </Text>
                  </View>
                  {progs.map((p, pi) => (
                    <View key={pi} style={styles.progRow} wrap={false}>
                      <Text style={[styles.tdProg, COL.sr]}></Text>
                      <Text style={[styles.tdProg, COL.agent]}>↳ {clip(p.name, 46) || '—'}</Text>
                      <Text style={[styles.tdProg, COL.phone]}></Text>
                      <Text style={[styles.tdProg, COL.members]}>{p.members || 0}</Text>
                      <Text style={[styles.tdProg, COL.total]}>{rs(p.total)}</Text>
                      <Text style={[styles.tdProg, COL.paid]}>{rs(p.paid)}</Text>
                      <Text style={[styles.tdProg, COL.pending, { color: p.pending > 0 ? RED : '#374151' }]}>{rs(p.pending)}</Text>
                      <Text style={[styles.tdProg, COL.status]}></Text>
                    </View>
                  ))}
                </React.Fragment>
              ))}

              {pageIdx === totalPages - 1 && (
                <View style={styles.totalRow} wrap={false}>
                  <Text style={[styles.totalTd, COL.sr]}></Text>
                  <Text style={[styles.totalTd, COL.agent]}>कुल योग  ({agents.length} एजेंट)</Text>
                  <Text style={[styles.totalTd, COL.phone]}></Text>
                  <Text style={[styles.totalTd, COL.members]}>{totals.members}</Text>
                  <Text style={[styles.totalTd, COL.total]}>{rs(totals.total)}</Text>
                  <Text style={[styles.totalTd, COL.paid]}>{rs(totals.paid)}</Text>
                  <Text style={[styles.totalTd, COL.pending]}>{rs(totals.pending)}</Text>
                  <Text style={[styles.totalTd, COL.status]}>{pct}%</Text>
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

export default AgentPaymentsPdf;

// ── Download helper used by both pages ─────────────────────────────────────
// react-pdf is loaded only when the button is clicked, so it doesn't weigh on
// the page's first load.
export const downloadAgentPaymentsPdf = async ({ fileName, ...props }) => {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<AgentPaymentsPdf {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
