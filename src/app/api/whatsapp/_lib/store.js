// Shared server-side helpers for the WhatsApp inbox.
//
// Firestore layout
// ────────────────
//   whatsappChats/{phone}                     ← one doc per member phone (91XXXXXXXXXX)
//     ├─ phone, memberId, memberName, regNo, programName, agentName
//     ├─ lastMessage, lastMessageAt, lastMessageType, lastDirection
//     ├─ lastInboundAt        ← drives the 24-hour reply window
//     └─ unreadCount
//
//   whatsappChats/{phone}/messages/{id}       ← the thread
//     ├─ direction: 'in' | 'out'
//     ├─ type: 'text' | 'image' | 'document' | 'video' | 'audio' | 'template'
//     ├─ text, mediaUrl, mediaType, fileName, caption
//     ├─ status: 'queued'|'sent'|'delivered'|'read'|'failed'
//     └─ gsMessageId, timestamp
//
// A subcollection (rather than one flat collection) keeps thread reads cheap:
// opening a chat never scans other members' messages.

import admin from '../../db/firebaseAdmin';

const db  = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;
const INC = admin.firestore.FieldValue.increment;

export const CHATS = 'whatsappChats';

// ── Phone normalisation ─────────────────────────────────────────────────────
// Everything is keyed on the 12-digit 91XXXXXXXXXX form so inbound webhooks and
// outbound sends always resolve to the same chat document.
export const normalisePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const withCc = digits.startsWith('91') ? digits : `91${digits}`;
  return withCc.length === 12 ? withCc : null;
};

// The 10-digit local form, used to match against member docs
export const localPhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// ── Member lookup ───────────────────────────────────────────────────────────
// Members store a 10-digit phone, so we look up on that form.
export const findMemberByPhone = async (phone) => {
  const local = localPhone(phone);
  if (!local) return null;
  try {
    const snap = await db.collection('members')
      .where('phone', '==', local)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (e) {
    console.error('[WA] findMemberByPhone failed:', e);
    return null;
  }
};

// ── Media mirroring ─────────────────────────────────────────────────────────
// Gupshup's inbound media URLs are short-lived, so a payment screenshot linked
// straight from Gupshup would 404 within days. We copy each file into Firebase
// Storage and keep the permanent URL instead.
export const mirrorMedia = async (sourceUrl, phone, messageId, contentType) => {
  if (!sourceUrl) return null;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);

    const arrayBuf = await res.arrayBuffer();
    const buffer   = Buffer.from(arrayBuf);
    const mime     = contentType || res.headers.get('content-type') || 'application/octet-stream';

    const extMap = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'application/pdf': 'pdf',
      'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
    };
    const ext = extMap[mime.split(';')[0].trim()] || 'bin';

    const bucket   = admin.storage().bucket();
    const filePath = `whatsapp/${phone}/${messageId}.${ext}`;
    const file     = bucket.file(filePath);

    await file.save(buffer, {
      metadata: { contentType: mime, cacheControl: 'public, max-age=31536000' },
      resumable: false,
    });

    // Must be readable by the browser without credentials
    let url;
    try {
      await file.makePublic();
      url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } catch {
      const [signed] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
      });
      url = signed;
    }

    console.log(`[WA] Mirrored media → ${url} (${buffer.length} bytes)`);
    return { url, mime, size: buffer.length };
  } catch (e) {
    console.error('[WA] mirrorMedia failed:', e);
    return null;   // fall back to the raw Gupshup URL upstream
  }
};

// ── Chat upsert ─────────────────────────────────────────────────────────────
// Creates the chat doc on first contact and enriches it with member details so
// the inbox list can show names without a join.
export const upsertChat = async (phone, patch = {}, { attachMember = false } = {}) => {
  const ref  = db.collection(CHATS).doc(phone);
  const snap = await ref.get();

  const base = { phone, updated_at: STS() };

  // Only look the member up when the chat is new (or explicitly asked) —
  // avoids a members query on every single inbound message.
  if (!snap.exists || attachMember) {
    const member = await findMemberByPhone(phone);
    if (member) {
      base.memberId           = member.id;
      base.memberName         = member.displayName || '';
      base.fatherName         = member.fatherName || '';
      base.registrationNumber = member.registrationNumber || '';
      base.programName        = member.programName || '';
      base.agentId            = member.agentId || null;
      base.photoURL           = member.photoURL || '';
      base.isMember           = true;
    } else if (!snap.exists) {
      base.isMember = false;
    }
  }

  if (!snap.exists) {
    base.createdAt   = STS();
    base.unreadCount = 0;
  }

  await ref.set({ ...base, ...patch }, { merge: true });
  return ref;
};

