// lib/firebase-helpers.js - UPDATED WITH AGENT FILTER

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
===================================================== */
export const buildMembersQuery = (filters = {}) => {
  const {
    search = "",
    programId = null,
    agentId = null, // NEW: Agent filter
    status = "all",
    paymentStatus = "all",
    fromDate = null,
    toDate = null,
    pageSize = 10,
    lastDoc = null,
    sortField = "createdAt",
    sortOrder = "desc"
  } = filters;

  const membersRef = collection(db, "members");
    const conditions = [where("delete_flag", "==", false),where("status", "==", 'active')];


  /* =====================
     PROGRAM FILTER
  ===================== */
  if (programId && programId !== "all") {
    conditions.push(
      where("programIds", "array-contains", programId)
    );
  }

  /* =====================
     AGENT FILTER - NEW
  ===================== */
  if (agentId && agentId !== "all") {
    // Direct agentId filter
    conditions.push(where("agentId", "==", agentId));
  }

  /* =====================
     STATUS FILTER
  ===================== */
  if (status === "active") {
    conditions.push(where("active_flag", "==", true));
  } else if (status === "inactive") {
    conditions.push(where("active_flag", "==", false));
  }

  /* =====================
     PAYMENT STATUS FILTER
  ===================== */
  if (paymentStatus === "paid") {
    conditions.push(where("paymentPercentage", "==", 100));
  } else if (paymentStatus === "pending") {
    conditions.push(where("paymentPercentage", "==", 0));
  }
  // For 'partial', we'll filter client-side

  /* =====================
     DATE RANGE FILTER
  ===================== */
  if (fromDate) {
    const fromTimestamp = Timestamp.fromDate(new Date(fromDate));
    conditions.push(where("createdAt", ">=", fromTimestamp));
  }
  
  if (toDate) {
    const toTimestamp = Timestamp.fromDate(new Date(toDate));
    conditions.push(where("createdAt", "<=", toTimestamp));
  }

  /* =====================
     SEARCH - Using search_keywords array
  ===================== */
  if (search && search.trim()) {
    const rawSearch = search.trim().toLowerCase();
    const normalizedSearch = rawSearch.replace(/[^a-z0-9]/g, "");
    conditions.push(
      where("search_keywords", "array-contains", normalizedSearch)
    );
  }

  /* =====================
     SORTING
  ===================== */
  let orderByClause;
  switch (sortField) {
    case "registrationNumber":
      orderByClause = orderBy("search_registrationNumber", sortOrder);
      break;

    case "payment":
      orderByClause = orderBy("paymentPercentage", sortOrder);
      break;

    case "dateJoin":
      orderByClause = orderBy("createdAt", sortOrder);
      break;

    default:
      orderByClause = orderBy(sortField, sortOrder);
  }

  /* =====================
     QUERY BUILD
  ===================== */
  const queryConstraints = [...conditions, orderByClause, limit(pageSize)];
  
  if (lastDoc) {
    queryConstraints.push(startAfter(lastDoc));
  }

  const q = query(membersRef, ...queryConstraints);

  return q;
};

