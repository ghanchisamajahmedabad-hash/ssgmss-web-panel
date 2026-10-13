// Scheme-wise member list.
//
// Layout follows the list the trust already circulates: a summary sheet listing
// each yojna and its head-count, then one section per yojna with the members.
// Letterhead, badge and footer repeat on every sheet so any page torn out of
// the stack still identifies itself.
//
// Pagination is done here, by chunking, rather than handing every row to
// react-pdf inside one <Page>. Left to itself with hundreds of rows it keeps
// the column heading on sheet one and stacks the overflow on top of itself on
// the last sheet.

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
const BORDER = '#c7ced8';
const GREY   = '#6b7280';

// ── Trust letterhead ─────────────────────────────────────────────────────────
const TRUST = {
  name:    'श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट',
  place:   'अहमदाबाद, गुजरात',
  address: 'हेड ऑफिस : 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास, चांदखेडा, साबरमती, अहमदाबाद 382424',
  phones:  '9374934004  •  9825289998  •  9426517804  •  9824017977',
  regNo:   'Reg. No: A/5231',
  since:   'SINCE : 2024',
};

// A4 portrait is 842pt tall. Once the page padding, frame, letterhead, badge,
// context line, column heading and footer are placed, about 600pt is left for
// rows.
//
// A member row is TWO lines — name over registration number — which measures
// ~28pt, not the ~23pt the styles suggest, so 21 is the true ceiling. Rendering
// 25 pushed the last rows and the footer onto an extra sheet: 9 declared pages
// came out as 14 physical ones, and the footer still read "of 9". Set to 20,
// one clear row under what fits, and verified by rendering.
// Summary rows are a single line (~20pt), so more of them fit.
const ROWS_PER_PAGE    = 20;
const SUMMARY_PER_PAGE = 26;

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari', padding: 16 },
  // The thin frame the printed list carries.
  frame: { flex: 1, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 3, padding: 12 },

  // ── Letterhead ──
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  logoBox:   { width: 58, alignItems: 'center' },
  logo:      { width: 52, height: 50, borderRadius: 3, objectFit: 'contain' },
  headCenter:{ flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  trustName: { fontSize: 17, fontWeight: 'bold', color: RED, textAlign: 'center' },
  trustPlace:{ fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginTop: 2 },
  trustAddr: { fontSize: 7, color: '#444', textAlign: 'center', marginTop: 2, lineHeight: 1.35 },
  trustPhone:{ fontSize: 8, fontWeight: 'bold', color: NAVY, textAlign: 'center', marginTop: 2 },

  sinceRow:  { flexDirection: 'row', justifyContent: 'space-between',
               borderTopWidth: 0.8, borderTopColor: NAVY, paddingTop: 3, marginBottom: 6 },
  sinceText: { fontSize: 7.5, fontWeight: 'bold', color: NAVY },

  // ── Badge ──
  badgeWrap: { alignItems: 'center', marginBottom: 8 },
  badge:     { borderWidth: 1, borderColor: NAVY, borderRadius: 3,
               paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#f5f7fa' },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: NAVY, textAlign: 'center' },

  // ── Context lines ──
  metaRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { fontSize: 8.5, fontWeight: 'bold', color: '#111' },
  metaValue: { fontSize: 8.5, color: '#333' },

  // ── Table ──
  table:   { borderWidth: 0.8, borderColor: BORDER },
  thRow:   { flexDirection: 'row', backgroundColor: NAVY },
  thCell:  { fontSize: 7.5, fontWeight: 'bold', color: '#fff',
             paddingVertical: 5, paddingHorizontal: 4 },
  tr:      { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: BORDER,
             minHeight: 23, alignItems: 'center' },
  trAlt:   { backgroundColor: '#f8fafc' },
  td:      { fontSize: 7.5, color: '#111', paddingVertical: 4, paddingHorizontal: 4 },
  tdName:  { fontSize: 8, fontWeight: 'bold', color: '#111' },
  tdSub:   { fontSize: 6.5, color: GREY, marginTop: 1 },

  // ── Footer ──
  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                borderTopWidth: 0.8, borderTopColor: BORDER, paddingTop: 5, marginTop: 'auto' },
  footerText: { fontSize: 6.5, color: GREY },
  footerBold: { fontSize: 6.5, color: GREY, fontWeight: 'bold' },
});

