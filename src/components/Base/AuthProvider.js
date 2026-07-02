"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { message } from "antd";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "../../../lib/firbase-client";
import { Provider } from "react-redux";
import store from "@/Redux/store";
import { useDispatch } from "react-redux";
import { setUser as setReduxUser, clearUser } from "@/Redux/Slice/userSlice";

const AuthContext = createContext();

const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
];

function isSuperAdmin(user) {
  return user?.role === "superadmin";
}

function hasPageAccess(user, pageKey) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const pages = user.permissions?.pages || [];
  if (pages.includes(pageKey)) return true;
  if (pageKey === '/' && pages.includes('/dashboard')) return true;
  return false;
}

function canVisit(user, pathname) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (pathname === "/") return true;
  const pages = user.permissions?.pages || [];
  if (pages.includes(pathname)) return true;
  const hasChildAccess = pages.some(
    (p) => p !== pathname && p.startsWith(pathname + "/")
  );
  return hasChildAccess;
}

const DEFAULT_PERMISSIONS = {
  pages: ['/'],
  actions: { create: false, edit: false, delete: false, view: true, download: false },
  moduleAccess: { dashboard: true },
  pagePermissions: {},
};

function AuthProviderInner({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Always set loading=true before any async work so the redirect guard
      // never sees user=null + loading=false while Firestore is still fetching.
      setLoading(true);
      try {
        if (firebaseUser) {
          let mergedUser = { tokens: firebaseUser?.stsTokenManager };

          // 1. Try users/{uid} first
          const userDocSnap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDocSnap.exists()) {
            mergedUser = { ...mergedUser, ...userDocSnap.data() };
          } else {
            // 2. Fallback: try agents/{uid} or find user by email
            const agentSnap = await getDoc(doc(db, "agents", firebaseUser.uid));
            if (agentSnap.exists()) {
              const agentData = agentSnap.data();
              mergedUser = {
                ...mergedUser,
                uid: firebaseUser.uid,
                name: agentData.name || firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                phone: agentData.phone1 || firebaseUser.phoneNumber || '',
                photoURL: agentData.photoURL || firebaseUser.photoURL || '',
                role: 'agent',
                permissions: agentData.permissions || DEFAULT_PERMISSIONS,
              };
              // Try to get permissions from users/{uid} if it was created later
              const userDocRetry = await getDoc(doc(db, "users", firebaseUser.uid));
              if (userDocRetry.exists() && userDocRetry.data().permissions) {
                mergedUser.permissions = userDocRetry.data().permissions;
                mergedUser.role = userDocRetry.data().role || 'agent';
              }
            } else {
              // 3. Last resort: use token claims for role
              let role = 'member';
              try {
                const tokenResult = await firebaseUser.getIdTokenResult();
                role = tokenResult.claims.role || 'member';
              } catch {}
              mergedUser = {
                ...mergedUser,
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                phone: firebaseUser.phoneNumber || '',
                photoURL: firebaseUser.photoURL || '',
                role,
                permissions: DEFAULT_PERMISSIONS,
              };
            }
          }

          // Ensure permissions object always exists
          if (!mergedUser.permissions) {
            mergedUser.permissions = DEFAULT_PERMISSIONS;
          }

          setUser(mergedUser);
          dispatch(setReduxUser(mergedUser));
        } else {
          setUser(null);
          dispatch(clearUser());
        }
      } catch (error) {
        console.error("AuthProvider error:", error);
        messageApi.error("Failed to load user data");
        setUser(null);
        dispatch(clearUser());
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [messageApi, dispatch]);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!user) {
      if (!isPublic) {
        messageApi.error("Please login to continue");
        router.replace("/auth/login");
      }
      return;
    }
    if (isPublic) {
      router.replace("/");
      return;
    }
    if (!canVisit(user, pathname)) {
      messageApi.error("You don't have permission to access this page");
      router.replace("/unauthorized");
    }
  }, [loading, user, pathname]);

  return (
    <AuthContext.Provider value={{ user, loading, messageApi }}>
      {contextHolder}
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }) {
  return (
    <Provider store={store}>
      <AuthProviderInner children={children} />
    </Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