// ── Append a message to a thread ────────────────────────────────────────────
export const addMessage = async (phone, msg) => {
  const chatRef = db.collection(CHATS).doc(phone);
  const msgRef  = msg.id ? chatRef.collection('messages').doc(msg.id)
                         : chatRef.collection('messages').doc();

  const doc = {
    direction:   msg.direction,                 // 'in' | 'out'
    type:        msg.type || 'text',
    text:        msg.text || '',
    mediaUrl:    msg.mediaUrl || null,
    mediaType:   msg.mediaType || null,
    fileName:    msg.fileName || null,
    caption:     msg.caption || '',
    status:      msg.status || (msg.direction === 'in' ? 'received' : 'queued'),
    gsMessageId: msg.gsMessageId || null,
    templateId:  msg.templateId || null,
    sentBy:      msg.sentBy || null,
    timestamp:   msg.timestamp || STS(),
    createdAt:   STS(),
  };

  await msgRef.set(doc, { merge: true });
  return msgRef;
};

// ── Record an inbound message (webhook) ─────────────────────────────────────
export const recordInbound = async (phone, msg) => {
  const preview =
    msg.type === 'text'     ? (msg.text || '')
  : msg.type === 'image'    ? '📷 Photo'
  : msg.type === 'document' ? `📄 ${msg.fileName || 'Document'}`
  : msg.type === 'video'    ? '🎥 Video'
  : msg.type === 'audio'    ? '🎵 Audio'
  : msg.type === 'location' ? '📍 Location'
  :                           'Message';

  await upsertChat(phone, {
    lastMessage:     preview,
    lastMessageAt:   STS(),
    lastMessageType: msg.type,
    lastDirection:   'in',
    lastInboundAt:   STS(),        // opens/refreshes the 24-hour reply window
    unreadCount:     INC(1),
    senderName:      msg.senderName || null,
  });

  return addMessage(phone, { ...msg, direction: 'in', status: 'received' });
};

// ── Record an outbound message (reply or template) ──────────────────────────
export const recordOutbound = async (phone, msg) => {
  const preview =
    msg.type === 'template' ? (msg.text || 'Template message')
  : msg.type === 'document' ? `📄 ${msg.fileName || 'Document'}`
  : msg.type === 'image'    ? '📷 Photo'
  :                           (msg.text || '');

  await upsertChat(phone, {
    lastMessage:     preview,
    lastMessageAt:   STS(),
    lastMessageType: msg.type || 'text',
    lastDirection:   'out',
  });

  return addMessage(phone, { ...msg, direction: 'out' });
};

// ── Update delivery status from a message-event webhook ─────────────────────
// Gupshup reports status against its own message id, so we find the message by
// gsMessageId within that chat's thread.
export const updateMessageStatus = async (phone, gsMessageId, status, meta = {}) => {
  if (!phone || !gsMessageId) return false;
  try {
    const chatRef = db.collection(CHATS).doc(phone);
    const snap = await chatRef.collection('messages')
      .where('gsMessageId', '==', gsMessageId)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`[WA] No message found for gsMessageId=${gsMessageId} in ${phone}`);
      return false;
    }

    // Never regress status: read > delivered > sent > queued
    const rank = { queued: 0, enqueued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
    const current = snap.docs[0].data().status || 'queued';
    if ((rank[status] ?? 0) < (rank[current] ?? 0) && status !== 'failed') return false;

    await snap.docs[0].ref.update({
      status,
      ...(meta.reason ? { failReason: meta.reason } : {}),
      [`statusAt_${status}`]: STS(),
      updated_at: STS(),
    });
    return true;
  } catch (e) {
    console.error('[WA] updateMessageStatus failed:', e);
    return false;
  }
};

// ── 24-hour session window ──────────────────────────────────────────────────
// WhatsApp only permits free-form replies within 24h of the member's last
// inbound message. Outside that window only approved templates may be sent.
export const isSessionOpen = (lastInboundAt) => {
  if (!lastInboundAt) return false;
  const ts = lastInboundAt?.toDate ? lastInboundAt.toDate().getTime()
           : new Date(lastInboundAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < 24 * 60 * 60 * 1000;
};

export { db };
