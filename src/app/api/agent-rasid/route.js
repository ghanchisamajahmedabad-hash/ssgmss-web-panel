// POST /api/agent-rasid
//
// Builds the सहयोग राशि रसीद PDF for one closing group on the SERVER and returns
// a download link — the same way the join certificate is delivered. Used by
// the agent mobile app (no PDF library needed on the phone; the app just opens
// the link) and usable from the panel too.
//
// Body: {
//   groupId:   string            closing group (groupClosings doc id)
//   memberIds: string[]          paying members to make receipts for
//   closedIds?: string[]         closings to list (default: all in the group)
//   date?:     'YYYY-MM-DD'      receipt date (default: today)
//   note?:     string
//   agentId?:  string            admins only — agents always get their own
// }
//
// Every figure is read from Firestore here; nothing the client sends about
// amounts is trusted. An agent can only make receipts for their own members.
//
// Rules are the same as the panel's receipt (RasidGroupClosingDrawer):
//   • a member is billed for exactly the closings their closing_payment doc
//     for this group lists, at that doc's recorded total
//   • no doc for the group → ₹0 receipt (never invent a charge)

import { NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import dayjs from 'dayjs';
import admin from '../db/firebaseAdmin';
import ClosingRasidPdf from '@/app/members/components/ClosingRasidPdf';
import LogoImg from '@/app/api/helper/Images/LogoImg';
import RigthImg from '@/app/api/helper/Images/rigthImg';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();
const MAX_MEMBERS = 300;

const HINDI_MONTHS = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

const slug = (v) => String(v || '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);

// "DD-MM-YYYY" from a Timestamp / ISO string / DD-MM-YYYY string
const toDDMMYYYY = (d) => {
  if (!d) return '';
  if (d?.toDate) return dayjs(d.toDate()).format('DD-MM-YYYY');
  if (typeof d === 'string') {
    const s = d.trim();
    const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
    if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (iso) {
      const local = dayjs(`${iso[1]}-${iso[2]}-${iso[3]}`);
      return Number(s.slice(11, 13)) >= 18 ? local.add(1, 'day').format('DD-MM-YYYY') : local.format('DD-MM-YYYY');
    }
  }
  const p = dayjs(d);
  return p.isValid() ? p.format('DD-MM-YYYY') : '';
};
const sortKey = (s) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || '');
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 0;
};

const getAllDocs = async (col, ids) => {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = {};
  for (let i = 0; i < uniq.length; i += 300) {
    const refs = uniq.slice(i, i + 300).map(id => db.collection(col).doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach(s => { if (s.exists) out[s.id] = { id: s.id, ...s.data() }; });
  }
  return out;
};

// Caller = admin (users/{uid} with an admin role) or agent (agents/{uid})
async function identify(req) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  const decoded = await admin.auth().verifyIdToken(h.slice(7));
  const uid = decoded.uid;
  const u = await db.collection('users').doc(uid).get();
  if (u.exists && ['admin', 'superadmin'].includes(u.data().role)) return { uid, isAdmin: true };
  const a = await db.collection('agents').doc(uid).get();
  if (a.exists) return { uid, isAdmin: false };
  return null;
}

