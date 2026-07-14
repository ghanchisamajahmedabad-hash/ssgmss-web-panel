// app/api/migrate-member-media/route.js
//
// Migrates legacy member photos/documents from the local folder
//   src/app/api/migrationData/uploads/member/...
// into Firebase Storage, and links the URLs on the matching Firestore
// member documents.
//
// Legacy source: app_forms.json (old MySQL export). Each record has:
//   upload_img      → member photo        → member.photoURL
//   upload_father   → guardian photo      → member.guardianPhotoURL
//   aadhar_front    → aadhaar front doc   → member.documentFrontURL
//   aadhar_back     → aadhaar back doc    → member.documentBackURL
//   aadhar_varisdar → guardian aadhaar    → member.guardianDocumentURL
//
// Matching: legacy aadhar_number → member.aadhaarNo (primary),
//           fallback mobile_number → member.phone (+ name check).
//
// Idempotent & resumable:
//   • Progress is logged per legacy record in 'mediaMigrationLog/{legacyId}'
//     — records with status 'done' are never re-processed (unless overwrite).
//   • Existing member URLs are NOT overwritten unless overwrite=true.
//   • Runs in small batches (default 15) — call repeatedly with the returned
//     nextStartAfterId until hasMore=false. The admin UI page does this loop.
//
// GET  → migration status summary
// POST → { limit=15, startAfterId=0, dryRun=false, overwrite=false }

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db     = admin.firestore();
const bucket = admin.storage().bucket();
const STS    = admin.firestore.FieldValue.serverTimestamp;

const MIGRATION_BASE = path.join(process.cwd(), "src", "app", "api", "migrationData");
const UPLOADS_BASE   = path.join(MIGRATION_BASE, "uploads", "member");

// legacy field → { local folder, member doc field }
const FIELD_MAP = {
  upload_img:      { folder: "member_profile",   memberField: "photoURL" },
  upload_father:   { folder: "varisdar_profile", memberField: "guardianPhotoURL" },
  aadhar_front:    { folder: "aadhar_front",     memberField: "documentFrontURL" },
  aadhar_back:     { folder: "aadhar_back",      memberField: "documentBackURL" },
  aadhar_varisdar: { folder: "aadhar_varisdar",  memberField: "guardianDocumentURL" },
};

const CONTENT_TYPES = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", pdf: "application/pdf",
};
const contentTypeFor = (fileName) => {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
};

