"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { isStaffRoleForAdminApp } from "@/lib/admin-app-access";
import { getPermissionsForRole, hasPermission, normalizeAppRole, type AppPermission, type AppRole } from "@/lib/permissions";
import type { User } from "@supabase/supabase-js";

type AuthContextType = {
  user: User | null;
  /** Admin эсвэл борлуулалтын эрхтэй (энэ вэб апп ашиглах эрх) */
  isAdmin: boolean | null;
  role: AppRole | null;
  permissions: AppPermission[];
  can: (permission: AppPermission) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: null,
  role: null,
  permissions: [],
  can: () => false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createBrowserSupabaseClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;

    const resolveUser = async (u: User | null) => {
      if (cancelled) return;
      setUser(u);
      if (u) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", u.id)
          .single();
        const resolvedRole = normalizeAppRole((profile as { role?: string | null } | null)?.role);
        const resolvedPermissions = getPermissionsForRole(resolvedRole);
        const staff = isStaffRoleForAdminApp((profile as { role?: string | null } | null)?.role);
        if (!cancelled) {
          setRole(resolvedRole);
          setPermissions(resolvedPermissions);
          setIsAdmin(staff);
        }
      } else {
        setIsAdmin(false);
        setRole(null);
        setPermissions([]);
      }
      if (!cancelled) setLoading(false);
    };

    // Use getSession() instead of getUser() to avoid navigator lock conflicts.
    // getSession() reads from local storage — no network lock required.
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolveUser(session?.user ?? null);
    }).catch(() => {
      if (!cancelled) {
        setUser(null);
        setIsAdmin(false);
        setRole(null);
        setPermissions([]);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabaseRef.current.auth.signOut();
    window.location.href = "/signin";
  };

  const can = (permission: AppPermission) => hasPermission(permissions, permission);

  return (
    <AuthContext.Provider value={{ user, isAdmin, role, permissions, can, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
