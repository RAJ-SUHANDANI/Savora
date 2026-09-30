"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useContext, useMemo } from "react";

/**
 * Auth context.
 *
 * Wraps Auth.js's `SessionProvider` and adds the two derived values the UI
 * needs constantly: whether the visitor is signed in, and whether they are
 * staff. Components read these instead of threading `session` through props.
 */
type AuthContextValue = {
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Present while the session is being resolved, to avoid a signed-out flash. */
  isLoading: boolean;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: "CUSTOMER" | "ADMIN";
  } | null;
};

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,
  user: null,
});

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;
    return {
      isAuthenticated: Boolean(session?.user),
      isAdmin: user?.role === "ADMIN",
      isLoading: status === "loading",
      user: user
        ? { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role }
        : null,
    };
  }, [session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthStateProvider>{children}</AuthStateProvider>
    </SessionProvider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Stable avatar initials, used by the account menu. */
export function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}