/* =====================================================
   TOTAL MEMBERS COUNT (FOR PAGINATION) - UPDATED WITH AGENT FILTER
===================================================== */
export const getTotalMembersCount = async (filters = {}) => {
  const {
    search = "",
    programId = null,
    agentId = null, // NEW: Agent filter
    status = "all",
    paymentStatus = "all",
    fromDate = null,
    toDate = null
  } = filters;

  const membersRef = collection(db, "members");
    const conditions = [where("delete_flag", "==", false),where("status", "==", 'active')];


  // Apply same filters as query (without pagination)
  if (programId && programId !== "all") {
    conditions.push(
      where("programIds", "array-contains", programId)
    );
  }

  // NEW: Agent filter
  if (agentId && agentId !== "all") {
    conditions.push(where("agentId", "==", agentId));
  }

  if (status === "active") {
    conditions.push(where("active_flag", "==", true));
  } else if (status === "inactive") {
    conditions.push(where("active_flag", "==", false));
  }

  if (paymentStatus === "paid") {
    conditions.push(where("paymentPercentage", "==", 100));
  } else if (paymentStatus === "pending") {
    conditions.push(where("paymentPercentage", "==", 0));
  }

  if (fromDate) {
    const fromTimestamp = Timestamp.fromDate(new Date(fromDate));
    conditions.push(where("createdAt", ">=", fromTimestamp));
  }
  
  if (toDate) {
    const toTimestamp = Timestamp.fromDate(new Date(toDate));
    conditions.push(where("createdAt", "<=", toTimestamp));
  }

  // Search by keywords
  if (search && search.trim()) {
    const rawSearch = search.trim().toLowerCase();
    const normalizedSearch = rawSearch.replace(/[^a-z0-9]/g, "");
    conditions.push(
      where("search_keywords", "array-contains", normalizedSearch)
    );
  }

  const q = query(membersRef, ...conditions);
  
  try {
    const snapshot = await getCountFromServer(q);
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
    const q = buildMembersQuery(filters);
    const querySnapshot = await getDocs(q);

    let members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Client-side filter for partial payment
    if (filters.paymentStatus === "partial") {
      members = members.filter(m => m.paymentPercentage > 0 && m.paymentPercentage < 100);
    }

    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

    return {
      members,
      lastDoc: lastVisible,
      hasNextPage: querySnapshot.docs.length === filters.pageSize
    };
  } catch (error) {
    console.error("❌ Error fetching members:", error);
    throw error;
  }
};

/* =====================================================
   FETCH ALL MEMBERS (FOR SEARCH - WITHOUT PAGINATION)
===================================================== */
export const fetchAllMembersForSearch = async (searchTerm, agentId = null) => {
  if (!searchTerm || !searchTerm.trim()) {
    return [];
  }

  try {
    const membersRef = collection(db, "members");
    const conditions = [where("delete_flag", "==", false),where("status", "==", 'active')];
    
    // NEW: Agent filter for search
    if (agentId && agentId !== "all") {
      conditions.push(where("agentId", "==", agentId));
    }
    
    const term = searchTerm.trim().toLowerCase();
    
    // Search by keywords
    if (searchTerm && searchTerm.trim()) {
      const rawSearch = searchTerm.trim().toLowerCase();
      const normalizedSearch = rawSearch.replace(/[^a-z0-9]/g, "");
      conditions.push(
        where("search_keywords", "array-contains", normalizedSearch)
      );
    }

    const q = query(
      membersRef,
      ...conditions,
      orderBy("createdAt", "desc"),
      limit(100) // Limit to 100 for performance
    );

    const querySnapshot = await getDocs(q);

    const members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Client-side filter for additional keywords
    const keywords = term.split(" ").filter(w => w.length >= 2);
    if (keywords.length > 1) {
      return members.filter(member => {
        const searchableText = [
          member.displayName,
          member.registrationNumber,
          member.phone,
          member.phoneAlt,
          member.aadhaarNo,
          member.village,
          member.city,
          member.fatherName,
          member.surname
        ].join(" ").toLowerCase();

        return keywords.every(keyword => searchableText.includes(keyword));
      });
    }

    return members;
  } catch (error) {
    console.error("❌ Error searching members:", error);
    return [];
  }
};


export const fetchMembersByAgent = async (agentId) => {
  if (!agentId || agentId === "all") {
    return [];
  }

  try {
    const membersRef = collection(db, "members");

    const q = query(
      membersRef,
      where("delete_flag", "==", false),
      where("status", "==", "active"),
      where("agentId", "==", agentId),
      orderBy("createdAt", "desc")
        );

    const querySnapshot = await getDocs(q);

    const members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
      updated_at: doc.data().updated_at?.toDate?.() || null,
    }));

    return members;

  } catch (error) {
    console.error("❌ Error fetching agent members:", error);
    return [];
  }
};