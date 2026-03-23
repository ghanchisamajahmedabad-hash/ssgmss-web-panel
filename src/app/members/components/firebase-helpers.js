// lib/firebase-helpers.js

import {
  collection,
  query,
  getDocs,
  orderBy,
  where,
  limit,
  startAfter,
  getCountFromServer,
  Timestamp
} from "firebase/firestore";

import { db } from "../../../../lib/firbase-client";

/* =====================================================
   BUILD MEMBERS QUERY (SEARCH + FILTER + PAGINATION)
   Program is now a flat field (programId) on member doc
===================================================== */
export const buildMembersQuery = (filters = {}) => {
  const {
    search        = "",
    programId     = null,
    agentId       = null,
    status        = "all",
    paymentStatus = "all",
    fromDate      = null,
    toDate        = null,
    pageSize      = 10,
    lastDoc       = null,
    sortField     = "createdAt",
    sortOrder     = "desc"
  } = filters;

  const membersRef = collection(db, "members");
  const conditions = [
    where("delete_flag", "==", false),
    where("status",      "==", "active")
  ];

  // ── Program filter (flat field, not array-contains) ───────────────────────
  if (programId && programId !== "all") {
    conditions.push(where("programId", "==", programId));
  }

  // ── Agent filter ──────────────────────────────────────────────────────────
  if (agentId && agentId !== "all") {
    conditions.push(where("agentId", "==", agentId));
  }

  // ── Status filter ─────────────────────────────────────────────────────────
  if (status === "active") {
    conditions.push(where("active_flag", "==", true));
  } else if (status === "inactive") {
    conditions.push(where("active_flag", "==", false));
  }

  // ── Payment status filter ─────────────────────────────────────────────────
  if (paymentStatus === "paid") {
    conditions.push(where("paymentPercentage", "==", 100));
  } else if (paymentStatus === "pending") {
    conditions.push(where("paymentPercentage", "==", 0));
  }
  // "partial" handled client-side

  // ── Date range ────────────────────────────────────────────────────────────
  if (fromDate) conditions.push(where("createdAt", ">=", Timestamp.fromDate(new Date(fromDate))));
  if (toDate)   conditions.push(where("createdAt", "<=", Timestamp.fromDate(new Date(toDate))));

  // ── Search ────────────────────────────────────────────────────────────────
  if (search && search.trim()) {
    const normalized = search.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    conditions.push(where("search_keywords", "array-contains", normalized));
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  let orderByClause;
  switch (sortField) {
    case "registrationNumber":
      orderByClause = orderBy("search_registrationNumber", sortOrder); break;
    case "payment":
      orderByClause = orderBy("paymentPercentage", sortOrder); break;
    case "dateJoin":
      orderByClause = orderBy("createdAt", sortOrder); break;
    default:
      orderByClause = orderBy(sortField, sortOrder);
  }

  const queryConstraints = [...conditions, orderByClause, limit(pageSize)];
  if (lastDoc) queryConstraints.push(startAfter(lastDoc));

  return query(membersRef, ...queryConstraints);
};

/* =====================================================
   TOTAL COUNT (for pagination)
===================================================== */
export const getTotalMembersCount = async (filters = {}) => {
  const {
    search        = "",
    programId     = null,
    agentId       = null,
    status        = "all",
    paymentStatus = "all",
    fromDate      = null,
    toDate        = null
  } = filters;

  const membersRef = collection(db, "members");
  const conditions = [
    where("delete_flag", "==", false),
    where("status",      "==", "active")
  ];

  if (programId && programId !== "all")
    conditions.push(where("programId", "==", programId));   // ← flat field

  if (agentId && agentId !== "all")
    conditions.push(where("agentId", "==", agentId));

  if (status === "active")   conditions.push(where("active_flag", "==", true));
  if (status === "inactive") conditions.push(where("active_flag", "==", false));

  if (paymentStatus === "paid")    conditions.push(where("paymentPercentage", "==", 100));
  if (paymentStatus === "pending") conditions.push(where("paymentPercentage", "==", 0));

  if (fromDate) conditions.push(where("createdAt", ">=", Timestamp.fromDate(new Date(fromDate))));
  if (toDate)   conditions.push(where("createdAt", "<=", Timestamp.fromDate(new Date(toDate))));

  if (search && search.trim()) {
    const normalized = search.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    conditions.push(where("search_keywords", "array-contains", normalized));
  }

  try {
    const snapshot = await getCountFromServer(query(membersRef, ...conditions));
    return snapshot.data().count;
  } catch (error) {
    console.error("❌ Error getting count:", error);
    return 0;
  }
};

/* =====================================================
   FETCH MEMBERS (PAGINATED)
===================================================== */
export const fetchMembersPaginated = async (filters = {}) => {
  try {
    const q             = buildMembersQuery(filters);
    const querySnapshot = await getDocs(q);

    let members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:  doc.data().createdAt?.toDate?.()  || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Client-side filter for partial
    if (filters.paymentStatus === "partial") {
      members = members.filter(m => m.paymentPercentage > 0 && m.paymentPercentage < 100);
    }

    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

    return {
      members,
      lastDoc:     lastVisible,
      hasNextPage: querySnapshot.docs.length === filters.pageSize
    };
  } catch (error) {
    console.error("❌ Error fetching members:", error);
    throw error;
  }
};

/* =====================================================
   SEARCH (without pagination)
===================================================== */
export const fetchAllMembersForSearch = async (searchTerm, agentId = null) => {
  if (!searchTerm || !searchTerm.trim()) return [];

  try {
    const membersRef = collection(db, "members");
    const conditions = [
      where("delete_flag", "==", false),
      where("status",      "==", "active")
    ];

    if (agentId && agentId !== "all")
      conditions.push(where("agentId", "==", agentId));

    const normalized = searchTerm.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    conditions.push(where("search_keywords", "array-contains", normalized));

    const q             = query(membersRef, ...conditions, orderBy("createdAt", "desc"), limit(100));
    const querySnapshot = await getDocs(q);

    const members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:  doc.data().createdAt?.toDate?.()  || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Multi-word client-side filter
    const keywords = searchTerm.trim().toLowerCase().split(" ").filter(w => w.length >= 2);
    if (keywords.length > 1) {
      return members.filter(member => {
        const text = [
          member.displayName, member.registrationNumber, member.phone,
          member.phoneAlt, member.aadhaarNo, member.village, member.city,
          member.fatherName, member.surname, member.programName  // ← programName now searchable
        ].join(" ").toLowerCase();
        return keywords.every(k => text.includes(k));
      });
    }

    return members;
  } catch (error) {
    console.error("❌ Error searching members:", error);
    return [];
  }
};

/* =====================================================
   FETCH BY AGENT
===================================================== */
export const fetchMembersByAgent = async (agentId) => {
  if (!agentId || agentId === "all") return [];

  try {
    const q = query(
      collection(db, "members"),
      where("delete_flag", "==", false),
      where("status",      "==", "active"),
      where("agentId",     "==", agentId),
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:  doc.data().createdAt?.toDate?.()  || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));
  } catch (error) {
    console.error("❌ Error fetching agent members:", error);
    return [];
  }
};