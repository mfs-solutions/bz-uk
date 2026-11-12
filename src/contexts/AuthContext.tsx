import { clearProfileCache } from '../lib/profileCache';
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { supabase, AUTH_STORAGE_KEY } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import logger from '../utils/logger';
import { buildAppRedirect } from '../utils/authEnv';
import { syncOneSignalExternalId } from '../lib/oneSignalSync';

export interface AuthUser {
  username: string;
  userId: string;
  email?: string;
  attributes?: Record<string, any>;
  signInDetails?: {
    loginId?: string;
    authFlowType?: string;
  };
}

interface AuthContextType {
  user: User | null;
  currentAuthUser: AuthUser | null;
  authRole: User['role'] | null;
  loading: boolean;
  signUp: (email: string, password: string, role: 'user' | 'seller', fullName: string, currency?: string, phoneNumber?: string, countryId?: string, businessTypeId?: string) => Promise<any>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; isSignedIn?: boolean; role?: User['role'] | null; error?: any }>;
  signOut: () => Promise<'user' | 'seller' | 'admin' | null>;
  resetPassword: (email: string, redirectPath?: string) => Promise<any>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<any>;
  confirmSignUp: (email: string, code: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const VALID_ROLES: Array<User['role']> = ['user', 'seller', 'admin'];

function toValidRole(value: unknown): User['role'] | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_ROLES.includes(normalized as User['role'])) {
    return normalized as User['role'];
  }
  return null;
}

function resolveRoleFromSupabaseUser(supabaseUser: SupabaseUser): User['role'] | null {
  return (
    toValidRole(supabaseUser.user_metadata?.role)
    || toValidRole((supabaseUser as any).app_metadata?.role)
    || null
  );
}

function clearStoredAuthSession(reason: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    console.warn(`[Auth] Cleared local session: ${reason}`);
  } catch {
    /* noop for non-browser envs */
  }
}

// Helper: fetch profile from Supabase `profiles` table
async function fetchProfile(supabaseUser: SupabaseUser, retries = 3): Promise<User | null> {
  for (let i = 0; i < retries; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    if (error) {
      // Don't retry on AbortError — the request was cancelled, retrying won't help
      if (error.message?.includes('abort')) {
        console.info('[Auth] fetchProfile aborted, using metadata fallback');
        break;
      }
      logger.error(new Error(`fetchProfile attempt ${i + 1}: ${error.message}`), { code: error.code });
      // Profile may not exist yet (trigger hasn't fired), wait and retry
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      // All retries failed — return fallback from user_metadata
      return {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        role: resolveRoleFromSupabaseUser(supabaseUser) || 'user',
        full_name: supabaseUser.user_metadata?.full_name || '',
        phone: supabaseUser.user_metadata?.phone || '',
        country: String(supabaseUser.user_metadata?.country || '').trim() || undefined,
        created_at: supabaseUser.created_at || new Date().toISOString(),
      };
    }

    if (data) {
      let resolvedCountry = String((data as { country?: string | null }).country || '').trim();

      if (!resolvedCountry) {
        const profileCountryId = String((data as { country_id?: string | null }).country_id || '').trim();
        if (profileCountryId) {
          const { data: countryRow } = await supabase
            .from('countries')
            .select('country_name, short_code, country_code, iso2')
            .eq('id', profileCountryId)
            .maybeSingle();

          if (countryRow) {
            resolvedCountry = String(
              (countryRow as { country_name?: string | null }).country_name
              || (countryRow as { short_code?: string | null }).short_code
              || (countryRow as { country_code?: string | null }).country_code
              || (countryRow as { iso2?: string | null }).iso2
              || ''
            ).trim();
          }
        }
      }

      return {
        id: data.id,
        email: data.email || supabaseUser.email || '',
        role: data.role || 'user',
        full_name: data.full_name,
        phone: data.phone,
        country: resolvedCountry || undefined,
        is_verified: data.is_verified,
        approved: data.approved,
        is_banned: data.is_banned,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }
  }
  return null;
}

// Helper: convert Supabase user to AuthUser
function toAuthUser(su: SupabaseUser): AuthUser {
  return {
    username: su.id,
    userId: su.id,
    email: su.email,
    attributes: su.user_metadata,
    signInDetails: { loginId: su.email, authFlowType: 'USER_PASSWORD_AUTH' },
  };
}

/**
 * Pre-flight: remove ONLY truly corrupt tokens from localStorage.
 * 
 * IMPORTANT: Do NOT remove tokens based on expires_at — that field represents
 * the access_token expiry (typically 1 hour). The refresh_token inside the
 * same storage entry is still valid and Supabase SDK will use it to get a
 * new access_token automatically. Removing the whole entry kills the session
 * and causes logout-on-refresh.
 */
function clearStaleToken(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    // Only remove if the stored data is completely unparseable (corrupt)
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      clearStoredAuthSession('corrupt token object');
    }
    // Otherwise, leave the token alone — let Supabase SDK handle refresh
  } catch {
    // JSON parse failed — token is corrupt, remove it
    clearStoredAuthSession('unparseable token');
  }
}

