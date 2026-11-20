// SSGMS "सहयोग राशि रसीद" — what the rasid prints, editable in Settings → Rasid (रसीद) Design.
// The defaults are exactly what the panel always printed, so nothing changes until someone edits it.
// Used by members/components/ClosingRasidPdf (browser, agent app route and the rasid worker) and
// by services/rasid/settings.js (saving). No Node / browser-only imports here.

export const DEFAULT_RASID_DESIGN = {
  // ── header ──
  blessings: ['॥ श्री गणेशाय नमः ॥', '॥ श्री शनिदेवाय नमः ॥', '॥ श्री सांवलाजी महाराज नमः ॥'],
  trustName: 'श्री क्षत्रिय घाँची मोदी समाज सेवा संस्थान ट्रस्ट',
  cityState: 'अहमदाबाद, गुजरात',
  officeLabel: 'हेड ऑफिस',
  officeAddress: '68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास, चांदखेडा, साबरमती, अहमदाबाद 382424 (O) 9898535345',
  contactLabel: 'संपर्क सूत्र',
  contactName: 'अध्यक्ष श्री वोरारामजी टी. बोराणा',
  contactPhone: '9374934004',
  officePhoneLabel: 'ऑफिस',
  officePhone: '9898535345',
  since: '2024',
  regNo: 'A/5231',
  logo: '',          // '' = trust logo (/Images/logoT.png); or an uploaded /files/... picture
  rightLogo: '',     // '' = शनिदेव picture (/Images/sanidevImg.jpeg)
  watermark: true,   // faint logo behind the page

  // ── title ──
  title: 'सहयोग राशि रसीद',
  paidStamp: 'भुगतान प्राप्त — PAID',

  // ── labels ──
  joinDateLabel: 'सदस्यता तिथि',
  regNoLabel: 'रजि. नं.',
  oldNoLabel: 'आवेदन नं. (पुराना)',
  workerLabel: 'कार्यकर्ता',
  signLabel: 'संस्थापक हस्ताक्षर',

  // ── footer ──
  footerContacts: '9374934004, 9825289998, 9426517804, 9824017977',
  jurisdiction: 'Exclusive jurisdiction Ahmedabad, Gujarat',
  eoe: 'E. & O.E.',

  // ── colours ──
  colorMain: '#1B385A',    // title, headings, table head
  colorAccent: '#D3292F',  // labels, blessings, badge, footer line

  // ── what shows ──
  show: {
    regNo: true,         // member's registration number
    oldNo: true,         // old application number (from the old system), when the member has one
    joinDate: true,      // member's own join date, next to पता
    phone: true,
    address: true,
    yojana: true,
    ageGroup: true,
    sahyogRashi: true,
    amountWords: true,   // शब्दों में रूपये
    worker: true,
    note: true,
    colCode: true,       // table: कोड
    colVillage: true,    // table: गाँव with the name
    colDate: true,       // table: दिनांक
    colMobile: true,     // table: मोबाइल न.
  },
};

export const RASID_SHOW_KEYS = Object.keys(DEFAULT_RASID_DESIGN.show);

const HEX = /^#[0-9a-fA-F]{6}$/;
const TEXT_MAX = {
  trustName: 120, cityState: 80, officeLabel: 30, officeAddress: 240, contactLabel: 30, contactName: 120,
  contactPhone: 60, officePhoneLabel: 30, officePhone: 60, since: 20, regNo: 60, title: 60, paidStamp: 60,
  joinDateLabel: 40, regNoLabel: 40, oldNoLabel: 40, workerLabel: 40, signLabel: 60, footerContacts: 160, jurisdiction: 120, eoe: 20,
};
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
const pic = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.startsWith('/files/') || s.startsWith('/Images/') || s.startsWith('data:image/') ? s : '';
};

/** Any saved / sent value → a full, safe design (missing keys take the defaults). */
export function normalizeRasidDesign(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const D = DEFAULT_RASID_DESIGN;
  const out = { ...D, show: { ...D.show } };
  for (const [k, max] of Object.entries(TEXT_MAX)) {
    const v = str(r[k], max);
    if (v !== null) out[k] = v;
  }
  if (Array.isArray(r.blessings)) out.blessings = r.blessings.slice(0, 3).map((x) => str(x, 50) || '');
  while (out.blessings.length < 3) out.blessings.push('');
  out.logo = pic(r.logo);
  out.rightLogo = pic(r.rightLogo);
  if (typeof r.watermark === 'boolean') out.watermark = r.watermark;
  if (HEX.test(r.colorMain || '')) out.colorMain = r.colorMain;
  if (HEX.test(r.colorAccent || '')) out.colorAccent = r.colorAccent;
  const sh = r.show && typeof r.show === 'object' ? r.show : {};
  for (const k of RASID_SHOW_KEYS) if (typeof sh[k] === 'boolean') out.show[k] = sh[k];
  return out;
}

// The old system's application / registration number — the migration stored it under one of these
// (same list as members/components/MemberPdf/MemberListPdf.js → OLD_REG_FIELDS).
export const OLD_NO_FIELDS = [
  'legacyApplicationNo', 'applicationNumber', 'applicationNo',
  'oldRegistrationNumber', 'oldRegNo', 'old_reg_no', 'oldRegno', 'old_registration_number',
  'previousRegistrationNumber', 'previousRegNo', 'prevRegNo',
  'legacyRegistrationNumber', 'legacyRegNo', 'oldMemberId', 'oldId',
];
export function memberOldNo(m = {}) {
  for (const k of OLD_NO_FIELDS) {
    const v = m?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      const s = String(v).trim();
      return s === String(m.registrationNumber || '').trim() ? '' : s;
    }
  }
  return '';
}

/** "DD-MM-YYYY" from the member's join date fields (programJoinDate / dateJoin / joinDateTs) */
export function memberJoinDate(m = {}) {
  const v = m.programJoinDate || m.dateJoin || m.joinDate || m.joinDateTs;
  if (!v) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    const d = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
    if (d) return `${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}-${d[3]}`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) {
      // an instant stored from IST midnight reads as the previous day in UTC
      const t = new Date(s);
      if (s.length > 10 && !Number.isNaN(t.getTime())) {
        const ist = new Date(t.getTime() + 5.5 * 3600e3);
        return `${String(ist.getUTCDate()).padStart(2, '0')}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${ist.getUTCFullYear()}`;
      }
      return `${iso[3]}-${iso[2]}-${iso[1]}`;
    }
    return '';
  }
  const t = typeof v?.toDate === 'function' ? v.toDate() : v instanceof Date ? v : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  const ist = new Date(t.getTime() + 5.5 * 3600e3);
  return `${String(ist.getUTCDate()).padStart(2, '0')}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${ist.getUTCFullYear()}`;
}