export async function POST(req) {
  try {
    let who;
    try { who = await identify(req); }
    catch { return NextResponse.json({ success: false, message: 'Invalid or expired login — please log in again' }, { status: 401 }); }
    if (!who) return NextResponse.json({ success: false, message: 'Not allowed' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const groupId   = String(body.groupId || '');
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const closedSel = Array.isArray(body.closedIds) && body.closedIds.length ? new Set(body.closedIds.map(String)) : null;
    const agentId   = who.isAdmin ? String(body.agentId || '') : who.uid;

    if (!groupId || !memberIds.length)
      return NextResponse.json({ success: false, message: 'groupId and memberIds are required' }, { status: 400 });
    if (!agentId)
      return NextResponse.json({ success: false, message: 'agentId is required' }, { status: 400 });
    if (memberIds.length > MAX_MEMBERS)
      return NextResponse.json({ success: false, message: `Ek baar me ${MAX_MEMBERS} member tak ki rasid ban sakti hai` }, { status: 400 });

    const rasidDate = body.date && dayjs(body.date).isValid() ? dayjs(body.date) : dayjs();

    // ── Load ────────────────────────────────────────────────────────────────
    const [agentSnap, groupSnap, memberMap] = await Promise.all([
      db.collection('agents').doc(agentId).get(),
      db.collection('groupClosings').doc(groupId).get(),
      getAllDocs('members', memberIds),
    ]);
    const agent = agentSnap.exists ? agentSnap.data() : {};
    const group = groupSnap.exists ? { id: groupSnap.id, ...groupSnap.data() } : { id: groupId };

    // Only this agent's own, non-deleted members
    const members = memberIds
      .map(id => memberMap[id])
      .filter(m => m && m.agentId === agentId && m.delete_flag !== true);
    if (!members.length)
      return NextResponse.json({ success: false, message: 'Chune hue members aapke nahi hain ya delete ho chuke hain' }, { status: 400 });

    const cpMap = await getAllDocs('closing_payment', members.map(m => `${m.id}_${groupId}`));
    const cpOf = (m) => {
      const cp = cpMap[`${m.id}_${groupId}`];
      return cp && cp.isReversed !== true ? cp : null;
    };

    const prog = group.programId ? (await db.collection('programs').doc(group.programId).get()).data() || {} : {};
    const anyCp = members.map(cpOf).find(Boolean) || {};
    const yojana = prog.hindiName || prog.name || group.yojanaName || anyCp.programName || '';

    // ── The closings listed on the receipt ─────────────────────────────────
    const detail = {};
    members.forEach(m => (cpOf(m)?.closingDetails || []).forEach(cd => {
      if (cd?.closed_memberId && !detail[cd.closed_memberId]) detail[cd.closed_memberId] = { cd, payer: m };
    }));
    let closedIds = [...new Set([...(group.closedMemberIds || []), ...Object.keys(detail)])];
    if (closedSel) closedIds = closedIds.filter(id => closedSel.has(id));
    const closedDocs = await getAllDocs('members', closedIds);
    const groupDate = toDDMMYYYY(group.closedAt);

    const entries = closedIds.map(id => {
      const m = closedDocs[id];
      const { cd = {}, payer = {} } = detail[id] || {};
      // closingDetails falls back to the PAYING member's phone / reg. no. —
      // never print those as the closed member's own.
      const cdPhone = cd.closingPhone && cd.closingPhone !== payer.phone ? cd.closingPhone : '';
      const cdReg = [cd.closed_registrationNumber, cd.closing_registrationNumber]
        .find(r => r && r !== payer.registrationNumber) || '';
      const name = m?.displayName || cd.closed_memberName || 'Unknown';
      const father = m?.fatherName || cd.closed_fatherName || '';
      return {
        id,
        code: m?.registrationNumber || cdReg,
        name: [name, father ? '/ ' + father : ''].filter(Boolean).join(' '),
        village: m ? [m.village, m.district, m.state].filter(Boolean).join(' - ') : (cd.closed_village || ''),
        ageGroup: m?.ageGroupName || m?.memberGroupName || m?.ageGroup || '',
        date: toDDMMYYYY(m?.closed_date || m?.marriageDate || cd.closed_date || cd.marriageDate) || groupDate,
        mobile: m?.phone || m?.phoneNo || cdPhone,
      };
    }).sort((a, b) => sortKey(a.date) - sortKey(b.date));

    const closingAgeGroup = entries.find(e => e.ageGroup)?.ageGroup || '';
    const worker = [agent.agentCode ? `(${agent.agentCode})` : '', agent.name || '', agent.phone1 || agent.phone || '']
      .filter(Boolean).join(' ');
    const note = (body.note && String(body.note).trim()) ||
      `${HINDI_MONTHS[rasidDate.month()]}-${rasidDate.format('YYYY')} सहयोग राशि ( "यह सहयोग राशि स्वैच्छिक है एवं गैर-वापसीयोग्य है।" )`;

    // ── One receipt per paying member ──────────────────────────────────────
    const receipts = members.map((m, idx) => {
      const cp = cpOf(m);
      const charged = new Set((cp?.closingDetails || []).map(x => x?.closed_memberId).filter(Boolean));
      return {
        id: m.id,
        serialNo: String(idx + 1),
        date: rasidDate.format('DD-MM-YYYY'),
        name: [m.displayName, m.fatherName ? '/ ' + m.fatherName : ''].filter(Boolean).join(' '),
        phone: m.phone || '',
        address: [m.village, m.city, m.state].filter(Boolean).join(', '),
        yojana,
        ageGroup: closingAgeGroup || m.ageGroupName || m.memberGroupName || m.ageGroup || '',
        sahyogRashi: Number(m.payAmount || 0),
        entries: cp ? entries.filter(e => charged.has(e.id)) : [],
        totalAmount: cp ? Number(cp.totalAmount || 0) : 0,
        worker,
        note,
        status: cp?.status || 'pending',
      };
    });

    // ── Render + upload ────────────────────────────────────────────────────
    const buffer = await renderToBuffer(
      React.createElement(ClosingRasidPdf, { entries: receipts, images: { logo: LogoImg, right: RigthImg } })
    );

    const groupName = group.groupName || anyCp.closingGroupName || groupId;
    const fileName = `Rasid_${slug(groupName)}_${rasidDate.format('DD-MM-YYYY')}_${receipts.length}.pdf`;
    const filePath = `rasid/${agentId}/${Date.now()}_${fileName}`;
    const file = admin.storage().bucket().file(filePath);
    await file.save(buffer, {
      metadata: {
        contentType: 'application/pdf',
        contentDisposition: `inline; filename="${fileName}"`,
        cacheControl: 'private, max-age=0',
      },
      resumable: false,
    });

    // Short-lived link — receipts carry member phone numbers, so they are not
    // made public the way certificates are.
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    return NextResponse.json({
      success: true,
      url,
      fileName,
      count: receipts.length,
      totalAmount: receipts.reduce((s, r) => s + r.totalAmount, 0),
      notCharged: receipts.filter(r => !cpOf(memberMap[r.id])).length,
    });
  } catch (e) {
    console.error('[agent-rasid] failed:', e);
    return NextResponse.json({ success: false, message: e.message || 'Rasid PDF nahi bana' }, { status: 500 });
  }
}