const txt = (v) => {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
};
const clip = (v, max) => {
  const s = txt(v);
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};

const Letterhead = () => (
  <>
    <View style={styles.headerRow}>
      <View style={styles.logoBox}>
        <Image src="/Images/logoT.png" style={styles.logo} />
      </View>
      <View style={styles.headCenter}>
        <Text style={styles.trustName}>{TRUST.name}</Text>
        <Text style={styles.trustPlace}>{TRUST.place}</Text>
        <Text style={styles.trustAddr}>{TRUST.address}</Text>
        <Text style={styles.trustPhone}>{TRUST.phones}</Text>
      </View>
      <View style={styles.logoBox}>
        <Image src="/Images/sanidevImg.jpeg" style={styles.logo} />
      </View>
    </View>
    <View style={styles.sinceRow}>
      <Text style={styles.sinceText}>{TRUST.since}</Text>
      <Text style={styles.sinceText}>{TRUST.regNo}</Text>
    </View>
  </>
);

const Badge = ({ children }) => (
  <View style={styles.badgeWrap}>
    <View style={styles.badge}><Text style={styles.badgeText}>{children}</Text></View>
  </View>
);

const Footer = ({ page, total, generatedAt }) => (
  <View style={styles.footer}>
    <Text style={styles.footerText}>Generated : {generatedAt}</Text>
    <Text style={styles.footerText}>Page {page} of {total}</Text>
    <Text style={styles.footerBold}>{TRUST.name} © {dayjs().year()}</Text>
  </View>
);

