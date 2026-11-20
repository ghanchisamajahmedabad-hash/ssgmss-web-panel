// Member page → "Closing Hisaab PDF"
//
// One member's account from their JOIN DATE to TODAY (or to their own closing
// date if they are closed): every closing in their yojna in that window, and
// for each one
//   • was this member ELIGIBLE to pay (same rule as closing a member:
//     the closing group's age groups / member groups / genders, joined before
//     the closing, not closed themselves before it)
//   • was the kist actually CHARGED (their closing_payment docs)
//   • is it PAID or still PENDING (money on the doc counted oldest-first —
//     the same rule as closingLateness / closingCounts)
//
// Sources (read-only):
//   groupClosings where programId == member's yojna → closedMemberIds + scope
//   members (the closed ones, for name / reg. no / closing date)
//   closing_payment where memberId == member
import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../../../../lib/firbase-client';
import { toDay } from './closingLateness';

dayjs.extend(customParseFormat);
import { fetchMemberClosingEntries } from './RasidCom/memberRasid';
import { memberOldNo } from '@/lib/rasid/ssgmsDesign';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

// ─── data ────────────────────────────────────────────────────────────────────
const normalizeGender = (v) => {
  const g = String(v ?? '').trim().toLowerCase();
  if (!g) return '';
  if (['male', 'm', '1', 'पुरुष', 'purush', 'man', 'boy'].includes(g)) return 'male';
  if (['female', 'f', '2', 'महिला', 'स्त्री', 'mahila', 'woman', 'girl'].includes(g)) return 'female';
  return 'other';
};
const joinDayOf = (m) => toDay(m?.programJoinDate) || toDay(m?.dateJoin) || toDay(m?.joinDateTs);
const ownClosedDayOf = (m) => toDay(m?.closed_date) || toDay(m?.marriageDate) || toDay(m?.member_closed_at);
const closedDayIn = (m, groupId) => {
  for (const cs of (m?.closedStatus || [])) {
    if (cs?.closingGroupId === groupId) { const d = toDay(cs.closed_date); if (d) return d; }
  }
  return ownClosedDayOf(m);
};

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const getByIds = async (col, ids) => {
  const out = {};
  for (const c of chunk([...new Set(ids)].filter(Boolean), 30)) {
    const snap = await getDocs(query(collection(db, col), where(documentId(), 'in', c)));
    snap.forEach((d) => { out[d.id] = { id: d.id, ...d.data() }; });
  }
  return out;
};

export const STATUS = {
  PAID:         { label: 'जमा',              color: '#16a34a' },
  PENDING:      { label: 'बाकी',             color: '#D3292F' },
  NOT_CHARGED:  { label: 'पात्र — नहीं लगी', color: '#b45309' },
  NOT_ELIGIBLE: { label: 'पात्र नहीं',        color: '#6b7280' },
};

/**
 * Everything the PDF shows. member = members doc (with id).
 * programList (optional) for the yojna / age group names.
 */
