"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { message } from "antd";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "../../../lib/firbase-client";
import { Provider } from "react-redux";
import store from "@/Redux/store";

const AuthContext = createContext();

// ── Pages that never need a permission check ──────────────────────────────────
const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
];

// ── Exact same logic as SideBar — must stay in sync ──────────────────────────
function isSuperAdmin(user) {
  return user?.role === "superadmin";
}

function hasPageAccess(user, pageKey) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  // Exact match only
  const pages = user.permissions?.pages || [];
  return pages.includes(pageKey);
}

/**
 * For nested routes like /settings/security/sessions we also accept access if
 * the EXACT child path is listed — but we do NOT grant access just because a
 * parent is listed (that was the original bug).
 *
 * We DO allow the parent path itself to be "visited" as a passthrough when the
 * user has at least one child under it, because Ant Menu parent items are
 * clickable. The actual page content for that parent key should handle the
 * redirect internally, but we don't hard-block it here.
 */
function canVisit(user, pathname) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  // Allow root dashboard path always for authenticated users
  if (pathname === "/") return true;   // ← ADD THIS

  const pages = user.permissions?.pages || [];
  if (pages.includes(pathname)) return true;
  const hasChildAccess = pages.some(
    (p) => p !== pathname && p.startsWith(pathname + "/")
  );
  return hasChildAccess;
}


// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  const router   = useRouter();
  const pathname = usePathname();

  // ── Auth state ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            setUser({
              tokens: firebaseUser?.stsTokenManager,
              ...userDoc.data(),
            });
          } else {
            setUser(firebaseUser);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        messageApi.error("Failed to load user data");
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [messageApi]);

  // ── Route guard — runs on every pathname change ─────────────────────────────
  useEffect(() => {
    if (loading) return; // wait until auth state is resolved

    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

    // Not logged in → send to login
    if (!user) {
      if (!isPublic) {
        messageApi.error("Please login to continue");
        router.replace("/auth/login");
      }
      return;
    }

    // Logged in but on a public/auth page → send to dashboard
    if (isPublic) {
      router.replace("/");
      return;
    }

    // Logged in — check page permission
    if (!canVisit(user, pathname)) {
      messageApi.error("You don't have permission to access this page");
      router.replace("/unauthorized");
    }
  }, [loading, user, pathname]);

  return (
    <AuthContext.Provider value={{ user, loading, messageApi }}>
      <Provider store={store}>
        {contextHolder}
        {children}
      </Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}