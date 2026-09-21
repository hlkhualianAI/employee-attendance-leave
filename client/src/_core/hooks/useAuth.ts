import { firebaseAuth } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: Boolean(firebaseUser),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();

  useEffect(() => onAuthStateChanged(firebaseAuth, user => {
    setFirebaseUser(user);
    setAuthLoading(false);
    if (!user) utils.auth.me.setData(undefined, null);
  }), [utils]);

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
    utils.auth.me.setData(undefined, null);
  }, [utils]);

  return {
    user: meQuery.data ?? null,
    loading: authLoading || (Boolean(firebaseUser) && meQuery.isLoading),
    error: meQuery.error ?? null,
    isAuthenticated: Boolean(firebaseUser && meQuery.data),
    refresh: () => meQuery.refetch(),
    logout,
  };
}