export async function buildMemberClosingStatement(member, programList = []) {
  if (!member?.id) throw new Error('Member not loaded');
  const joinDay = joinDayOf(member);
  const ownClosed = member.member_closed === true ? ownClosedDayOf(member) : null;
  const today = dayjs().endOf('day');
  const upto = ownClosed && ownClosed.isBefore(today) ? ownClosed : today;

  const [docs, groupSnap] = await Promise.all([
    fetchMemberClosingEntries(member.id),
    member.programId
      ? getDocs(query(collection(db, 'groupClosings'), where('programId', '==', member.programId)))
      : Promise.resolve({ docs: [] }),
  ]);
  const groups = groupSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => g.status !== 'reversed');

  // charged kists, per closed member, with paid / pending
  const charged = new Map();   // closedMemberId → { amount, paid, groupId, paidOn }
  const chargedNoId = [];
  for (const cp of docs) {
    if (cp?.isReversed === true) continue;
    const gid = cp.closingGroupId || cp.id?.split('_')[1] || '';
    // paid oldest-first up to the money paid on the doc (same rule as closingLateness / closingCounts)
    const details = (Array.isArray(cp.closingDetails) ? cp.closingDetails : [])
      .map((ev, i) => ({ ev, i, day: toDay(ev?.closed_date || ev?.marriageDate) }))
      .sort((a, b) => (a.day?.valueOf() ?? Infinity) - (b.day?.valueOf() ?? Infinity) || a.i - b.i);
    const pay = Number(cp.payAmount || 0) || (details.length ? Number(cp.totalAmount || 0) / details.length : 0);
    const paidAmt = Number(cp.paidAmount || 0);
    const covered = cp.status === 'paid' ? details.length : pay > 0 ? Math.floor(paidAmt / pay) : 0;
    const paidOn = toDay(cp.lastPaymentDate);
    details.forEach(({ ev, day }, k) => {
      const paid = k < covered;
      const rec = { amount: pay, paid, paidOn: paid ? paidOn : null, groupId: gid, groupName: cp.closingGroupName || '', closedOn: day, name: ev?.closed_memberName || '' };
      if (ev?.closed_memberId) charged.set(ev.closed_memberId, rec);
      else chargedNoId.push(rec);
    });
  }

  // every closing of the yojna
  const closedIds = groups.flatMap((g) => g.closedMemberIds || g.memberIds || []);
  const extraIds = [...charged.keys()].filter((id) => !closedIds.includes(id));
  const closedMembers = await getByIds('members', [...closedIds, ...extraIds]);
  const groupOf = new Map();
  groups.forEach((g) => (g.closedMemberIds || g.memberIds || []).forEach((id) => groupOf.set(id, g)));

  const gender = normalizeGender(member.gender);
  const rows = [];
  const seen = new Set();
  const consider = (cid) => {
    // the member's own closing is listed only if a kist was (wrongly) charged for it
    if (!cid || seen.has(cid) || (cid === member.id && !charged.has(cid))) return;
    seen.add(cid);
    const c = closedMembers[cid] || {};
    const g = groupOf.get(cid) || (charged.get(cid)?.groupId ? groups.find((x) => x.id === charged.get(cid).groupId) : null) || {};
    const ch = charged.get(cid);
    const day = closedDayIn(c, g.id) || ch?.closedOn || null;
    // inside the window only (a charged kist outside it is still listed — it was charged)
    const inWindow = day && (!joinDay || !day.isBefore(joinDay, 'day')) && !day.isAfter(upto, 'day');
    if (!inWindow && !ch) return;

    let reason = '';
    if (cid === member.id) reason = 'खुद की क्लोजिंग';
    else if (!day) reason = 'तारीख नहीं';
    else if (joinDay && day.isBefore(joinDay, 'day')) reason = 'जुड़ने से पहले';
    else if (ownClosed && day.isAfter(ownClosed, 'day')) reason = 'खुद क्लोज होने के बाद';
    else if ((g.ageGroupIds || []).length && !(g.ageGroupIds || []).includes(member.ageGroupId)) reason = 'दूसरा आयु वर्ग';
    else if ((g.memberGroupIds || []).length && !(g.memberGroupIds || []).includes(member.memberGroupId)) reason = 'दूसरा ग्रुप';
    else if ((g.genders || []).length && gender && !(g.genders || []).map((x) => String(x).toLowerCase()).includes(gender)) reason = 'दूसरा लिंग';
    const eligible = !reason;

    const status = ch ? (ch.paid ? 'PAID' : 'PENDING') : eligible ? 'NOT_CHARGED' : 'NOT_ELIGIBLE';
    rows.push({
      closedMemberId: cid,
      name: [c.displayName || ch?.name || '', c.fatherName ? '/ ' + c.fatherName : ''].filter(Boolean).join(' ') || '—',
      ownName: c.displayName || ch?.name || '',
      fatherName: c.fatherName || '',
      regNo: c.registrationNumber || '',
      village: c.village || '',
      closedOn: day,
      groupName: g.groupName || ch?.groupName || '',
      eligible, reason, status,
      amount: ch ? ch.amount : 0,
      paidOn: ch?.paidOn || null,
    });
  };
  closedIds.forEach(consider);
  extraIds.forEach(consider);
  chargedNoId.forEach((ch) => rows.push({
    closedMemberId: '', name: ch.name || '—', ownName: ch.name || '', fatherName: '', regNo: '', village: '', closedOn: ch.closedOn, groupName: ch.groupName,
    eligible: true, reason: '', status: ch.paid ? 'PAID' : 'PENDING', amount: ch.amount, paidOn: ch.paidOn,
  }));
  rows.sort((a, b) => (a.closedOn?.valueOf() || 0) - (b.closedOn?.valueOf() || 0));

  const live = docs.filter((d) => d?.isReversed !== true);
  const totalDue = live.reduce((s, d) => s + Number(d.totalAmount || 0), 0);
  const totalPaid = live.reduce((s, d) => s + Number(d.paidAmount || 0), 0);
  const program = programList.find((p) => p.id === member.programId) || {};
  const ageGroup = (program.ageGroups || []).find((a) => a.id === member.ageGroupId)?.ageGroupName
    || member.ageGroupName || member.memberGroupName || member.ageGroup || '';

  return {
    member: {
      name: [member.displayName, member.fatherName ? '/ ' + member.fatherName : ''].filter(Boolean).join(' '),
      regNo: member.registrationNumber || '', oldNo: memberOldNo(member), phone: member.phone || '',
      village: [member.village, member.city, member.state].filter(Boolean).join(', '),
      yojana: program.name || program.hindiName || member.programName || '', ageGroup,
      kist: Number(member.payAmount || 0),
      agent: member.agentName || '',
    },
    from: joinDay, to: upto, closedSelf: !!ownClosed,
    rows,
    sums: {
      all: rows.length,
      eligible: rows.filter((r) => r.eligible).length,
      notEligible: rows.filter((r) => !r.eligible && r.status === 'NOT_ELIGIBLE').length,
      charged: rows.filter((r) => r.status === 'PAID' || r.status === 'PENDING').length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      notCharged: rows.filter((r) => r.status === 'NOT_CHARGED').length,
      totalDue, totalPaid, totalPending: Math.max(0, totalDue - totalPaid),
    },
  };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────