/**
 * Migrate guest search history from localStorage to Supabase on login.
 * Runs once per SIGNED_IN event, then removes the localStorage key.
 */
async function migrateGuestSearchHistory(userId: string): Promise<void> {
  try {
    const raw = localStorage.getItem('bzead_search_history');
    if (!raw) return;
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return;
    const rows = items
      .filter((item: any) => String(item?.typed_input || '').trim().length > 0)
      .map((item: any) => ({
        user_id: userId,
        typed_input: String(item.typed_input).trim(),
        is_product_click: item.is_product_click ?? false,
        product_id: item.product_id ?? null,
        product_name: item.product_name ?? null,
        category_id: item.category_id ?? null,
        category_name: item.category_name ?? null,
        sub_category_id: item.sub_category_id ?? null,
        sub_category_name: item.sub_category_name ?? null,
        product_type_id: item.product_type_id ?? null,
        product_type_name: item.product_type_name ?? null,
        user_location: item.user_location ?? null,
        user_country: item.user_country ?? null,
        searched_at: item.searched_at || new Date().toISOString(),
      }));
    if (rows.length === 0) return;
    await supabase.from('user_search_history').insert(rows);
    localStorage.removeItem('bzead_search_history');
  } catch {
    // Non-critical — do not block login or throw
  }
}

