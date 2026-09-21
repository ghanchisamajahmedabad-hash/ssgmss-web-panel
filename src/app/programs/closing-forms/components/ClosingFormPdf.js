// सदस्यता समापन पत्र — the form handed over when a member's closing is settled.
//
// Adapted from the version you supplied, which came from a different codebase:
//   • fonts load from this project's helper path, not @/app/api/helperfile
//   • the org header is inlined (there is no TrustData in redux here, the other
//     PDFs in this project hardcode it, so this matches them)
//   • field names follow THIS project's member documents — dobDate not bobDate,
//     closed_date not closing_date, guardianName/guardianRelation
//
// A5 portrait, to match the certificate and join form already in use.

import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import dayjs from 'dayjs';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari,     fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold'   },
  ],
});

const RED    = '#D3292F';
const BLUE   = '#1B385A';
const BORDER = '#8a97a8';

// Firestore Timestamps, ISO strings and DD-MM-YYYY all reach this component
// depending on which path wrote the field.
const fmtDate = (v) => {
  if (!v) return '—';
  if (typeof v?.toDate === 'function') return dayjs(v.toDate()).format('DD-MM-YYYY');
  if (typeof v === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(v)) return v;
  const d = dayjs(v);
  return d.isValid() ? d.format('DD-MM-YYYY') : String(v);
};

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}/-`;

// Single-line fields on a fixed-height form: clip rather than let a long value
// wrap and push the layout down.
const clip = (v, max) => {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari', padding: 10 },
  outer: { borderWidth: 3, borderColor: RED, borderRadius: 4, padding: 4, height: '100%' },
  inner: { borderWidth: 1, borderColor: BORDER, borderRadius: 2, padding: 8, height: '100%',
           flexDirection: 'column', position: 'relative' },

  watermark:      { position: 'absolute', top: '32%', left: '22%', width: '56%', opacity: 0.06 },
  watermarkImage: { width: '100%', height: '100%' },

  bless:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  blessText: { fontSize: 6.5, color: RED, fontWeight: 'bold' },

  hdr:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  logo:       { width: 42, height: 38, borderRadius: 3 },
  hdrCenter:  { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  orgTitle:   { fontSize: 12, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  orgSub:     { fontSize: 8.5, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  orgAddr:    { fontSize: 5.8, color: '#333', textAlign: 'center', lineHeight: 1.35, marginTop: 1 },
  orgContact: { fontSize: 6, fontWeight: 'bold', color: BLUE, textAlign: 'center' },

  sinceRow:  { flexDirection: 'row', justifyContent: 'space-between',
               borderBottomWidth: 1, borderBottomColor: BLUE, paddingVertical: 2, marginTop: 2 },
  sinceText: { fontSize: 6.5, fontWeight: 'bold', color: BLUE },

  badgeWrap: { alignItems: 'center', marginTop: 5, marginBottom: 4 },
  badge:     { backgroundColor: BLUE, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 18 },
  badgeText: { fontSize: 9.5, color: '#fff', fontWeight: 'bold', letterSpacing: 0.3 },

  serialNo: { position: 'absolute', top: 2, right: 6, fontSize: 7.5, fontWeight: 'bold', color: BLUE },

  photoBox:   { position: 'absolute', right: 8, top: 96, width: 50, height: 50,
                borderWidth: 1, borderColor: '#555', borderRadius: 2, overflow: 'hidden',
                backgroundColor: '#f6f6f6' },
  photoImage: { width: '100%', height: '100%', objectFit: 'cover' },
  photoLabel: { fontSize: 5.5, color: '#888', textAlign: 'center', marginTop: 20 },

  form:      { marginTop: 4, flex: 1 },
  row:       { flexDirection: 'row', marginBottom: 4, width: '82%' },
  rowFull:   { flexDirection: 'row', marginBottom: 4, width: '100%' },
  half:      { flexDirection: 'row', alignItems: 'flex-end', width: '50%', paddingRight: 6 },
  field:     { flexDirection: 'row', alignItems: 'flex-end', flex: 1 },
  label:     { fontSize: 7, color: '#000', marginRight: 3 },
  value:     { fontSize: 7.5, color: '#000', fontWeight: 'bold', flex: 1,
               borderBottomWidth: 0.7, borderBottomColor: '#555', borderBottomStyle: 'dotted',
               paddingBottom: 1.5, paddingHorizontal: 3 },

  moneyBox:   { borderWidth: 0.8, borderColor: BORDER, borderRadius: 3, padding: 5, marginTop: 4 },
  moneyRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  moneyLabel: { fontSize: 7, color: '#000', width: 150 },
  moneyVal:   { fontSize: 7.5, fontWeight: 'bold', color: '#000', backgroundColor: '#fff3cd',
                borderWidth: 0.5, borderColor: BORDER, borderRadius: 2,
                paddingVertical: 2, paddingHorizontal: 6, minWidth: 62, textAlign: 'center' },
  moneyNet:   { backgroundColor: '#d4edda', borderColor: '#9ad0a8', color: '#155724' },
  moneyNote:  { fontSize: 6.5, color: '#666', marginLeft: 5 },

  payRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 4,
               borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 4 },
  payTagOk:  { fontSize: 7, fontWeight: 'bold', color: '#155724',
               backgroundColor: '#d4edda', borderWidth: 0.5, borderColor: '#9ad0a8',
               borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6 },
  payTagDue: { fontSize: 7, fontWeight: 'bold', color: '#8a5a00',
               backgroundColor: '#fff3cd', borderWidth: 0.5, borderColor: '#e0c27a',
               borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6 },
  payDate:   { fontSize: 7, color: '#000', marginLeft: 8 },

  signRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 },
  signBox:   { width: '31%', alignItems: 'center' },
  signLine:  { width: '100%', height: 0.8, backgroundColor: '#000', marginTop: 20, marginBottom: 3 },
  signLabel: { fontSize: 7, fontWeight: 'bold', color: '#000', textAlign: 'center' },
  signName:  { fontSize: 6, color: '#666', textAlign: 'center' },
});

const Field = ({ label, value, width, clipAt = 40 }) => (
  <View style={[styles.field, width ? { width } : null]}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{clip(value, clipAt)}</Text>
  </View>
);

const ClosingFormPdf = ({ member = {}, settlement = {}, programName = '' }) => {
  const m = member || {};

  return (
    <Document>
      <Page size="A5" orientation="portrait" style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.inner}>
            <Text style={styles.serialNo}>{m.registrationNumber || ''}</Text>

            <View style={styles.watermark}>
              <Image src="/Images/logoT.png" style={styles.watermarkImage} />
            </View>

            {/* ── Header ── */}
            <View style={styles.bless}>
              <Text style={styles.blessText}>॥ श्री गणेशाय नमः ॥</Text>
              <Text style={styles.blessText}>॥ श्री शनिदेवाय नमः ॥</Text>
              <Text style={styles.blessText}>॥ श्री सांवलाजी महाराज नमः ॥</Text>
            </View>

            <View style={styles.hdr}>
              <Image src="/Images/logoT.png" style={styles.logo} />
              <View style={styles.hdrCenter}>
                <Text style={styles.orgTitle}>श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट</Text>
                <Text style={styles.orgSub}>अहमदाबाद, गुजरात</Text>
                <Text style={styles.orgAddr}>
                  हेड ऑफिस : 68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424
                </Text>
                <Text style={styles.orgContact}>संपर्क : 9374934004 · ऑफिस : 9898535345</Text>
              </View>
              <Image src="/Images/sanidevImg.jpeg" style={styles.logo} />
            </View>

            <View style={styles.sinceRow}>
              <Text style={styles.sinceText}>SINCE : 2024</Text>
              <Text style={styles.sinceText}>Reg. No: A/5231</Text>
            </View>

            <View style={styles.badgeWrap}>
              <View style={styles.badge}><Text style={styles.badgeText}>सदस्यता समापन पत्र</Text></View>
            </View>

            {/* ── Photo ── */}
            <View style={styles.photoBox}>
              {m.photoURL
                ? <Image src={m.photoURL} style={styles.photoImage} />
                : <Text style={styles.photoLabel}>सदस्य फोटो</Text>}
            </View>

            {/* ── Member details ── */}
            <View style={styles.form}>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Field label="सदस्यता क्रमांक:" value={m.registrationNumber} clipAt={16} />
                </View>
                <View style={styles.half}>
                  {/* The member's OWN closing date — what this form settles. */}
                  <Field label="क्लोजिंग दिनांक:"
                         value={fmtDate(m.closed_date || m.marriageDate || m.member_closed_at)}
                         clipAt={12} />
                </View>
              </View>

              <View style={styles.row}><Field label="नाम:" value={m.displayName} clipAt={44} /></View>
              <View style={styles.row}><Field label="पिता/पति का नाम:" value={m.fatherName} clipAt={38} /></View>

              <View style={styles.rowFull}>
                <View style={styles.half}><Field label="गोत्र:" value={m.gotra || m.caste} clipAt={18} /></View>
                <View style={styles.half}><Field label="मोबाईल:" value={m.phone} clipAt={14} /></View>
              </View>

              <View style={styles.rowFull}>
                <View style={styles.half}><Field label="जन्म दिनांक:" value={fmtDate(m.dobDate)} clipAt={12} /></View>
                <View style={styles.half}><Field label="आधार नंबर:" value={m.aadhaarNo} clipAt={16} /></View>
              </View>

              <View style={styles.rowFull}><Field label="गाँव/शहर:" value={m.village} clipAt={44} /></View>

              <View style={styles.rowFull}>
                <View style={styles.half}><Field label="जिला:"  value={m.district} clipAt={18} /></View>
                <View style={styles.half}><Field label="राज्य:" value={m.state}    clipAt={18} /></View>
              </View>

              <View style={styles.rowFull}>
                <View style={[styles.half, { width: '62%' }]}>
                  <Field label="वारिसदार:" value={m.guardianName || m.guardian} clipAt={26} />
                </View>
                <View style={[styles.half, { width: '38%', paddingRight: 0 }]}>
                  <Field label="संबंध:" value={m.guardianRelation} clipAt={12} />
                </View>
              </View>

              <View style={styles.rowFull}>
                <View style={styles.half}><Field label="किस्त राशि:" value={money(m.payAmount)} clipAt={14} /></View>
                <View style={styles.half}><Field label="योजना:" value={programName || m.programName} clipAt={22} /></View>
              </View>

              {/* ── Settlement ── */}
              <View style={styles.moneyBox}>
                <View style={styles.moneyRow}>
                  <Text style={styles.moneyLabel}>सदस्य ने सहयोग राशि दी:</Text>
                  <Text style={styles.moneyVal}>{money(settlement.memberContributed)}</Text>
                  <Text style={styles.moneyNote}>({Number(settlement.membersCount || 0)} क्लोजिंग)</Text>
                </View>
                <View style={styles.moneyRow}>
                  <Text style={styles.moneyLabel}>सदस्य को सहयोग राशि दी जा रही है:</Text>
                  <Text style={styles.moneyVal}>{money(settlement.amountGiven)}</Text>
                  <Text style={styles.moneyNote}>({settlement.paymentMode || 'नकद'})</Text>
                </View>
                <View style={styles.moneyRow}>
                  <Text style={styles.moneyLabel}>सदस्य की पुरानी बकाया:</Text>
                  <Text style={styles.moneyVal}>{money(settlement.oldPending)}</Text>
                </View>
                <View style={[styles.moneyRow, { marginBottom: 0 }]}>
                  <Text style={[styles.moneyLabel, { color: RED, fontWeight: 'bold' }]}>
                    सदस्य को दी जा रही नेट राशि:
                  </Text>
                  <Text style={[styles.moneyVal, styles.moneyNet]}>{money(settlement.netAmount)}</Text>
                </View>

                {/* Handover status — printed so a signed copy records whether the
                    money was actually paid, and on which day. */}
                <View style={styles.payRow}>
                  <Text style={[styles.moneyLabel, { width: 88 }]}>भुगतान स्थिति:</Text>
                  {settlement.paymentDone ? (
                    <>
                      <Text style={styles.payTagOk}>भुगतान हो गया</Text>
                      <Text style={styles.payDate}>
                        दिनांक : {fmtDate(settlement.paymentDate)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.payTagDue}>भुगतान बाकी</Text>
                  )}
                </View>
              </View>
            </View>

            {/* ── Signatures ── */}
            <View style={styles.signRow}>
              <View style={styles.signBox}>
                <View style={styles.signLine} />
                <Text style={styles.signLabel}>वारिसदार हस्ताक्षर</Text>
              </View>
              <View style={styles.signBox}>
                <View style={styles.signLine} />
                <Text style={styles.signLabel}>कार्यकर्ता हस्ताक्षर</Text>
                <Text style={styles.signName}>{clip(m.addedByName || m.agentName, 24)}</Text>
              </View>
              <View style={styles.signBox}>
                <View style={styles.signLine} />
                <Text style={styles.signLabel}>संस्थापक हस्ताक्षर</Text>
                <Text style={styles.signName}>श्री वोरारामजी टी. बोराणा</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default ClosingFormPdf;