const RED = '#D3292F', NAVY = '#1B385A', GREEN = '#16a34a', BORDER = '#c7ced8', GREY = '#6b7280';
const ROW_H = 17, FIRST_ROWS = 26, OTHER_ROWS = 38;
const fmt = (d) => (d ? d.format('DD-MM-YYYY') : '—');
const rs = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const clip = (v, max) => { const s = String(v ?? '').trim(); return s.length > max ? s.slice(0, max - 1) + '…' : s; };

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
  badgeText: { fontSize: 10.5, fontWeight: 'bold', color: NAVY, textAlign: 'center' },
  info: { borderWidth: 0.8, borderColor: BORDER, borderRadius: 3, padding: 6, marginBottom: 6, backgroundColor: '#f8fafc' },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  infoCell: { flex: 1, fontSize: 8 },
  lbl: { color: RED, fontWeight: 'bold' },
  window: { fontSize: 8.5, fontWeight: 'bold', color: NAVY, textAlign: 'center', marginBottom: 6 },
  cards: { flexDirection: 'row', marginBottom: 6 },
  card: { flex: 1, borderWidth: 0.8, borderColor: BORDER, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 4, marginRight: 3 },
  cardLabel: { fontSize: 6.3, color: GREY },
  cardValue: { fontSize: 9.5, fontWeight: 'bold', color: NAVY, marginTop: 1 },
  table: { borderWidth: 0.8, borderColor: BORDER },
  thRow: { flexDirection: 'row', backgroundColor: NAVY, height: 20, alignItems: 'center' },
  th: { fontSize: 7, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3 },
  row: { flexDirection: 'row', height: ROW_H, alignItems: 'center', borderTopWidth: 0.3, borderTopColor: '#e5e7eb' },
  td: { fontSize: 7, color: '#111', paddingHorizontal: 3 },
  totalRow: { flexDirection: 'row', height: 20, alignItems: 'center', backgroundColor: NAVY },
  totalTd: { fontSize: 7.5, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3 },
  contHead: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 3, marginBottom: 6 },
  contTitle: { fontSize: 9, fontWeight: 'bold', color: NAVY },
  note: { fontSize: 6.8, color: GREY, marginTop: 5, lineHeight: 1.4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.8, borderTopColor: BORDER, paddingTop: 5, marginTop: 'auto' },
  footerText: { fontSize: 6.5, color: GREY },
});
const COL = {
  sr: { width: 20, textAlign: 'center' }, name: { flex: 1 }, reg: { width: 60 }, date: { width: 54, textAlign: 'center' },
  group: { width: 92 }, elig: { width: 70, textAlign: 'center' }, amt: { width: 42, textAlign: 'right' },
  status: { width: 72, textAlign: 'center' },
};