const MemberListSchemePdf = ({ members = [], filters = {}, programList = [], agentList = [] }) => {
  const generatedAt = dayjs().format('DD MMMM YYYY [at] hh:mm a');

  const progName = (m) =>
    txt(m.programName) ||
    txt(programList.find(p => p.id === m.programId)?.name) ||
    'अन्य';

  // ── Group by yojna, each group's members sorted by name ───────────────────
  const groups = [];
  const byName = new Map();
  for (const m of members) {
    const key = progName(m);
    if (!byName.has(key)) { byName.set(key, { name: key, rows: [] }); groups.push(byName.get(key)); }
    byName.get(key).rows.push(m);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  groups.forEach(g => g.rows.sort((a, b) =>
    txt(a.displayName || a.name).localeCompare(txt(b.displayName || b.name))));

  // Whose list this is — an agent filter is the usual case, and the sheet has
  // to say so or two different lists look identical.
  const agent = filters.agentId && filters.agentId !== 'all'
    ? agentList.find(a => a.id === filters.agentId)
    : null;
  const whoLabel = agent
    ? `${txt(agent.name || agent.displayName)}${agent.phone ? ` (${agent.phone})` : ''}`
    : 'सभी एजेंट';

  // ── Lay the sheets out up front, so the footer can say "Page 3 of 9" ──────
  const sheets = [];

  for (let i = 0; i < Math.max(1, Math.ceil(groups.length / SUMMARY_PER_PAGE)); i++) {
    sheets.push({ kind: 'summary', rows: groups.slice(i * SUMMARY_PER_PAGE, (i + 1) * SUMMARY_PER_PAGE),
                  offset: i * SUMMARY_PER_PAGE });
  }
  for (const g of groups) {
    for (let i = 0; i < Math.max(1, Math.ceil(g.rows.length / ROWS_PER_PAGE)); i++) {
      sheets.push({
        kind: 'members', scheme: g.name,
        rows: g.rows.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE),
        offset: i * ROWS_PER_PAGE,
        part: i + 1,
        parts: Math.max(1, Math.ceil(g.rows.length / ROWS_PER_PAGE)),
      });
    }
  }

  const totalPages = sheets.length;

  return (
    <Document>
      {sheets.map((sheet, idx) => (
        <Page key={idx} size="A4" style={styles.page}>
          <View style={styles.frame}>
            <Letterhead />

            {sheet.kind === 'summary' ? (
              <>
                <Badge>सदस्य सूची  •  Member List</Badge>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>एजेंट : <Text style={styles.metaValue}>{whoLabel}</Text></Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>कुल सदस्य : <Text style={styles.metaValue}>{members.length}</Text></Text>
                  <Text style={styles.metaLabel}>कुल योजनाएँ : <Text style={styles.metaValue}>{groups.length}</Text></Text>
                </View>

                <View style={styles.table}>
                  <View style={styles.thRow}>
                    <Text style={[styles.thCell, { width: 36, textAlign: 'center' }]}>क्र.</Text>
                    <Text style={[styles.thCell, { flex: 1 }]}>योजना का नाम</Text>
                    <Text style={[styles.thCell, { width: 70, textAlign: 'center' }]}>सदस्य</Text>
                  </View>
                  {sheet.rows.map((g, i) => (
                    <View key={g.name} style={[styles.tr, i % 2 === 1 && styles.trAlt]} wrap={false}>
                      <Text style={[styles.td, { width: 36, textAlign: 'center' }]}>{sheet.offset + i + 1}</Text>
                      <Text style={[styles.td, { flex: 1 }]}>{g.name}</Text>
                      <Text style={[styles.td, { width: 70, textAlign: 'center' }]}>{g.rows.length}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Badge>
                  {sheet.scheme} — सदस्य सूची
                  {sheet.parts > 1 ? `  (${sheet.part}/${sheet.parts})` : ''}
                </Badge>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>एजेंट : <Text style={styles.metaValue}>{whoLabel}</Text></Text>
                  <Text style={styles.metaLabel}>सदस्य : <Text style={styles.metaValue}>
                    {groups.find(g => g.name === sheet.scheme)?.rows.length || 0}
                  </Text></Text>
                </View>

                <View style={styles.table}>
                  <View style={styles.thRow}>
                    <Text style={[styles.thCell, { width: 30, textAlign: 'center' }]}>क्र.</Text>
                    <Text style={[styles.thCell, { flex: 1.25 }]}>सदस्य का नाम</Text>
                    <Text style={[styles.thCell, { flex: 1 }]}>पिता / पति का नाम</Text>
                    <Text style={[styles.thCell, { width: 66 }]}>मोबाइल नं.</Text>
                    <Text style={[styles.thCell, { flex: 0.95 }]}>गाँव / शहर</Text>
                  </View>
                  {sheet.rows.map((m, i) => (
                    <View key={m.id || i} style={[styles.tr, i % 2 === 1 && styles.trAlt]} wrap={false}>
                      <Text style={[styles.td, { width: 30, textAlign: 'center' }]}>{sheet.offset + i + 1}</Text>
                      <View style={[styles.td, { flex: 1.25 }]}>
                        <Text style={styles.tdName}>{clip(m.displayName || m.name, 30) || '—'}</Text>
                        {/* Registration number under the name, as on the printed list */}
                        <Text style={styles.tdSub}>{txt(m.registrationNumber)}</Text>
                      </View>
                      <Text style={[styles.td, { flex: 1 }]}>{clip(m.fatherName, 28) || '—'}</Text>
                      <Text style={[styles.td, { width: 66 }]}>{txt(m.phone) || '—'}</Text>
                      <Text style={[styles.td, { flex: 0.95 }]}>
                        {clip([txt(m.village), txt(m.city)].filter(Boolean).join(', '), 26) || '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Footer page={idx + 1} total={totalPages} generatedAt={generatedAt} />
          </View>
        </Page>
      ))}
    </Document>
  );
};

export default MemberListSchemePdf;
