// "क्लोजिंग का पूरा हिसाब" as a PDF — exactly what ClosingHistoryDrawer shows
// (same rows, same totals), for a closed member (join → own closing) or an
// active member (join → today). Built from the drawer's own rows, so the PDF and
// the screen can never disagree.
import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';
import dayjs from 'dayjs';
import { LATE_LABEL, GRACE_DAYS } from '@/app/members/components/closingLateness';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

const RED = '#D3292F', NAVY = '#1B385A', GREEN = '#16a34a', AMBER = '#b45309', BORDER = '#c7ced8', GREY = '#6b7280';
const ROW_H = 18, FIRST_ROWS = 27, OTHER_ROWS = 38;
const fmt = (d) => (d ? d.format('DD-MM-YYYY') : '—');
const rs = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const clip = (v, max) => { const s = String(v ?? '').trim(); return s.length > max ? s.slice(0, max - 1) + '…' : s; };
const STATUS_COLOR = { PAID_ON_TIME: GREEN, PAID_LATE: AMBER, OVERDUE: RED, PENDING_DUE: '#2563eb', UNKNOWN: GREY };

const st = StyleSheet.create({
  page: { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari', padding: 16 },
  frame: { flex: 1, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 3, padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  logoBox: { width: 58, alignItems: 'center' },
  logo: { width: 52, height: 50, objectFit: 'contain' },
  headCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  trustName: { fontSize: 16, fontWeight: 'bold', color: RED, textAlign: 'center' },
  trustPlace: { fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginTop: 2 },
  trustAddr: { fontSize: 7, color: '#444', textAlign: 'center', marginTop: 2 },
  sinceRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.8, borderTopColor: NAVY, paddingTop: 3, marginBottom: 6 },
  sinceText: { fontSize: 7.5, fontWeight: 'bold', color: NAVY },
  badgeWrap: { alignItems: 'center', marginBottom: 6 },
  badge: { borderWidth: 1, borderColor: NAVY, borderRadius: 3, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#f5f7fa' },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: NAVY, textAlign: 'center' },
  info: { borderWidth: 0.8, borderColor: BORDER, borderRadius: 3, padding: 6, marginBottom: 6, backgroundColor: '#f8fafc' },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  infoCell: { flex: 1, fontSize: 8 },
  lbl: { color: RED, fontWeight: 'bold' },
  cards: { flexDirection: 'row', marginBottom: 6 },
  card: { flex: 1, borderWidth: 0.8, borderColor: BORDER, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 5, marginRight: 3 },
  cardLabel: { fontSize: 6.5, color: GREY },
  cardValue: { fontSize: 10, fontWeight: 'bold', color: NAVY, marginTop: 1 },
  cardNote: { fontSize: 6, color: GREY },
  table: { borderWidth: 0.8, borderColor: BORDER },
  thRow: { flexDirection: 'row', backgroundColor: NAVY, height: 20, alignItems: 'center' },
  th: { fontSize: 7, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3 },
  row: { flexDirection: 'row', height: ROW_H, alignItems: 'center', borderTopWidth: 0.3, borderTopColor: '#e5e7eb' },
  td: { fontSize: 7.2, color: '#111', paddingHorizontal: 3 },
  totalRow: { flexDirection: 'row', height: 20, alignItems: 'center', backgroundColor: NAVY },
  totalTd: { fontSize: 7.5, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3 },
  contHead: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 3, marginBottom: 6 },
  contTitle: { fontSize: 9, fontWeight: 'bold', color: NAVY },
  note: { fontSize: 6.8, color: GREY, marginTop: 5, lineHeight: 1.4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.8, borderTopColor: BORDER, paddingTop: 5, marginTop: 'auto' },
  footerText: { fontSize: 6.5, color: GREY },
});
const COL = {
  sr: { width: 20, textAlign: 'center' }, name: { flex: 1 }, closed: { width: 54, textAlign: 'center' },
  due: { width: 54, textAlign: 'center' }, amt: { width: 44, textAlign: 'right' }, paid: { width: 44, textAlign: 'right' },
  paidOn: { width: 54, textAlign: 'center' }, status: { width: 86, textAlign: 'center' },
};

const Card = ({ label, value, color, note }) => (
  <View style={st.card}>
    <Text style={st.cardLabel}>{label}</Text>
    <Text style={[st.cardValue, color ? { color } : null]}>{value}</Text>
    {note ? <Text style={st.cardNote}>{note}</Text> : null}
  </View>
);

/**
 * member, programName, joinDay, endDay (dayjs), isClosed,
 * rows  — the drawer's rows ({ sr, name, regNo, closedOn, dueDate, charged, amount, paidAmount, paidOn, status, daysLate, outside })
 * sums  — the drawer's totals ({ inWindow, charged, notCharged, paidEvents, due, paid, pending, late })
 */
export const ClosingHistoryPdf = ({ member = {}, programName = '', joinDay, endDay, isClosed, rows = [], sums = {} }) => {
  const pages = [];
  let i = 0, cap = FIRST_ROWS;
  do { pages.push({ start: i, rows: rows.slice(i, i + cap) }); i += cap; cap = OTHER_ROWS; } while (i < rows.length);
  const last = pages[pages.length - 1];
  if (last.rows.length >= (pages.length === 1 ? FIRST_ROWS : OTHER_ROWS) - 1) pages.push({ start: i, rows: [] });
  const months = joinDay && endDay ? endDay.diff(joinDay, 'month') : null;
  const generated = dayjs().format('DD-MM-YYYY hh:mm A');

  return (
    <Document>
      {pages.map((p, pi) => (
        <Page key={pi} size="A4" style={st.page}>
          <View style={st.frame}>
            {pi === 0 ? (
              <>
                <View style={st.headerRow}>
                  <View style={st.logoBox}><Image src="/Images/logoT.png" style={st.logo} /></View>
                  <View style={st.headCenter}>
                    <Text style={st.trustName}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
                    <Text style={st.trustPlace}>अहमदाबाद, गुजरात</Text>
                    <Text style={st.trustAddr}>हेड ऑफिस : 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424</Text>
                  </View>
                  <View style={st.logoBox}><Image src="/Images/sanidevImg.jpeg" style={st.logo} /></View>
                </View>
                <View style={st.sinceRow}>
                  <Text style={st.sinceText}>SINCE : 2024</Text>
                  <Text style={st.sinceText}>Reg. No: A/5231</Text>
                </View>
                <View style={st.badgeWrap}><View style={st.badge}><Text style={st.badgeText}>क्लोजिंग का पूरा हिसाब</Text></View></View>
                <View style={st.info}>
                  <View style={st.infoRow}>
                    <Text style={st.infoCell}><Text style={st.lbl}>नाम : </Text>{clip([member.displayName, member.fatherName ? '/ ' + member.fatherName : ''].filter(Boolean).join(' '), 50)}</Text>
                    <Text style={st.infoCell}><Text style={st.lbl}>रजि. नं. : </Text>{member.registrationNumber || '—'}</Text>
                  </View>
                  <View style={st.infoRow}>
                    <Text style={st.infoCell}><Text style={st.lbl}>योजना : </Text>{programName || '—'}</Text>
                    <Text style={st.infoCell}><Text style={st.lbl}>फोन : </Text>{member.phone || '—'}   <Text style={st.lbl}>किस्त राशि : </Text>{rs(member.payAmount)}</Text>
                  </View>
                  <View style={st.infoRow}>
                    <Text style={st.infoCell}><Text style={st.lbl}>जॉइन तिथि : </Text>{fmt(joinDay)}</Text>
                    <Text style={st.infoCell}>
                      <Text style={st.lbl}>{isClosed ? 'क्लोजिंग तिथि : ' : 'आज तक : '}</Text>{fmt(endDay)}{isClosed ? '' : '  (सक्रिय सदस्य)'}
                      {months !== null ? `    अवधि : ${Math.floor(months / 12) ? `${Math.floor(months / 12)} वर्ष ` : ''}${months % 12} माह` : ''}
                    </Text>
                  </View>
                </View>
                <View style={st.cards}>
                  <Card label="अवधि में क्लोजिंग" value={sums.inWindow ?? rows.length} />
                  <Card label="शुल्क लगा" value={sums.charged ?? 0} note={sums.notCharged ? `${sums.notCharged} पर नहीं` : ''} />
                  <Card label="कुल देय" value={rs(sums.due)} />
                  <Card label="भरा" value={rs(sums.paid)} color={GREEN} note={`${sums.paidEvents || 0} किस्त`} />
                  <Card label="बकाया" value={rs(sums.pending)} color={sums.pending > 0 ? RED : GREEN} />
                  <Card label="देर / अतिदेय" value={sums.late || 0} color={sums.late ? AMBER : GREEN} />
                </View>
              </>
            ) : (
              <View style={st.contHead}>
                <Text style={st.contTitle}>{clip(member.displayName, 40)} ({member.registrationNumber}) — क्लोजिंग का पूरा हिसाब (जारी)</Text>
                <Text style={st.footerText}>{fmt(joinDay)} से {fmt(endDay)}</Text>
              </View>
            )}

            <View style={st.table}>
              <View style={st.thRow}>
                <Text style={[st.th, COL.sr]}>#</Text>
                <Text style={[st.th, COL.name]}>क्लोज हुआ सदस्य</Text>
                <Text style={[st.th, COL.closed]}>क्लोजिंग तिथि</Text>
                <Text style={[st.th, COL.due]}>अंतिम तिथि</Text>
                <Text style={[st.th, COL.amt]}>देय</Text>
                <Text style={[st.th, COL.paid]}>भरा</Text>
                <Text style={[st.th, COL.paidOn]}>भुगतान तिथि</Text>
                <Text style={[st.th, COL.status]}>स्थिति</Text>
              </View>
              {p.rows.map((r, ri) => {
                const l = r.charged ? (LATE_LABEL[r.status] || LATE_LABEL.UNKNOWN) : null;
                return (
                  <View key={ri} style={[st.row, (p.start + ri) % 2 ? { backgroundColor: '#f8fafc' } : null]} wrap={false}>
                    <Text style={[st.td, COL.sr]}>{r.sr || p.start + ri + 1}</Text>
                    <Text style={[st.td, COL.name]}>{clip(r.name, 34)}{r.regNo ? `  (${r.regNo})` : ''}</Text>
                    <Text style={[st.td, COL.closed]}>{fmt(r.closedOn)}</Text>
                    <Text style={[st.td, COL.due]}>{fmt(r.dueDate)}</Text>
                    <Text style={[st.td, COL.amt]}>{r.charged ? rs(r.amount) : '—'}</Text>
                    <Text style={[st.td, COL.paid, { color: r.charged ? (r.paidOn ? GREEN : RED) : GREY }]}>{r.charged ? rs(r.paidAmount) : '—'}</Text>
                    <Text style={[st.td, COL.paidOn]}>{fmt(r.paidOn)}</Text>
                    <Text style={[st.td, COL.status, { color: l ? (STATUS_COLOR[r.status] || GREY) : GREY, fontWeight: 'bold' }]}>
                      {l ? `${l.text}${r.daysLate > 0 ? ` ${r.daysLate} दिन` : ''}` : 'शुल्क नहीं लगा'}{r.outside ? ' · अवधि से बाहर' : ''}
                    </Text>
                  </View>
                );
              })}
              {pi === pages.length - 1 && (
                <View style={st.totalRow} wrap={false}>
                  <Text style={[st.totalTd, COL.sr]}></Text>
                  <Text style={[st.totalTd, COL.name]}>कुल ({sums.charged || 0} किस्त)</Text>
                  <Text style={[st.totalTd, COL.closed]}></Text>
                  <Text style={[st.totalTd, COL.due]}></Text>
                  <Text style={[st.totalTd, COL.amt]}>{rs(sums.due)}</Text>
                  <Text style={[st.totalTd, COL.paid]}>{rs(sums.paid)}</Text>
                  <Text style={[st.totalTd, COL.paidOn]}></Text>
                  <Text style={[st.totalTd, COL.status]}>बकाया {rs(sums.pending)}</Text>
                </View>
              )}
            </View>
            {pi === pages.length - 1 && (
              <Text style={st.note}>
                अंतिम तिथि = क्लोजिंग तिथि + {GRACE_DAYS} दिन। भुगतान ग्रुप स्तर पर दर्ज होता है, इसलिए कौन-सी किस्त भरी गई यह राशि के आधार पर
                (पुरानी पहले) माना गया है; कुल &quot;भरा&quot; राशि सटीक है। &quot;शुल्क नहीं लगा&quot; = उस क्लोजिंग का शुल्क इस सदस्य पर नहीं लगा
                (आमतौर पर दूसरे आयु वर्ग की क्लोजिंग)।
              </Text>
            )}
            <View style={st.footer}>
              <Text style={st.footerText}>Generated : {generated}</Text>
              <Text style={st.footerText}>Page {pi + 1} of {pages.length}</Text>
              <Text style={st.footerText}>SSGMS Web Panel</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
};

export async function downloadClosingHistoryPdf(props) {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<ClosingHistoryPdf {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Closing_Pura_Hisaab_${String(props.member?.registrationNumber || props.member?.id || 'member').replace(/[^a-zA-Z0-9_-]/g, '_')}_${dayjs().format('DD-MM-YYYY')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