const Head = () => (
  <View style={st.thRow} fixed>
    <Text style={[st.th, COL.sr]}>#</Text>
    <Text style={[st.th, COL.name]}>क्लोज हुआ सदस्य</Text>
    <Text style={[st.th, COL.reg]}>रजि. नं.</Text>
    <Text style={[st.th, COL.date]}>क्लोजिंग तिथि</Text>
    <Text style={[st.th, COL.group]}>क्लोजिंग ग्रुप</Text>
    <Text style={[st.th, COL.elig]}>पात्र?</Text>
    <Text style={[st.th, COL.amt]}>किस्त</Text>
    <Text style={[st.th, COL.status]}>स्थिति</Text>
  </View>
);
const Card = ({ label, value, color }) => (
  <View style={st.card}><Text style={st.cardLabel}>{label}</Text><Text style={[st.cardValue, color ? { color } : null]}>{value}</Text></View>
);

export const MemberClosingStatementPdf = ({ data }) => {
  const { member: m, rows, sums: s, from, to, closedSelf } = data;
  const pages = [];
  let i = 0, cap = FIRST_ROWS;
  do { pages.push({ start: i, rows: rows.slice(i, i + cap) }); i += cap; cap = OTHER_ROWS; } while (i < rows.length);
  const last = pages[pages.length - 1];
  if (last.rows.length >= (pages.length === 1 ? FIRST_ROWS : OTHER_ROWS) - 1) pages.push({ start: i, rows: [] });
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
                <View style={st.badgeWrap}><View style={st.badge}><Text style={st.badgeText}>सदस्य क्लोजिंग हिसाब  •  Member Closing Statement</Text></View></View>
                <View style={st.info}>
                  <View style={st.infoRow}>
                    <Text style={st.infoCell}><Text style={st.lbl}>नाम : </Text>{clip(m.name, 48)}</Text>
                    <Text style={st.infoCell}><Text style={st.lbl}>रजि. नं. : </Text>{m.regNo || '—'}{m.oldNo ? `   (पुराना: ${m.oldNo})` : ''}</Text>
                  </View>
                  <View style={st.infoRow}>
                    <Text style={st.infoCell}><Text style={st.lbl}>योजना : </Text>{m.yojana || '—'}{m.ageGroup ? `  Group : ${m.ageGroup}` : ''}</Text>
                    <Text style={st.infoCell}><Text style={st.lbl}>फोन : </Text>{m.phone || '—'}   <Text style={st.lbl}>किस्त : </Text>{m.kist ? rs(m.kist) : '—'}</Text>
                  </View>
                  <View style={st.infoRow}>
                    <Text style={st.infoCell}><Text style={st.lbl}>पता : </Text>{clip(m.village, 60) || '—'}</Text>
                    <Text style={st.infoCell}><Text style={st.lbl}>सदस्यता तिथि : </Text>{fmt(from)}</Text>
                  </View>
                </View>
                <Text style={st.window}>
                  {fmt(from)} (जुड़ने की तिथि) से {fmt(to)} ({closedSelf ? 'खुद की क्लोजिंग' : 'आज'}) तक की सभी क्लोजिंग
                </Text>
                <View style={st.cards}>
                  <Card label="कुल क्लोजिंग" value={s.all} />
                  <Card label="पात्र (किस्त बनती है)" value={s.eligible} />
                  <Card label="किस्त लगी" value={s.charged} />
                  <Card label="जमा" value={s.paid} color={GREEN} />
                  <Card label="बाकी" value={s.pending} color={RED} />
                  <Card label="पात्र — नहीं लगी" value={s.notCharged} color={s.notCharged ? '#b45309' : undefined} />
                </View>
                <View style={st.cards}>
                  <Card label="कुल किस्त राशि" value={rs(s.totalDue)} />
                  <Card label="कुल जमा" value={rs(s.totalPaid)} color={GREEN} />
                  <Card label="कुल बाकी" value={rs(s.totalPending)} color={RED} />
                  <Card label="पात्र नहीं" value={s.notEligible} />
                </View>
              </>
            ) : (
              <View style={st.contHead}>
                <Text style={st.contTitle}>{clip(m.name, 40)} ({m.regNo}) — क्लोजिंग हिसाब (जारी)</Text>
                <Text style={st.footerText}>{fmt(from)} से {fmt(to)}</Text>
              </View>
            )}

            <View style={st.table}>
              <Head />
              {p.rows.map((r, ri) => (
                <View key={ri} style={[st.row, (p.start + ri) % 2 ? { backgroundColor: '#f8fafc' } : null]} wrap={false}>
                  <Text style={[st.td, COL.sr]}>{p.start + ri + 1}</Text>
                  <Text style={[st.td, COL.name]}>{clip([r.name, r.village].filter(Boolean).join('  '), 46)}</Text>
                  <Text style={[st.td, COL.reg]}>{r.regNo || '—'}</Text>
                  <Text style={[st.td, COL.date]}>{fmt(r.closedOn)}</Text>
                  <Text style={[st.td, COL.group]}>{clip(r.groupName, 22) || '—'}</Text>
                  <Text style={[st.td, COL.elig, { color: r.eligible ? GREEN : GREY }]}>{r.eligible ? 'हाँ' : `नहीं — ${r.reason}`}</Text>
                  <Text style={[st.td, COL.amt]}>{r.amount ? rs(r.amount) : '—'}</Text>
                  <Text style={[st.td, COL.status, { color: STATUS[r.status].color, fontWeight: 'bold' }]}>
                    {STATUS[r.status].label}{r.paidOn ? ` ${r.paidOn.format('DD-MM-YY')}` : ''}
                  </Text>
                </View>
              ))}
              {pi === pages.length - 1 && (
                <View style={st.totalRow} wrap={false}>
                  <Text style={[st.totalTd, COL.sr]}></Text>
                  <Text style={[st.totalTd, COL.name]}>कुल {s.all} क्लोजिंग · पात्र {s.eligible} · लगी {s.charged} · जमा {s.paid} · बाकी {s.pending}</Text>
                  <Text style={[st.totalTd, { width: 60 + 54 + 92 + 70 }]}></Text>
                  <Text style={[st.totalTd, COL.amt]}>{rs(s.totalDue)}</Text>
                  <Text style={[st.totalTd, COL.status]}>बाकी {rs(s.totalPending)}</Text>
                </View>
              )}
            </View>
            {pi === pages.length - 1 && (
              <Text style={st.note}>
                पात्र = उस क्लोजिंग के आयु वर्ग / ग्रुप / लिंग में आता है, क्लोजिंग जुड़ने के बाद हुई और सदस्य खुद उससे पहले क्लोज नहीं हुआ।
                &quot;पात्र — नहीं लगी&quot; = नियम से किस्त बनती थी पर लगाई नहीं गई (जैसे उस समय सदस्य inactive था) — इसे जाँच लें।
                जमा / बाकी: जमा राशि पहले पुरानी क्लोजिंग पर गिनी जाती है।
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

/** Build + download (react-pdf loaded on click). Returns the number of closings listed. */
export async function downloadMemberClosingStatement(member, programList = []) {
  const data = await buildMemberClosingStatement(member, programList);
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<MemberClosingStatementPdf data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Closing_Hisaab_${String(member.registrationNumber || member.id).replace(/[^a-zA-Z0-9_-]/g, '_')}_${dayjs().format('DD-MM-YYYY')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return data.rows.length;
}

// ─── Simple list: closings that apply to this member ─────────────────────────
// Member page → "Closing List PDF". Join date → today (or own closing): only the
// closings this member comes under (eligible), with नाम, पिता का नाम, रजि. नं.,
// क्लोजिंग तिथि and ग्रुप (blank when the closing has no group name). Nothing else.
const LROW_H = 19, LFIRST = 30, LOTHER = 40;
const lst = StyleSheet.create({
  title: { fontSize: 12, fontWeight: 'bold', color: NAVY, textAlign: 'center', marginBottom: 3 },
  sub: { fontSize: 8.5, color: '#111', textAlign: 'center', marginBottom: 2 },
  count: { fontSize: 8.5, fontWeight: 'bold', color: RED, textAlign: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', height: LROW_H, alignItems: 'center', borderTopWidth: 0.4, borderTopColor: '#d1d5db' },
  td: { fontSize: 8.5, color: '#111', paddingHorizontal: 4 },
});
const LCOL = { sr: { width: 26, textAlign: 'center' }, name: { flex: 1.2 }, father: { flex: 1 }, reg: { width: 78 }, date: { width: 66, textAlign: 'center' }, group: { width: 120 } };

export const MemberClosingListPdf = ({ data }) => {
  const { member: m, from, to, closedSelf } = data;
  const rows = data.rows.filter((r) => r.eligible);
  const pages = [];
  let i = 0, cap = LFIRST;
  do { pages.push({ start: i, rows: rows.slice(i, i + cap) }); i += cap; cap = LOTHER; } while (i < rows.length);
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
                  </View>
                  <View style={st.logoBox}><Image src="/Images/sanidevImg.jpeg" style={st.logo} /></View>
                </View>
                <View style={st.sinceRow}>
                  <Text style={st.sinceText}>SINCE : 2024</Text>
                  <Text style={st.sinceText}>Reg. No: A/5231</Text>
                </View>
                <Text style={lst.title}>क्लोज हुए सदस्यों की सूची</Text>
                <Text style={lst.sub}>{m.name}  •  रजि. नं. {m.regNo || '—'}  •  {m.yojana}{m.ageGroup ? `  (${m.ageGroup})` : ''}</Text>
                <Text style={lst.sub}>{fmt(from)} (सदस्यता तिथि) से {fmt(to)} ({closedSelf ? 'खुद की क्लोजिंग' : 'आज'}) तक</Text>
                <Text style={lst.count}>इस अवधि में {data.rows.filter((r) => r.reason !== 'खुद की क्लोजिंग').length} सदस्य क्लोज हुए — इनमें से {rows.length} की किस्त इस सदस्य पर बनती है</Text>
              </>
            ) : (
              <View style={st.contHead}>
                <Text style={st.contTitle}>{clip(m.name, 40)} ({m.regNo}) — क्लोज हुए सदस्यों की सूची (जारी)</Text>
                <Text style={st.footerText}>{fmt(from)} से {fmt(to)}</Text>
              </View>
            )}
            <View style={st.table}>
              <View style={st.thRow}>
                <Text style={[st.th, LCOL.sr, { fontSize: 8 }]}>#</Text>
                <Text style={[st.th, LCOL.name, { fontSize: 8 }]}>नाम</Text>
                <Text style={[st.th, LCOL.father, { fontSize: 8 }]}>पिता का नाम</Text>
                <Text style={[st.th, LCOL.reg, { fontSize: 8 }]}>रजि. नं.</Text>
                <Text style={[st.th, LCOL.date, { fontSize: 8 }]}>क्लोजिंग तिथि</Text>
                <Text style={[st.th, LCOL.group, { fontSize: 8 }]}>ग्रुप</Text>
              </View>
              {p.rows.map((r, ri) => (
                <View key={ri} style={[lst.row, (p.start + ri) % 2 ? { backgroundColor: '#f8fafc' } : null]} wrap={false}>
                  <Text style={[lst.td, LCOL.sr]}>{p.start + ri + 1}</Text>
                  <Text style={[lst.td, LCOL.name]}>{clip(r.ownName, 30)}</Text>
                  <Text style={[lst.td, LCOL.father]}>{clip(r.fatherName, 26)}</Text>
                  <Text style={[lst.td, LCOL.reg]}>{r.regNo}</Text>
                  <Text style={[lst.td, LCOL.date]}>{r.closedOn ? r.closedOn.format('DD-MM-YYYY') : ''}</Text>
                  <Text style={[lst.td, LCOL.group]}>{clip(r.groupName, 26)}</Text>
                </View>
              ))}
              {!rows.length ? (
                <View style={lst.row}><Text style={[lst.td, { flex: 1, textAlign: 'center', color: GREY }]}>इस अवधि में इस सदस्य पर लागू कोई क्लोजिंग नहीं</Text></View>
              ) : null}
            </View>
            <View style={st.footer}>
              <Text style={st.footerText}>Generated : {dayjs().format('DD-MM-YYYY hh:mm A')}</Text>
              <Text style={st.footerText}>Page {pi + 1} of {pages.length}</Text>
              <Text style={st.footerText}>SSGMS Web Panel</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
};

/** Build + download the simple list. Returns { all, applies }. */
export async function downloadMemberClosingList(member, programList = []) {
  const data = await buildMemberClosingStatement(member, programList);
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<MemberClosingListPdf data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Closing_List_${String(member.registrationNumber || member.id).replace(/[^a-zA-Z0-9_-]/g, '_')}_${dayjs().format('DD-MM-YYYY')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { all: data.rows.filter((r) => r.reason !== 'खुद की क्लोजिंग').length, applies: data.rows.filter((r) => r.eligible).length };
}