const INITIAL_PROFILE_FETCH_TIMEOUT_MS = 8_000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentAuthUser, setCurrentAuthUser] = useState<AuthUser | null>(null);
  const [authRole, setAuthRole] = useState<User['role'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let initialSessionHandled = false;

    // ── Step 1: Remove expired/corrupt tokens before SDK init ──
    clearStaleToken();

    // ── Step 2: Single listener — replaces the old initSession() + onAuthStateChange pair ──
    // The SDK fires INITIAL_SESSION synchronously during subscribe, delivering
    // the existing session (or null) without a separate getSession() call.
    // This eliminates the navigator.locks contention that caused login timeouts.
    //
    // CRITICAL: This callback is awaited by _notifyAllSubscribers inside
    // signInWithPassword. Any heavy async work (like fetchProfile) blocks the
    // entire sign-in from returning, causing the Login button to appear stuck
    // for up to 45+ seconds. To prevent this we:
    //   1. Set user state IMMEDIATELY from session metadata (fast, synchronous)
    //   2. Defer the full profile fetch to a non-blocking background task
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // ── No session (signed out or no existing session) ──
      if (!session?.user) {
        setUser(null);
        setCurrentAuthUser(null);
        setAuthRole(null);
        void syncOneSignalExternalId(null);
        if (event === 'INITIAL_SESSION') {
          initialSessionHandled = true;
          setLoading(false);
        }
        return;
      }

      // ── Explicit sign-out — clear state ──
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setCurrentAuthUser(null);
        setAuthRole(null);
        void syncOneSignalExternalId(null);
        // Clear local cart so stale items from this user don't show on next guest/user session
        localStorage.removeItem('beauzead_cart');
        localStorage.removeItem('beauzead_wishlist');
        localStorage.removeItem('beauzead_detected_location');
        localStorage.removeItem('beauzead_detected_country');
        localStorage.removeItem('beauzead_checkout_shipping');
        localStorage.removeItem('beauzead_checkout_selected_cart_ids');
        localStorage.removeItem('beauzead_currency');
        return;
      }

      // ── Valid session: INITIAL_SESSION | SIGNED_IN | TOKEN_REFRESHED ──
      // Step A: Immediately populate from session metadata (non-blocking)
      const resolvedRole = resolveRoleFromSupabaseUser(session.user);
      const metaRole = resolvedRole || 'user';
      const metadataUser: User = {
        id: session.user.id,
        email: session.user.email || '',
        role: metaRole,
        full_name: session.user.user_metadata?.full_name || '',
        phone: session.user.user_metadata?.phone || '',
        country: String(session.user.user_metadata?.country || '').trim() || undefined,
        created_at: session.user.created_at || new Date().toISOString(),
      };
      setCurrentAuthUser(toAuthUser(session.user));
      void syncOneSignalExternalId(session.user.id);

      if (event === 'INITIAL_SESSION') {
        // PAGE REFRESH: Wait for fetchProfile before setting loading = false.
        // The profiles.role is the source of truth (e.g. admin role is set in
        // the DB, not in user_metadata). Setting loading = false too early
        // causes RouteGuard to see the wrong role and redirect to /login.
        initialSessionHandled = true;
        setUser(metadataUser);
        setAuthRole(metaRole);

        let timedOut = false;
        const timeoutId = window.setTimeout(() => {
          timedOut = true;
          if (mounted) {
            console.warn(`[Auth] fetchProfile timed out after ${INITIAL_PROFILE_FETCH_TIMEOUT_MS} ms, continuing with metadata fallback`);
            setLoading(false);
          }
        }, INITIAL_PROFILE_FETCH_TIMEOUT_MS);

        fetchProfile(session.user).then((profile) => {
          if (mounted && profile) {
            if (profile.is_banned) {
              supabase.auth.signOut().catch(() => {});
              if (mounted) { setUser(null); setCurrentAuthUser(null); setAuthRole(null); }
              return;
            }
            setUser(profile);
            setAuthRole(profile.role);
            // Sync user_metadata if it drifted from the DB role.
            // This ensures future JWTs (and RLS JWT checks) use the
            // correct role without another profile fetch.
            if (profile.role !== metaRole) {
              supabase.auth.updateUser({
                data: { role: profile.role },
              }).catch(() => { /* best-effort, non-blocking */ });
            }
          }
        }).catch((err) => {
          console.warn('[Auth] fetchProfile failed on init:', err);
        }).finally(() => {
          window.clearTimeout(timeoutId);
          if (mounted && !timedOut) setLoading(false);
        });
      } else {
        // SIGNED_IN / TOKEN_REFRESHED: set state immediately so the
        // signInWithPassword call returns fast, then refine in background.
        setUser(metadataUser);
        setAuthRole(metaRole);

        // Migrate guest search history to Supabase on fresh sign-in (non-blocking)
        if (event === 'SIGNED_IN') {
          migrateGuestSearchHistory(session.user.id).catch(() => {});
        }

        fetchProfile(session.user).then((profile) => {
          if (mounted && profile) {
            if (profile.is_banned) {
              supabase.auth.signOut().catch(() => {});
              if (mounted) { setUser(null); setCurrentAuthUser(null); setAuthRole(null); }
              return;
            }
            setUser(profile);
            setAuthRole(profile.role);
            if (profile.role !== metaRole) {
              supabase.auth.updateUser({
                data: { role: profile.role },
              }).catch(() => { /* best-effort */ });
            }
          }
        }).catch((err) => {
          console.warn('[Auth] Background fetchProfile failed:', err);
        });
      }
    });

    // IMPORTANT: Do not clear stored session on transient network failures.
    // Clearing here causes users to be logged out on refresh whenever auth
    // refresh is temporarily slow/unreachable.

    // Safety net: if INITIAL_SESSION never fires (should not happen, defence-in-depth)
    const safetyTimer = setTimeout(() => {
      if (mounted && !initialSessionHandled) {
        console.warn('[Auth] INITIAL_SESSION did not fire within 10 s — continuing as guest');
        setLoading(false);
      }
    }, 10_000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Push notifications: bind/unbind current device token to the active user id
    // (or clear it on sign-out).
    void syncOneSignalExternalId(currentAuthUser?.userId || null);
  }, [currentAuthUser?.userId]);

  /**
   * Sign up with email + password.
   * Supabase sends a 6-digit OTP email automatically (configured in Supabase dashboard).
   * The role & full_name are stored in user_metadata and inserted into `profiles` via DB trigger.
   */
  const signUp = async (
    email: string,
    password: string,
    role: 'user' | 'seller',
    fullName: string,
    currency?: string,
    phoneNumber?: string,
    _countryId?: string,
    businessTypeId?: string
  ) => {
    try {
      // Server-side trigger determines the actual role from business_type_id.
      // Never allow 'admin' to be passed from the client.
      const safeRole = role === 'seller' ? 'seller' : 'user';

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: buildAppRedirect(safeRole === 'seller' ? '/seller/otp-verification' : '/otp-verification'),
          data: {
            full_name: fullName,
            role: safeRole,
            ...(currency ? { currency } : {}),
            phone: phoneNumber || '',
            country_id: _countryId,
            business_type_id: businessTypeId,
          },
        },
      });

      if (error) {
        return { success: false, error: { message: error.message } };
      }

      const userIdentities = (data.user as any)?.identities;
      if (Array.isArray(userIdentities) && userIdentities.length === 0) {
        return {
          success: false,
          error: {
            message: 'A user account already exists with this email address. Please use another email address.'
          }
        };
      }

      return {
        success: true,
        userId: data.user?.id,
        isSignUpComplete: false, // needs OTP verification
      };
    } catch (error: any) {
      return { success: false, error: { message: error.message || 'Failed to sign up' } };
    }
  };

  /**
   * Sign in with email + password.
   * The onAuthStateChange callback handles setting user/authRole/currentAuthUser.
   * This function just needs to return the role for the login page to navigate.
   */
  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // Map Supabase errors to user-friendly messages
        let message = error.message;
        if (message.includes('Invalid login credentials')) {
          message = 'Incorrect email or password.';
        } else if (message.includes('Email not confirmed')) {
          message = 'Please verify your email first. Check your inbox for the OTP code.';
        } else if (message.includes('Database error querying schema')) {
          message = 'Your account auth record is incomplete. Please contact support/admin to repair the account setup.';
        }
        return { success: false, error: { message } };
      }

      if (!data.user) {
        return { success: false, error: { message: 'Sign in failed' } };
      }

      // Primary role source is user_metadata; for legacy/migrated accounts where
      // role may be missing in JWT metadata, fallback to profiles.role.
      let role = resolveRoleFromSupabaseUser(data.user);
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, is_banned')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileData?.is_banned) {
        await supabase.auth.signOut();
        return { success: false, error: { message: 'Your account has been suspended. Please contact support.' } };
      }

      if (!role) {
        role = toValidRole(profileData?.role) || 'user';
      }

      return { success: true, isSignedIn: true, role };
    } catch (error: any) {
      return { success: false, error: { message: error.message || 'Failed to sign in' } };
    }
  };

  const signOut = async () => {
    const roleBeforeSignout = authRole;
    clearProfileCache();
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Network/server failures can leave the local session token behind.
      // Force a local-only sign out so route guards do not immediately re-hydrate admin state.
      console.warn('[Auth] signOut API call failed, attempting local sign out:', err);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (innerErr) {
        console.warn('[Auth] local sign out also failed:', innerErr);
      }
    }
    try {
      syncOneSignalExternalId(null);
    } catch (err) {
      console.warn('[Auth] push-token logout sync failed:', err);
    }
    setUser(null);
    setCurrentAuthUser(null);
    setAuthRole(null);
    return roleBeforeSignout;
  };

  /**
   * Send password reset OTP email.
   */
  const resetPassword = async (email: string, redirectPath?: string) => {
    try {
      const redirectTo = buildAppRedirect(redirectPath || '/new-password');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) return { success: false, error: { message: error.message } };
      return { success: true };
    } catch (error: any) {
      return { success: false, error: { message: error.message || 'Failed to send reset code' } };
    }
  };

  /**
   * Verify OTP and set new password.
   * Uses Supabase's verifyOtp for email type, then updateUser for the new password.
   */
  const confirmPasswordReset = async (email: string, code: string, newPassword: string) => {
    try {
      // Verify the OTP token
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      });

      if (verifyError) {
        return { success: false, error: { message: verifyError.message } };
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        return { success: false, error: { message: `Password update failed after code verification. Please request a new reset link and try again. (${updateError.message})` } };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: { message: error.message || 'Failed to reset password' } };
    }
  };

  /**
   * Confirm signup OTP (6-digit code sent to email).
   */
  const confirmSignUp = async (email: string, code: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          return { success: false, alreadyConfirmed: true, error: { message: 'Already verified' } };
        }
        return { success: false, error: { message: error.message } };
      }

      // After OTP verification, user is auto signed in
      if (data.user) {
        // Ensure country_id from signup metadata is persisted to profiles.
        // The handle_new_user trigger should have done this, but if it failed for any
        // reason (race condition, duplicate attempt, etc.) this is the reliable fallback.
        const metaCountryId = data.user.user_metadata?.country_id;
        if (metaCountryId) {
          await supabase
            .from('profiles')
            .update({ country_id: metaCountryId })
            .eq('id', data.user.id)
            .is('country_id', null); // only fill in — never overwrite an existing value
        }

        const profile = await fetchProfile(data.user);
        if (profile) {
          setUser(profile);
          setCurrentAuthUser(toAuthUser(data.user));
          setAuthRole(profile.role);
        }
      }

      return { success: true, isSignUpComplete: true };
    } catch (error: any) {
      return { success: false, error: { message: error.message || 'Failed to verify OTP' } };
    }
  };

  const value = {
    user,
    currentAuthUser,
    authRole,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    confirmPasswordReset,
    confirmSignUp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