// ─── Load + cache legacy records (sorted by numeric id) ───────────────────────
let _cache = null;
const loadLegacyRecords = () => {
  if (_cache) return _cache;
  const raw = JSON.parse(fs.readFileSync(path.join(MIGRATION_BASE, "app_forms.json"), "utf8"));
  const tbl = raw.find((x) => x.type === "table" && x.name === "app_forms");
  const data = (tbl?.data || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
  _cache = data;
  return data;
};

// Resolve a legacy path value to an actual local file (match by basename in
// the mapped folder — legacy prefixes vary: uploads/member/x, member_aadhar_front/x, formimg/x)
const resolveLocalFile = (rawValue, folder) => {
  if (!rawValue) return null;
  const baseName = rawValue.replace(/\\/g, "/").split("/").pop();
  if (!baseName) return null;
  const full = path.join(UPLOADS_BASE, folder, baseName);
  return fs.existsSync(full) ? { full, baseName } : null;
};

// ─── Find the Firestore member for a legacy record ────────────────────────────
const findMember = async (rec) => {
  const aadhaar = (rec.aadhar_number || "").trim();
  if (aadhaar) {
    const snap = await db.collection("members").where("aadhaarNo", "==", aadhaar).limit(5).get();
    if (!snap.empty) {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return docs.find((m) => m.delete_flag !== true) || docs[0];
    }
  }
  const phone = (rec.mobile_number || "").trim();
  if (phone) {
    const snap = await db.collection("members").where("phone", "==", phone).limit(5).get();
    if (!snap.empty) {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const name = (rec.first_name || "").trim().toLowerCase();
      const match = docs.find(
        (m) => m.delete_flag !== true &&
          (!name || (m.displayName || "").toLowerCase().startsWith(name))
      );
      return match || null;
    }
  }
  return null;
};

// ─── Upload one local file to Storage, return long-lived signed URL ───────────
const uploadFileToStorage = async (localPath, baseName, memberId, folder) => {
  const dest    = `members/migrated/${memberId}/${folder}_${baseName}`;
  const fileRef = bucket.file(dest);
  await fileRef.save(fs.readFileSync(localPath), {
    metadata: { contentType: contentTypeFor(baseName) },
    resumable: false,
  });
  const [url] = await fileRef.getSignedUrl({ action: "read", expires: "03-01-2500" });
  return url;
};

// ─── Reusable: migrate all media of one legacy form onto a member ─────────────
// Used inline by the member DATA migration (so photos/documents migrate
// together with the member) and by the standalone media migration.
// Returns { urls: {memberField: url}, uploaded: [fields], missing: [legacyFields] }
export const migrateMediaForLegacyForm = async (form, memberId, { dryRun = false } = {}) => {
  const urls = {};
  const uploaded = [];
  const missing = [];

  // All 5 files upload in PARALLEL — much faster than one-by-one
  await Promise.all(Object.entries(FIELD_MAP).map(async ([legacyField, cfg]) => {
    const rawValue = form[legacyField];
    if (!rawValue) return;

    const localFile = resolveLocalFile(rawValue, cfg.folder);
    if (!localFile) { missing.push(legacyField); return; }

    if (!dryRun) {
      const url = await uploadFileToStorage(localFile.full, localFile.baseName, memberId, cfg.folder);
      urls[cfg.memberField] = url;
    }
    uploaded.push(cfg.memberField);
  }));

  return { urls, uploaded, missing };
};

// ─── GET — status summary ──────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Only superadmin can run migration" }, { status: 403 });

    const records = loadLegacyRecords();

    const countFor = async (status) => {
      const s = await db.collection("mediaMigrationLog").where("status", "==", status).count().get();
      return s.data().count;
    };
    const [done, noMatch, errorCount] = await Promise.all([
      countFor("done"), countFor("no-match"), countFor("error"),
    ]);

    const stateSnap = await db.collection("migrationState").doc("member-media").get();
    const resumeFrom = stateSnap.exists ? Number(stateSnap.data().lastId || 0) : 0;

    return NextResponse.json({
      success: true,
      status: {
        totalLegacyRecords: records.length,
        done,
        noMatch,
        errors: errorCount,
        remaining: Math.max(0, records.length - done - noMatch - errorCount),
        resumeFrom,
      },
    });
  } catch (e) {
    console.error("GET migrate-member-media error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── POST — process next batch ─────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Only superadmin can run migration" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit        = Math.min(Math.max(Number(body.limit) || 15, 1), 50);
    const startAfterId = Number(body.startAfterId) || 0;
    const dryRun       = body.dryRun === true;
    const overwrite    = body.overwrite === true;

    const records = loadLegacyRecords();
    const batch   = records.filter((r) => Number(r.id) > startAfterId).slice(0, limit);

    if (!batch.length) {
      return NextResponse.json({
        success: true, message: "All records processed", hasMore: false,
        summary: { processed: 0 }, nextStartAfterId: startAfterId,
      });
    }

    const results = [];
    let doneCount = 0, skipCount = 0, noMatchCount = 0, fileCount = 0, missingCount = 0;

    for (const rec of batch) {
      const legacyId = String(rec.id);
      const logRef   = db.collection("mediaMigrationLog").doc(legacyId);

      try {
        // Idempotency — skip records already migrated
        if (!overwrite) {
          const logSnap = await logRef.get();
          if (logSnap.exists && logSnap.data().status === "done") {
            skipCount++;
            results.push({ legacyId, name: rec.first_name, status: "already-done" });
            continue;
          }
        }

        const member = await findMember(rec);
        if (!member) {
          noMatchCount++;
          if (!dryRun) {
            await logRef.set({
              legacyId, status: "no-match",
              legacyName: rec.first_name || "", legacyAadhaar: rec.aadhar_number || "",
              legacyPhone: rec.mobile_number || "", updatedAt: STS(),
            }, { merge: true });
          }
          results.push({ legacyId, name: rec.first_name, status: "no-match" });
          continue;
        }

        const memberUpdate = {};
        const uploaded = [];
        const missing  = [];
        const skippedFields = [];

        for (const [legacyField, cfg] of Object.entries(FIELD_MAP)) {
          const rawValue = rec[legacyField];
          if (!rawValue) continue;

          // Don't overwrite media the member already has (unless overwrite)
          if (!overwrite && member[cfg.memberField]) {
            skippedFields.push(cfg.memberField);
            continue;
          }

          const localFile = resolveLocalFile(rawValue, cfg.folder);
          if (!localFile) {
            missing.push(legacyField);
            missingCount++;
            continue;
          }

          if (!dryRun) {
            const url = await uploadFileToStorage(localFile.full, localFile.baseName, member.id, cfg.folder);
            memberUpdate[cfg.memberField] = url;
          }
          uploaded.push(cfg.memberField);
          fileCount++;
        }

        if (!dryRun && Object.keys(memberUpdate).length) {
          const newPhoto = memberUpdate.photoURL         || member.photoURL;
          const newFront = memberUpdate.documentFrontURL || member.documentFrontURL;
          memberUpdate.hasDocuments   = !!(newPhoto && newFront);
          memberUpdate.migratedMedia  = true;
          memberUpdate.migratedMediaAt = STS();
          memberUpdate.updated_at     = STS();
          await db.collection("members").doc(member.id).update(memberUpdate);
        }

        if (!dryRun) {
          await logRef.set({
            legacyId, status: "done", memberId: member.id,
            memberName: member.displayName || "",
            uploadedFields: uploaded, missingFiles: missing, skippedFields,
            updatedAt: STS(),
          }, { merge: true });
        }

        console.log(`  📎 [MEDIA-MIGRATION] #${legacyId} ${rec.first_name} → member ${member.id}: ${uploaded.length} uploaded${missing.length ? `, ${missing.length} MISSING (${missing.join(", ")})` : ""}${skippedFields.length ? `, ${skippedFields.length} kept existing` : ""}`);
        doneCount++;
        results.push({
          legacyId, name: rec.first_name, status: dryRun ? "dry-run-ok" : "done",
          memberId: member.id, uploaded, missing, skippedFields,
        });
      } catch (recErr) {
        console.error(`Migration error for legacy ${legacyId}:`, recErr);
        if (!dryRun) {
          await logRef.set({ legacyId, status: "error", error: recErr.message, updatedAt: STS() }, { merge: true }).catch(() => {});
        }
        results.push({ legacyId, name: rec.first_name, status: "error", error: recErr.message });
      }
    }

    const lastId  = Number(batch[batch.length - 1].id);
    const hasMore = records.some((r) => Number(r.id) > lastId);

    console.log(`🏁 [MEDIA-MIGRATION] Batch done — members: ${doneCount}, files uploaded: ${fileCount}, files missing: ${missingCount}, no-match: ${noMatchCount}, already: ${skipCount}, lastId: ${lastId}, hasMore: ${hasMore}\n`);

    if (!dryRun) {
      await db.collection("migrationState").doc("member-media")
        .set({ lastId, updatedAt: STS() }, { merge: true }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        processed: batch.length,
        done: doneCount,
        alreadyDone: skipCount,
        noMatch: noMatchCount,
        filesUploaded: fileCount,
        filesMissing: missingCount,
      },
      nextStartAfterId: lastId,
      hasMore,
      results,
    });
  } catch (e) {
    console.error("POST migrate-member-media error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── DELETE — REVERT the media migration ──────────────────────────────────────
// For every 'done' media log:
//   1. clears ONLY the member URL fields this migration set (uploadedFields),
//      and only when the URL points at the migrated storage folder — photos
//      uploaded manually are never touched
//   2. deletes the migrated files from Storage (members/migrated/{memberId}/)
//   3. deletes the log
// When no 'done' logs remain, remaining status logs (no-match/error) are
// cleared so a fresh media run rescans everything.
export async function DELETE(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Only superadmin can revert migration" }, { status: 403 });

    const body  = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 15, 1), 50);

    const logsSnap = await db.collection("mediaMigrationLog")
      .where("status", "==", "done").limit(limit).get();

    if (logsSnap.empty) {
      const restSnap = await db.collection("mediaMigrationLog").limit(300).get();
      if (restSnap.empty) {
        await db.collection("migrationState").doc("member-media").delete().catch(() => {});
        return NextResponse.json({
          success: true, message: "Revert complete — nothing left to revert",
          summary: { reverted: 0, logsCleared: 0 }, hasMore: false,
        });
      }
      const batch = db.batch();
      restSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({
        success: true,
        summary: { reverted: 0, logsCleared: restSnap.size },
        hasMore: true,
        results: [{ legacyId: "-", status: "logs-cleared", name: `${restSnap.size} status logs removed` }],
      });
    }

    const results = [];
    let reverted = 0;

    for (const logDoc of logsSnap.docs) {
      const log = logDoc.data();
      const memberId = log.memberId;

      try {
        if (memberId) {
          const memberRef  = db.collection("members").doc(memberId);
          const memberSnap = await memberRef.get();

          if (memberSnap.exists) {
            const m = memberSnap.data();
            const migratedMarker    = `members/migrated/${memberId}/`;
            const migratedMarkerEnc = encodeURIComponent(migratedMarker);
            const update = {};

            (log.uploadedFields || []).forEach((field) => {
              const url = m[field] || "";
              // Only clear URLs that point into the migrated storage folder
              if (url.includes(migratedMarker) || url.includes(migratedMarkerEnc)) {
                update[field] = "";
              }
            });

            if (Object.keys(update).length) {
              const photo = update.photoURL !== undefined ? "" : m.photoURL;
              const front = update.documentFrontURL !== undefined ? "" : m.documentFrontURL;
              update.hasDocuments   = !!(photo && front);
              update.migratedMedia  = admin.firestore.FieldValue.delete();
              update.migratedMediaAt = admin.firestore.FieldValue.delete();
              update.updated_at     = STS();
              await memberRef.update(update);
            }
          }

          // Delete the migrated files from Storage
          await bucket.deleteFiles({ prefix: `members/migrated/${memberId}/` }).catch(() => {});
        }

        await logDoc.ref.delete();
        reverted++;
        results.push({ legacyId: logDoc.id, name: log.memberName || "", status: "reverted", memberId });
      } catch (recErr) {
        console.error(`Media revert error for legacy ${logDoc.id}:`, recErr);
        results.push({ legacyId: logDoc.id, name: log.memberName || "", status: "error", error: recErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      summary: { reverted },
      hasMore: true,
      results,
    });
  } catch (e) {
    console.error("DELETE migrate-member-media error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
