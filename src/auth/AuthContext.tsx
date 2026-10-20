import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import type { Profile } from '../lib/types.ts';
import {
  AUTH_MESSAGES,
  resetErrorMessage,
  signInErrorMessage,
  signUpErrorMessage,
} from '../lib/errors.ts';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | undefined>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error?: string; message?: string }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error?: string; message?: string }>;
  updatePassword: (password: string) => Promise<string | undefined>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  // The role is read from OUR table (protected by RLS + triggers), never from JWT/user metadata.
  const { data } = await supabase
    .from('profiles')
    .select('id,email,full_name,phone,role,is_suspended')
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const apply = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      const p = s ? await fetchProfile(s.user.id) : null;
      if (!active) return;
      if (p?.is_suspended) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
      } else {
        setProfile(p);
      }
      setLoading(false);
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // defer to avoid calling supabase inside the auth callback synchronously
      setTimeout(() => void apply(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return signInErrorMessage(error);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    // NOTE: no role is sent. The database trigger always assigns 'complainant'.
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/sign-in`,
      },
    });
    const safe = signUpErrorMessage(error);
    if (safe) return { error: safe };
    return { message: AUTH_MESSAGES.signUp };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    const safe = resetErrorMessage(error);
    if (safe) return { error: safe };
    return { message: AUTH_MESSAGES.reset };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? AUTH_MESSAGES.generic : undefined;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await fetchProfile(session.user.id));
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
