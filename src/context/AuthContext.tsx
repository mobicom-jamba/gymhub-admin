"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { isStaffRoleForAdminApp } from "@/lib/admin-app-access";
import type { User } from "@supabase/supabase-js";

type AuthContextType = {
  user: User | null;
  /** Admin эсвэл борлуулалтын эрхтэй (энэ вэб апп ашиглах эрх) */
  isAdmin: boolean | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createBrowserSupabaseClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;

    const checkStaffAccess = async (userId: string): Promise<boolean> => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (error) {
          console.error("[AuthContext] Profile query error:", error.message);
          return false;
        }
        return isStaffRoleForAdminApp(profile?.role);
      } catch (err) {
        console.error("[AuthContext] Profile check failed:", err);
        return false;
      }
    };

    const resolveUser = async (u: User | null) => {
      if (cancelled) return;
      setUser(u);
      if (u) {
        const staff = await checkStaffAccess(u.id);
        if (!cancelled) setIsAdmin(staff);
      } else {
        setIsAdmin(false);
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

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
