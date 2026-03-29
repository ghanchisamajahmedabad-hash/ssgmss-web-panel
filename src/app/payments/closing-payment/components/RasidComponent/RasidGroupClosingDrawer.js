"use client";
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Drawer, Spin, Empty, Typography, Input, Checkbox, Button,
  Tag, Avatar, Badge, DatePicker, message, Space, Divider, Alert
} from 'antd';
import {
  SearchOutlined, UserOutlined, CalendarOutlined, TeamOutlined,
  FilePdfOutlined, ReloadOutlined, InfoCircleOutlined,
  CheckCircleOutlined, RightOutlined, LeftOutlined,
  ArrowRightOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { collection, query, orderBy, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../../../../../../lib/firbase-client';
import { fetchMembersByAgent } from '@/app/members/components/firebase-helpers';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const C = {
  red:    '#D3292F',
  blue:   '#1B385A',
  pink:   '#db2777',
  orange: '#ea580c',
  green:  '#16a34a',
  amber:  '#f59e0b',
  bg:     '#fff8f5',
  border: '#fde2d8',
  surf:   '#ffffff',
  fg:     '#3e1f1a',
  muted:  '#9ca3af',
};

// ─── Hindi number words ───────────────────────────────────────────────────────
const W1 = ['','एक','दो','तीन','चार','पाँच','छः','सात','आठ','नौ','दस','ग्यारह',
  'बारह','तेरह','चौदह','पंद्रह','सोलह','सत्रह','अठारह','उन्नीस'];
const W10 = ['','','बीस','तीस','चालीस','पचास','साठ','सत्तर','अस्सी','नब्बे'];
function toWords(n) {
  if (!n || n <= 0) return 'शून्य रुपये मात्र';
  let s = '';
  if (n >= 100000) { s += toWords(Math.floor(n/100000)).replace(' रुपये मात्र','') + ' लाख '; n %= 100000; }
  if (n >= 1000)   { s += toWords(Math.floor(n/1000)).replace(' रुपये मात्र','') + ' हजार '; n %= 1000; }
  if (n >= 100)    { s += toWords(Math.floor(n/100)).replace(' रुपये मात्र','') + ' सौ '; n %= 100; }
  if (n > 0) s += n < 20 ? W1[n] : W10[Math.floor(n/10)] + (n%10 ? ' '+W1[n%10] : '');
  return s.trim() + ' रुपये मात्र';
}

// ─── PDF print window ─────────────────────────────────────────────────────────
function openPrintWindow(rasidList) {
  const win = window.open('', '_blank');
  if (!win) { message.error('Popup blocked! Please allow popups.'); return; }
  const ROWS = 20;

  const pages = rasidList.map(d => {
    const filled = [...d.entries, ...Array(Math.max(0, ROWS - d.entries.length)).fill(null)];
    const rows = filled.map((e, i) => `
      <tr>
        <td class="c">${i+1}</td>
        <td class="c">${e ? e.code : ''}</td>
        <td class="l">${e ? e.name : ''}</td>
        <td class="c">${e ? e.date : ''}</td>
        <td class="c">${e ? e.mobile : ''}</td>
      </tr>`).join('');

    return `
    <div class="page">

      <!-- blessings -->
      <div class="bless">
        <span>॥ श्री गणेशाय नमः ॥</span>
        <span>॥ श्री शनिदेवाय नमः ॥</span>
        <span>॥ श्री सांवलाजी महाराज नमः ॥</span>
      </div>

      <!-- org header -->
      <div class="hdr">
        <div class="logo-box">
          <img src="/Images/logoT.png" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="">
          <div class="logo-fb">SSGMS<br>TRUST</div>
        </div>
        <div class="center-block">
          <div class="org-title">श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</div>
          <div class="org-sub">अहमदाबाद, गुजरात</div>
          <div class="org-addr">
            <b>हेड ऑफिस :</b> 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास,
            चांदखेडा, साबरमती, अहमदाबाद - 382424 &nbsp; (O) 9898535345
          </div>
          <div class="org-contact">
            <b>संपर्क सूत्र :</b>
            <span class="blue">अध्यक्ष श्री वोरारामजी टी. बोराणा</span>
          </div>
          <div class="org-contact">
            <span class="blue">9374934004</span>
            &nbsp;&nbsp;
            <b>ऑफिस :</b>
            <span class="blue"> 9898535345</span>
          </div>
        </div>
        <div class="logo-box">
          <img src="/Images/sanidevImg.jpeg" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="">
          <div class="logo-fb logo-fb2">शनि<br>देव</div>
        </div>
      </div>

      <!-- since / reg bar -->
      <div class="since-bar">
        <span>SINCE : 2024</span>
        <span>Reg. No: A/5231</span>
      </div>

      <!-- badge -->
      <div class="badge-wrap">
        <div class="badge">सहयोग राशि रसीद</div>
      </div>

      <!-- info rows -->
      <div class="info-row">
        <div class="info-item">
          <span class="lbl">क्र. सं.</span>
          <span class="sep"> : </span>
          <span class="val">${d.serialNo}</span>
        </div>
        <div class="info-item right">
          <span class="lbl">दिनांक</span>
          <span class="sep"> : </span>
          <span class="val">${d.date}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="lbl">नाम</span>
          <span class="sep"> : </span>
          <span class="val">${d.name}</span>
        </div>
        <div class="info-item right">
          <span class="lbl">फोन नं.</span>
          <span class="sep"> : </span>
          <span class="val">${d.phone}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item" style="flex:1">
          <span class="lbl">पता</span>
          <span class="sep"> : </span>
          <span class="val">${d.address || '—'}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="lbl">योजना</span>
          <span class="sep"> : </span>
          <span class="val">${d.yojana}</span>
          &nbsp;&nbsp;
          <span class="lbl">ग्रुप</span>
          <span class="sep"> : </span>
          <span class="val">${d.group}</span>
        </div>
        <div class="info-item right">
          <span class="lbl">सहयोग राशि</span>
          <span class="sep"> : </span>
          <span class="val val-amt">₹${d.sahyogRashi.toLocaleString()}</span>
        </div>
      </div>

      <!-- table -->
      <div class="table-wrap">
        <table class="main-table">
          <thead>
            <tr>
              <th style="width:30px">#</th>
              <th style="width:100px">कोड</th>
              <th>नाम</th>
              <th style="width:100px">दिनांक</th>
              <th style="width:82px">मोबाइल न.</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
             <div class="total-row">
        <span class="total-lbl">कुल राशि रु. :</span>
        <span class="total-amt">₹${d.totalAmount.toLocaleString()}</span>
        <span class="total-words-lbl">शब्दों में रूपये :</span>
        <span class="total-words">${d.totalInWords}</span>
      </div>
      </div>

      <!-- total -->
 

      <!-- sign + note -->
      <div class="sign-note-row">
        <div class="note">Note : ${d.note}</div>
        <div class="sign-box">
          <div class="sign-line"></div>
          <div class="sign-lbl">संस्थापक हस्ताक्षर</div>
        </div>
      </div>

      <!-- footer -->
      <div class="footer">
        <div class="footer-spacer"></div>
        <div class="footer-center">
          <div class="footer-contacts">
            संपर्क सूत्र : 9374934004, 9825289998, 9426517804, 9824017977
          </div>
          <div class="footer-sub">Exclusive jurisdiction Ahmedabad, Gujarat</div>
        </div>
        <div class="footer-eoe">E. &amp; O.E.</div>
      </div>

    </div>`;
  }).join('');

win.document.write(`<!DOCTYPE html><html lang="hi"><head>
  <meta charset="utf-8">
  <title>सहयोग राशि रसीद — ${dayjs().format('DD MMM YYYY')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Noto Sans Devanagari',sans-serif;background:#b0b0b0;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}

    /* ── print bar ── */
    .print-bar{position:sticky;top:0;z-index:100;padding:12px 24px;background:#1B385A;display:flex;gap:12px;align-items:center}
    .btn-print{background:#D3292F;color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px;font-family:inherit;letter-spacing:.5px}
    .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit}
    .print-info{font-size:13px;color:rgba(255,255,255,.8);margin-left:10px}

    /* ── A4 page ── */
    .page{
      width:210mm;height:297mm;
      background:#fff;
      margin:18px auto;
      padding:1mm 5mm;
      display:flex;flex-direction:column;
      box-shadow:0 6px 28px rgba(0,0,0,.25);
      position:relative;overflow:hidden;
      page-break-after:always;page-break-inside:avoid;
    }

    /* watermark */
    .page::before{
      content:'';position:absolute;top:50%;left:20%;
      transform:translateY(-50%);
      width:60%;height:60%;
      background:url('/Images/logoT.png') center/contain no-repeat;
      opacity:.06;pointer-events:none;z-index:0
    }
    .page>*{position:relative;z-index:1}

    /* ── blessings ── */
    .bless{
      display:flex;justify-content:space-between;align-items:center;
      margin-bottom:8px;padding:6px 10px;
    }
    .bless span{font-size:11px;color:#D3292F;font-weight:700;font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px}

    /* ── header ── */
    .hdr{
      display:flex;align-items:center;justify-content:space-between;
      gap:12px;
    }
    .logo-box{width:100px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .logo{width:90px;height:90px;border-radius:6px;object-fit:cover;}
    .logo-fb{
      width:70px;height:65px;border-radius:6px;
      background:linear-gradient(135deg,#E8EFF7,#d0dcec);
      border:2px solid #b5c5d8;
      display:none;align-items:center;justify-content:center;
      font-size:11px;color:#1B385A;font-weight:700;text-align:center;line-height:1.4;
      font-family:'Noto Serif Devanagari',serif;
    }
    .logo-fb2{background:linear-gradient(135deg,#f5ece0,#ede0cc)!important;border-color:#c9a87a!important;color:#7a4a1e!important}
    .center-block{flex:1;text-align:center;padding:0 8px;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .org-title{font-size:26px;font-weight:700;color:#1B385A;font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px;margin-bottom:0px;line-height:1.3}
    .org-sub{font-size:18px;font-weight:700;color:#1B385A;margin-bottom:0px;text-align:center}
    .org-addr{font-size:11px;color:#000;line-height:1.6;margin-bottom:3px;text-align:center}
    .org-contact{font-size:11px;color:#000;line-height:1.6;text-align:center}
    .org-contact .blue{color:#1B385A;font-weight:700}
    .org-contact b{color:#000;font-weight:700}

    /* ── since bar ── */
    .since-bar{
      display:flex;justify-content:space-between;align-items:center;
      border-bottom:1.5px solid #1B385A;
      padding:6px 4px;margin-bottom:4px;
    }
    .since-bar span{font-size:11px;font-weight:700;color:#1B385A;letter-spacing:.6px}

    /* ── badge ── */
    .badge-wrap{text-align:center;margin:10px 0}
    .badge{
      display:inline-block;border:2px solid #D3292F;border-radius:6px;
      padding:6px 28px;
      font-size:14px;font-weight:700;color:#D3292F;
      font-family:'Noto Serif Devanagari',serif;letter-spacing:1px;
    }

    /* ── info rows ── */
    .info-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
    .info-row:last-of-type{margin-bottom:0}
    .info-item{display:flex;align-items:baseline;gap:6px;flex:1}
    .info-item.right{justify-content:flex-end;text-align:right}
    .lbl{font-size:13px;font-weight:700;color:#D3292F;white-space:nowrap}
    .sep{font-size:13px;color:#D3292F;font-weight:700}
    .val{font-size:13px;color:#111;font-weight:500}
    .val-amt{font-size:13px;color:#111;font-weight:700}

    /* ── table ── */
    .table-wrap{flex:1;display:flex;flex-direction:column;min-height:0;margin-top:8px}
    .main-table{
      width:100%;border-collapse:collapse;
      border:1.5px solid #999;
      height:100%;table-layout:fixed;
    }
    .main-table thead tr{background:#ffffff26}
    .main-table th{
      padding:8px 5px;font-size:13px;font-weight:700;color:#1B385A;
      text-align:center;border:1px solid #999;letter-spacing:.5px;
      font-family:'Noto Serif Devanagari',serif;
    }
    .main-table tbody{height:100%}
    .main-table td{
      padding:6px 5px;font-size:12px;color:#111;
      border:0.8px solid #c0c8d4;vertical-align:middle;
    }
    .main-table tbody tr:nth-child(odd){background:#ffffff26}
    .main-table tbody tr:nth-child(even){background:#fff8f533}
    td.c{text-align:center}
    td.l{text-align:left;padding-left:8px}

    /* ── total ── */
    .total-row{
      display:flex;align-items:center;flex-wrap:wrap;gap:8px;
      margin:8px 0 4px;padding:6px 4px;
      background:#f9f9f9;
      
      border-radius:4px;
    }
    .total-lbl{font-size:13px;font-weight:700;color:#111;margin-right:6px}
    .total-amt{font-size:16px;font-weight:700;color:#D3292F;margin-right:20px;font-family:'Noto Serif Devanagari',serif}
    .total-words-lbl{font-size:13px;font-weight:700;color:#111}
    .total-words{font-size:13px;color:#111;font-weight:500;margin-left:6px}

    /* ── sign + note ── */
    .sign-note-row{display:flex;justify-content:space-between;align-items:flex-end;margin:8px 0 4px;gap:15px}
    .note{font-size:11px;color:#444;line-height:1.6;flex:1;font-style:italic}
    .sign-box{text-align:center;min-width:140px;flex-shrink:0}
    .sign-line{border-bottom:1.5px dashed #999;height:35px;margin-bottom:5px}
    .sign-lbl{font-size:12px;font-weight:700;color:#1B385A}

    /* ── footer ── */
    .footer{
      border-top:1.5px solid #D3292F;padding-top:8px;margin-top:8px;
      display:flex;justify-content:space-between;align-items:center;gap:10px;
    }
    .footer-spacer{width:60px}
    .footer-center{flex:1;text-align:center}
    .footer-contacts{font-size:11px;font-weight:700;color:#D3292F;margin-bottom:2px;letter-spacing:.4px}
    .footer-sub{font-size:11px;font-weight:700;color:#1B385A;letter-spacing:.3px}
    .footer-eoe{font-size:12px;font-weight:700;color:#111;width:60px;text-align:right;white-space:nowrap}

    @media print{
      body{background:#fff}
      .print-bar{display:none!important}
      .page{margin:0;box-shadow:none;width:210mm;height:297mm;padding:1mm 5mm}
    }
  </style>
</head><body>

  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️&nbsp; Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Close</button>
    <span class="print-info">📄 ${rasidList.length} रसीद &nbsp;|&nbsp; कुल राशि: ₹${rasidList.reduce((s,r)=>s+r.totalAmount,0).toLocaleString()}</span>
  </div>

  ${pages}

</body></html>`);
  win.document.close();
}

// ─── Main Component ────────────────────────────────────────────────────────────
const RasidGroupClosingDrawer = ({ open, setOpen, agentId }) => {

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep]                   = useState(1);
  const [groupLoading, setGroupLoading]   = useState(false);
  const [agentLoading, setAgentLoading]   = useState(false);
  const [groupClosings, setGroupClosings] = useState([]);
  const [agentMembers, setAgentMembers]   = useState([]);

  const [expandedGroups, setExpandedGroups]         = useState([]);
  const [selectedGroupId, setSelectedGroupId]       = useState(null);
  const [selClosingMembers, setSelClosingMembers]   = useState(new Set());
  const [selAgentMembers, setSelAgentMembers]       = useState(new Set());

  const [searchGroup, setSearchGroup]     = useState('');
  const [searchClosing, setSearchClosing] = useState('');
  const [searchAgent, setSearchAgent]     = useState('');

  const [rasidDate, setRasidDate] = useState(dayjs());
  const [rasidNote, setRasidNote] = useState('');
  const [previewList, setPreviewList] = useState([]);

  // ── Reset + fetch on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(1); setSelectedGroupId(null);
      setSelClosingMembers(new Set()); setSelAgentMembers(new Set());
      setExpandedGroups([]); setPreviewList([]);
      setSearchGroup(''); setSearchClosing(''); setSearchAgent('');
      fetchGroupClosings();
      if (agentId) fetchAgentMembers();
    }
  }, [open, agentId]);

  const fetchGroupClosings = async () => {
    setGroupLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'groupClosings'), orderBy('closedAt','desc')));
      if (snap.empty) { setGroupClosings([]); return; }
      const closings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allIds = [...new Set(closings.flatMap(g => g.closedMemberIds || []))];
      const map = {};
      for (let i = 0; i < allIds.length; i += 30) {
        const s = await getDocs(query(collection(db,'members'), where(documentId(),'in', allIds.slice(i,i+30))));
        s.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
      }
      setGroupClosings(closings.map(g => ({
        ...g,
        members: (g.closedMemberIds||[]).map(id => map[id]||{ id, displayName:'Unknown' }),
      })));
    } catch(e) { console.error(e); message.error('Group closings fetch failed'); }
    finally { setGroupLoading(false); }
  };

  const fetchAgentMembers = async () => {
    setAgentLoading(true);
    try {
      const data = await fetchMembersByAgent(agentId);
      setAgentMembers(data);
    } catch(e) { message.error('Agent members fetch failed'); }
    finally { setAgentLoading(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedGroup = useMemo(
    () => groupClosings.find(g => g.id === selectedGroupId) || null,
    [groupClosings, selectedGroupId]
  );

  const filteredGroups = useMemo(() => {
    if (!searchGroup.trim()) return groupClosings;
    const s = searchGroup.toLowerCase();
    return groupClosings.filter(g =>
      g.groupName?.toLowerCase().includes(s) ||
      g.members?.some(m => m.displayName?.toLowerCase().includes(s) || m.registrationNumber?.toLowerCase().includes(s))
    );
  }, [groupClosings, searchGroup]);

  const filteredClosingMembers = useMemo(() => {
    if (!selectedGroup) return [];
    if (!searchClosing.trim()) return selectedGroup.members;
    const s = searchClosing.toLowerCase();
    return selectedGroup.members.filter(m =>
      m.displayName?.toLowerCase().includes(s) ||
      m.registrationNumber?.toLowerCase().includes(s) ||
      (m.phone||m.phoneNo||'').includes(searchClosing)
    );
  }, [selectedGroup, searchClosing]);

  const eligibleAgentMembers = useMemo(() => {
    if (!agentMembers.length || !selClosingMembers.size) return [];
    const selectedClosingIds = [...selClosingMembers];
    console.log(agentMembers,'agentMembers');
    return agentMembers.filter(m => {
      if (m.delete_flag) return false;
      if ((m.closing_pendingAmount || 0) <= 0) return false;
      const pmIds = selectedGroup.paymentMemberIds || [];
      return pmIds.includes(m.id);
    });
  }, [agentMembers, selClosingMembers]);

  const ineligibleCount = useMemo(() => {
    if (!agentMembers.length || !selClosingMembers.size) return 0;
    const selectedClosingIds = [...selClosingMembers];
    return agentMembers.filter(m => {
      if (m.delete_flag) return false;
      if ((m.closing_pendingAmount||0) <= 0) return false;
      const pmIds = m.paymentMemberIds || [];
      return !pmIds.some(id => selectedClosingIds.includes(id));
    }).length;
  }, [agentMembers, selClosingMembers]);

  const filteredAgentMembers = useMemo(() => {
    if (!searchAgent.trim()) return eligibleAgentMembers;
    const s = searchAgent.toLowerCase();
    return eligibleAgentMembers.filter(m =>
      m.displayName?.toLowerCase().includes(s) ||
      m.registrationNumber?.toLowerCase().includes(s) ||
      (m.phone||'').includes(searchAgent)
    );
  }, [eligibleAgentMembers, searchAgent]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const toggleGroupExpand = (id) =>
    setExpandedGroups(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const selectGroup = (id) => {
    setSelectedGroupId(id);
    setSelClosingMembers(new Set());
    setSelAgentMembers(new Set());
    setExpandedGroups(p => p.includes(id) ? p : [...p, id]);
  };

  const toggleClosingMember = (id) => setSelClosingMembers(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAllClosing = (checked) =>
    setSelClosingMembers(checked ? new Set(selectedGroup.members.map(m=>m.id)) : new Set());

  const toggleAgentMember = (id) => setSelAgentMembers(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAllAgent = (checked) =>
    setSelAgentMembers(checked ? new Set(eligibleAgentMembers.map(m=>m.id)) : new Set());

  // ── Build rasid list ───────────────────────────────────────────────────────
  const buildRasid = useCallback(() => {
    if (!selectedGroup || !selClosingMembers.size || !selAgentMembers.size) return [];
    const dateStr    = rasidDate.format('DD/MM/YYYY');
    const closingDs  = selectedGroup.closedAt?.toDate
      ? dayjs(selectedGroup.closedAt.toDate()).format('DD-MM-YYYY')
      : rasidDate.format('DD-MM-YYYY');
    const note = rasidNote ||
      `${rasidDate.format('MMM YYYY')}-सहयोग राशि ("यह सहयोग राशि स्वैच्छिक है एवं गैर-वापसीयोग्य है।")`;

    const entries = selectedGroup.members
      .filter(m => selClosingMembers.has(m.id))
      .map(m => ({
        code:   m.registrationNumber || '',
        name:   [m.displayName, m.fatherName ? '/ '+m.fatherName : ''].filter(Boolean).join(' '),
        date:   closingDs,
        mobile: m.phone || m.phoneNo || '',
      }));

    let serial = 10000 + (Date.now() % 9000);

    return agentMembers
      .filter(m => selAgentMembers.has(m.id))
      .map(am => {
        const payAmt = am.payAmount || 0;
        const total  = entries.length * payAmt;
        return {
          serialNo:     String(serial++),
          date:         dateStr,
          name:         [am.displayName, am.fatherName ? '/ '+am.fatherName : ''].filter(Boolean).join(' '),
          phone:        am.phone || '',
          address:      [am.village, am.city, am.state].filter(Boolean).join(', '),
          yojana:       selectedGroup.yojanaName || 'Shadi Sahyog Yojna',
          group:        selectedGroup.groupName || '',
          sahyogRashi:  payAmt,
          entries,
          totalAmount:  total,
          totalInWords: toWords(total),
          note,
        };
      });
  }, [selectedGroup, selClosingMembers, selAgentMembers, agentMembers, rasidDate, rasidNote]);

  // ── Step nav ───────────────────────────────────────────────────────────────
  const goToStep2 = () => {
    if (!selectedGroupId) { message.warning('Pehle ek group select karo!'); return; }
    if (!selClosingMembers.size) { message.warning('Kam se kam ek closing member select karo!'); return; }
    setStep(2);
  };

  const goToStep3 = () => {
    if (!selAgentMembers.size) { message.warning('Kam se kam ek agent member select karo!'); return; }
    const list = buildRasid();
    setPreviewList(list);
    setStep(3);
  };

  // ── Misc ───────────────────────────────────────────────────────────────────
  const allClosingChecked = selectedGroup && selectedGroup.members.length > 0 &&
    selectedGroup.members.every(m => selClosingMembers.has(m.id));
  const allAgentChecked = eligibleAgentMembers.length > 0 &&
    eligibleAgentMembers.every(m => selAgentMembers.has(m.id));

  const stepTitles = [
    '1. Group & Closing Members',
    '2. Agent Members Select',
    '3. Preview & Print',
  ];

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Drawer
      title={
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:34,height:34,borderRadius:8,background:`linear-gradient(135deg,${C.red},${C.blue})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <FilePdfOutlined style={{color:'#fff',fontSize:17}}/>
          </div>
          <div style={{flex:1}}>
            <Text strong style={{fontSize:14,color:C.fg,display:'block'}}>रसीद जनरेटर</Text>
            <Text style={{fontSize:11,color:C.muted}}>{stepTitles[step-1]}</Text>
          </div>
        </div>
      }
      placement="right"
      width={860}
      onClose={()=>setOpen(false)}
      open={open}
      bodyStyle={{padding:0,background:C.bg,display:'flex',flexDirection:'column',height:'100%'}}
      headerStyle={{borderBottom:`2px solid ${C.border}`,background:C.surf}}
      extra={
        <Space>
          {step > 1 && <Button icon={<LeftOutlined/>} onClick={()=>setStep(s=>s-1)}>Back</Button>}
          {step === 1 && (
            <Button type="primary" icon={<RightOutlined/>} onClick={goToStep2}
              disabled={!selectedGroupId || !selClosingMembers.size}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              Next: Agent Members
            </Button>
          )}
          {step === 2 && (
            <Button type="primary" icon={<RightOutlined/>} onClick={goToStep3}
              disabled={!selAgentMembers.size}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              Preview ({selAgentMembers.size} रसीद)
            </Button>
          )}
          {step === 3 && (
            <Button type="primary" icon={<FilePdfOutlined/>} onClick={()=>openPrintWindow(previewList)}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              🖨 Print / Save PDF
            </Button>
          )}
        </Space>
      }
    >

      {/* ── Step indicator ── */}
      <div style={{padding:'10px 16px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:0}}>
        {[1,2,3].map((s,i)=>(
          <React.Fragment key={s}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{
                width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                background: step>=s ? `linear-gradient(135deg,${C.red},${C.blue})` : '#e5e7eb',
                color: step>=s ? '#fff' : C.muted, fontSize:12, fontWeight:700,
              }}>{step>s ? '✓' : s}</div>
              <Text style={{fontSize:11,fontWeight:step===s?700:400,color:step>=s?C.fg:C.muted}}>
                {['Group Select','Agent Members','Preview'][i]}
              </Text>
            </div>
            {i<2 && <div style={{flex:1,height:1,background:step>s?C.blue:'#e5e7eb',margin:'0 10px'}}/>}
          </React.Fragment>
        ))}
      </div>

      {/* ════ STEP 1 ════ */}
      {step===1 && (
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>

          {/* LEFT — Groups */}
          <div style={{width:280,flexShrink:0,borderRight:`1.5px solid ${C.border}`,display:'flex',flexDirection:'column',background:C.surf}}>
            <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`}}>
              <Text strong style={{fontSize:12,color:C.fg,display:'block',marginBottom:6}}>Group Closings</Text>
              <Input placeholder="Search groups..." size="small"
                prefix={<SearchOutlined style={{color:C.pink}}/>}
                value={searchGroup} onChange={e=>setSearchGroup(e.target.value)} allowClear/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:8}}>
              {groupLoading ? <div style={{textAlign:'center',padding:40}}><Spin/></div>
                : filteredGroups.length===0 ? <Empty description="No groups" style={{marginTop:30}}/>
                : filteredGroups.map(g => {
                  const isSel   = selectedGroupId === g.id;
                  const isExp   = expandedGroups.includes(g.id);
                  const cd      = g.closedAt?.toDate ? dayjs(g.closedAt.toDate()).format('DD MMM YY') : '—';
                  const selCnt  = isSel ? [...selClosingMembers].filter(id => g.members.some(m=>m.id===id)).length : 0;
                  return (
                    <div key={g.id} style={{marginBottom:6,borderRadius:10,overflow:'hidden',border:`1.5px solid ${isSel?C.red:C.border}`,boxShadow:isSel?`0 0 0 2px ${C.red}20`:undefined}}>
                      <div onClick={()=>{ selectGroup(g.id); toggleGroupExpand(g.id); }}
                        style={{padding:'8px 10px',cursor:'pointer',background:isSel?`${C.red}0e`:'#fafafa',display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1}}>
                          <Text strong style={{fontSize:11.5,color:isSel?C.red:C.fg}}>
                            {g.groupName||`Group #${g.id.slice(-5)}`}
                          </Text>
                          <div style={{display:'flex',gap:5,marginTop:2,flexWrap:'wrap'}}>
                            <Tag style={{fontSize:9,padding:'0 5px',margin:0}} color="blue">
                              <CalendarOutlined/> {cd}
                            </Tag>
                            <Tag style={{fontSize:9,padding:'0 5px',margin:0}} color="geekblue">
                              <TeamOutlined/> {g.members.length}
                            </Tag>
                            {selCnt>0 && <Tag style={{fontSize:9,padding:'0 5px',margin:0}} color="volcano">{selCnt} sel</Tag>}
                          </div>
                        </div>
                        <span style={{color:C.muted,fontSize:11,transition:'transform .2s',transform:isExp?'rotate(90deg)':'none',display:'inline-block'}}>
                          <RightOutlined/>
                        </span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            <div style={{padding:'8px 12px',borderTop:`1px solid ${C.border}`}}>
              <Button size="small" icon={<ReloadOutlined/>} onClick={fetchGroupClosings} style={{width:'100%'}}>Refresh</Button>
            </div>
          </div>

          {/* RIGHT — Closing members */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {!selectedGroup ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10}}>
                <ArrowRightOutlined style={{fontSize:32,color:C.muted,transform:'rotate(180deg)'}}/>
                <Text type="secondary">Left se ek group select karo</Text>
              </div>
            ) : (
              <>
                <div style={{padding:'9px 14px',background:`${C.red}08`,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                  <Checkbox
                    indeterminate={selClosingMembers.size>0&&!allClosingChecked}
                    checked={allClosingChecked}
                    onChange={e=>selectAllClosing(e.target.checked)}
                  >
                    <Text strong style={{fontSize:12}}>
                      {selectedGroup.groupName||'Group'} — Closing Members ({selectedGroup.members.length})
                    </Text>
                  </Checkbox>
                  <Badge count={selClosingMembers.size} style={{backgroundColor:C.red}}/>
                  <div style={{flex:1}}/>
                  <Input placeholder="Search..." size="small" style={{width:170}}
                    prefix={<SearchOutlined style={{fontSize:11,color:C.pink}}/>}
                    value={searchClosing} onChange={e=>setSearchClosing(e.target.value)} allowClear/>
                </div>

                <div style={{padding:'8px 14px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
                  <div>
                    <Text style={{fontSize:11,color:C.muted,display:'block'}}>दिनांक</Text>
                    <DatePicker value={rasidDate} onChange={d=>setRasidDate(d||dayjs())} format="DD/MM/YYYY" size="small" style={{width:130}}/>
                  </div>
                  <div style={{flex:1}}>
                    <Text style={{fontSize:11,color:C.muted,display:'block'}}>Note</Text>
                    <Input value={rasidNote} onChange={e=>setRasidNote(e.target.value)} placeholder="Optional note..." size="small"/>
                  </div>
                </div>

                <div style={{flex:1,overflowY:'auto',padding:'8px 12px'}}>
                  {filteredClosingMembers.length===0
                    ? <Empty description="No members" style={{marginTop:30}}/>
                    : <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        {filteredClosingMembers.map((m,i) => {
                          const isSel = selClosingMembers.has(m.id);
                          return (
                            <div key={m.id} onClick={()=>toggleClosingMember(m.id)} style={{
                              display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:10,cursor:'pointer',
                              border:`1.5px solid ${isSel?C.pink:C.border}`,
                              background:isSel?`${C.pink}0e`:(i%2===0?'#fafafa':C.surf),
                              boxShadow:isSel?`0 0 0 2px ${C.pink}20`:undefined,
                              transition:'all .15s',
                            }}>
                              <Checkbox checked={isSel} onChange={()=>toggleClosingMember(m.id)} onClick={e=>e.stopPropagation()}/>
                              <Avatar size={32} src={m.photoURL} icon={!m.photoURL&&<UserOutlined/>}
                                style={{backgroundColor:C.blue,flexShrink:0,fontSize:12}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <Text strong style={{fontSize:12,color:isSel?C.pink:C.fg}}>
                                  {m.displayName||'Unknown'}
                                  {m.fatherName&&<Text style={{fontWeight:400,color:C.muted,fontSize:11}}> / {m.fatherName}</Text>}
                                </Text>
                                <div>
                                  <Text style={{fontSize:11,color:C.muted}}>
                                    {m.registrationNumber}
                                    {(m.phone||m.phoneNo) ? ` · ${m.phone||m.phoneNo}` : ''}
                                  </Text>
                                </div>
                                <Text style={{fontSize:11,color:C.muted}}>
                                  {[m.village,m.city,m.state].filter(Boolean).join(', ')}
                                </Text>
                              </div>
                              {isSel && <CheckCircleOutlined style={{color:C.pink,fontSize:14,flexShrink:0}}/>}
                            </div>
                          );
                        })}
                      </div>
                  }
                </div>

                <div style={{padding:'10px 14px',background:C.surf,borderTop:`2px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                  <Text style={{fontSize:12,color:C.muted,flex:1}}>
                    {selClosingMembers.size} / {selectedGroup.members.length} closing members selected
                  </Text>
                  <Button type="primary" icon={<RightOutlined/>} onClick={goToStep2}
                    disabled={!selClosingMembers.size}
                    style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
                    Next: Agent Members
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ STEP 2 ════ */}
      {step===2 && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          <div style={{padding:'10px 16px',background:'#fffbeb',borderBottom:`1px solid #fde68a`,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <InfoCircleOutlined style={{color:C.amber,fontSize:14}}/>
            <Text style={{fontSize:12,color:'#78350f'}}>
              Sirf wo agent members dikh rahe hain jinke{' '}
              <b>paymentMemberIds</b> mein selected closing member hai.{' '}
              {ineligibleCount > 0 && (
                <span style={{color:C.orange}}>({ineligibleCount} members eligible nahi hain — skip honge)</span>
              )}
            </Text>
          </div>

          <div style={{padding:'6px 16px',background:'#f0fdf4',borderBottom:`1px solid #bbf7d0`}}>
            <Text style={{fontSize:11,color:'#166534',display:'block',marginBottom:3}}>
              <b>Rasid entries</b> (table mein ye rows hongi — {selClosingMembers.size} closing members):
            </Text>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {selectedGroup?.members.filter(m=>selClosingMembers.has(m.id)).map(m=>(
                <Tag key={m.id} color="green" style={{fontSize:10}}>
                  {m.displayName?.split(' ')[0]} {m.fatherName?'/ '+m.fatherName.split(' ')[0]:''}
                </Tag>
              ))}
            </div>
          </div>

          <div style={{padding:'8px 16px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
            <Checkbox
              indeterminate={selAgentMembers.size>0&&!allAgentChecked}
              checked={allAgentChecked}
              onChange={e=>selectAllAgent(e.target.checked)}
            >
              <Text strong style={{fontSize:12}}>Agent Members — सभी ({eligibleAgentMembers.length})</Text>
            </Checkbox>
            <Badge count={selAgentMembers.size} style={{backgroundColor:C.red}}/>
            <div style={{flex:1}}/>
            <Input placeholder="Search agent members..." size="small" style={{width:220}}
              prefix={<SearchOutlined style={{fontSize:11,color:C.pink}}/>}
              value={searchAgent} onChange={e=>setSearchAgent(e.target.value)} allowClear/>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'10px 16px'}}>
            {agentLoading ? (
              <div style={{textAlign:'center',padding:60}}><Spin size="large"/></div>
            ) : eligibleAgentMembers.length===0 ? (
              <div style={{textAlign:'center',padding:40}}>
                <ExclamationCircleOutlined style={{fontSize:36,color:C.amber,marginBottom:10,display:'block'}}/>
                <Text type="secondary" style={{fontSize:13}}>
                  Koi eligible agent member nahi mila.<br/>
                  <Text style={{fontSize:11}}>Selected closing members ki IDs kisi agent member ke paymentMemberIds mein nahi hain.</Text>
                </Text>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {filteredAgentMembers.map((m,i) => {
                  const isSel    = selAgentMembers.has(m.id);
                  const payAmt   = m.payAmount || 0;
                  const rasidAmt = selClosingMembers.size * payAmt;
                  const paid     = m.closing_paidAmount||0;
                  const total    = m.closing_totalAmount||0;
                  const pct      = total>0 ? Math.round((paid/total)*100) : 0;

                  return (
                    <div key={m.id} onClick={()=>toggleAgentMember(m.id)} style={{
                      display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,cursor:'pointer',
                      border:`1.5px solid ${isSel?C.pink:C.border}`,
                      background:isSel?`${C.pink}0e`:(i%2===0?'#fafafa':C.surf),
                      boxShadow:isSel?`0 0 0 2px ${C.pink}20`:undefined,
                      transition:'all .15s',
                    }}>
                      <Checkbox checked={isSel} onChange={()=>toggleAgentMember(m.id)} onClick={e=>e.stopPropagation()}/>
                      <Avatar size={38} src={m.photoURL} icon={!m.photoURL&&<UserOutlined/>}
                        style={{backgroundColor:C.blue,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <Text strong style={{fontSize:13,color:isSel?C.pink:C.fg}}>{m.displayName}</Text>
                          {m.fatherName&&<Text style={{fontSize:11,color:C.muted}}>/ {m.fatherName}</Text>}
                          <Tag color="orange" style={{fontSize:10,margin:0}}>₹{payAmt}/closing</Tag>
                          <Tag color="geekblue" style={{fontSize:10,margin:0}}>{m.registrationNumber}</Tag>
                        </div>
                        <Text style={{fontSize:11,color:C.muted}}>
                          {m.phone}{m.village?` · ${m.village}`:''}
                          {m.city?`, ${m.city}`:''}
                        </Text>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                          <div style={{height:3,width:100,background:'#f0f0f0',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${pct}%`,background:C.green,borderRadius:3}}/>
                          </div>
                          <Text style={{fontSize:10,color:C.muted}}>
                            pending: ₹{(m.closing_pendingAmount||0).toLocaleString()}
                          </Text>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0,minWidth:90}}>
                        <div style={{fontSize:14,fontWeight:700,color:isSel?C.red:C.muted}}>
                          ₹{rasidAmt.toLocaleString()}
                        </div>
                        <Text style={{fontSize:10,color:C.muted}}>
                          {selClosingMembers.size} × ₹{payAmt}
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{padding:'10px 16px',background:C.surf,borderTop:`2px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
            <Text style={{fontSize:12,color:C.muted,flex:1}}>
              {selAgentMembers.size} members selected · {selClosingMembers.size} entries/rasid
            </Text>
            <Button onClick={()=>setStep(1)} icon={<LeftOutlined/>}>Back</Button>
            <Button type="primary" icon={<RightOutlined/>} onClick={goToStep3}
              disabled={!selAgentMembers.size}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              Preview ({selAgentMembers.size} रसीद)
            </Button>
          </div>
        </div>
      )}

      {/* ════ STEP 3 ════ */}
      {step===3 && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',gap:12,flexWrap:'wrap'}}>
            {[
              {l:'Total रसीद',  v:previewList.length,                                            c:C.blue},
              {l:'Entries/रसीद',v:previewList[0]?.entries?.length||0,                            c:C.orange},
              {l:'Amount/रसीद', v:`₹${previewList[0]?.totalAmount?.toLocaleString()||0}`,        c:C.red},
              {l:'Grand Total', v:`₹${previewList.reduce((s,r)=>s+r.totalAmount,0).toLocaleString()}`, c:C.green},
            ].map(s=>(
              <div key={s.l} style={{background:'#fafafa',borderRadius:10,padding:'8px 16px',border:`1px solid ${C.border}`,minWidth:120}}>
                <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:11,color:C.muted}}>{s.l}</div>
              </div>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {previewList.map((r,i)=>(
                <div key={i} style={{background:C.surf,borderRadius:12,overflow:'hidden',border:`1.5px solid ${C.border}`,boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
                  <div style={{padding:'10px 14px',background:`linear-gradient(135deg,${C.red}0e,${C.blue}0a)`,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:`linear-gradient(135deg,${C.red},${C.blue})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <Text strong style={{fontSize:13,color:C.fg}}>{r.name}</Text>
                      <Text style={{fontSize:11,color:C.muted,marginLeft:8}}>{r.phone}</Text>
                    </div>
                    <Tag color="volcano" style={{fontWeight:700,fontSize:12}}>₹{r.totalAmount.toLocaleString()}</Tag>
                    <Tag color="blue" style={{fontSize:11}}>{r.group}</Tag>
                  </div>
                  <div style={{padding:'8px 14px'}}>
                    <Text style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>
                      {r.entries.length} entries → <Text strong style={{color:C.blue}}>{r.totalInWords}</Text>
                    </Text>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {r.entries.slice(0,10).map((e,j)=>(
                        <Tag key={j} style={{fontSize:10}}>{e.name.split('/')[0]?.trim().split(' ')[0]} {e.mobile?'·'+e.mobile:''}</Tag>
                      ))}
                      {r.entries.length>10&&<Tag color="default" style={{fontSize:10}}>+{r.entries.length-10} more</Tag>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{padding:'10px 16px',background:C.surf,borderTop:`2px solid ${C.border}`,display:'flex',justifyContent:'flex-end',gap:10}}>
            <Button icon={<LeftOutlined/>} onClick={()=>setStep(2)}>Back</Button>
            <Button type="primary" icon={<FilePdfOutlined/>} onClick={()=>openPrintWindow(previewList)}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700,height:38,paddingInline:24}}>
              🖨 Print / Save PDF
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};

export default RasidGroupClosingDrawer;