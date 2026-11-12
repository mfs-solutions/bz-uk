import React, { useState, useEffect, useRef } from 'react';
import logger from '../../utils/logger';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, CheckCircle, X, Trash2, Home, Briefcase, MapPin, Plus, Shield, User, Lock, Key, Download, Edit2, ChevronRight, ChevronDown, ChevronUp, Package, Heart, Bell, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getUserAddresses, deleteUserAddress } from '../../lib/adminService';
import { Header } from '../../components/layout/Header';
import { MobileNav } from '../../components/layout/MobileNav';
import { readProfileCache, updateProfileCache, isFresh, clearProfileCache } from '../../lib/profileCache';
import { cachedQuery, QUERY_TTL } from '../../lib/queryCache';
import { Skeleton, FormSkeleton, ListSkeleton } from '../../components/common/Skeleton';

interface CountryOption {
  id: string;
  country_name: string;
  country_code?: string | null;
  short_code?: string | null;
  iso2?: string | null;
}

type EditingField = 'name' | 'phone' | 'country' | null;
type ProfileSection = 'personal' | 'security' | 'addresses';

const PROFILE_SECTIONS: ProfileSection[] = ['personal', 'security', 'addresses'];
const PROFILE_ADDRESS_PREVIEW = 2;

interface ProfileAddress {
  id: string;
  full_name: string;
  phone_number?: string | null;
  street_address_1: string;
  street_address_2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  address_type: string;
  is_default: boolean;
}

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as ProfileSection | null;
  const activeSection: ProfileSection =
    sectionParam && PROFILE_SECTIONS.includes(sectionParam) ? sectionParam : 'personal';
  const selectSection = (section: ProfileSection) => {
    setEditingField(null);
    setEditValue('');
    setError(null);
    setSearchParams(section === 'personal' ? {} : { section }, { replace: true });
  };
  const { user, currentAuthUser, loading: authLoading, signOut } = useAuth();
  const [initialCache] = useState(readProfileCache);
  const [loading, setLoading] = useState(!initialCache?.profile);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [locationLockedCountryId, setLocationLockedCountryId] = useState('');
  const [locationLockedCountryName, setLocationLockedCountryName] = useState('');
  const [locationRefreshTick, setLocationRefreshTick] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [addresses, setAddresses] = useState<ProfileAddress[]>(() => (initialCache?.addresses || []) as ProfileAddress[]);
  const [addressesLoading, setAddressesLoading] = useState(!initialCache?.addresses);
  const [addressesError, setAddressesError] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<ProfileAddress | null>(null);
  const [deletingAddress, setDeletingAddress] = useState(false);
  // Ref guards — prevent duplicate DB writes and avoid re-triggering fetch on location state
  const locationLockedCountryIdRef = useRef('');
  const locationLockedCountryNameRef = useRef('');
  const countryLockAppliedRef = useRef('');

  const [profileData, setProfileData] = useState(() => initialCache?.profile || {
    name: '',
    email: '',
    phone: '',
    country: '',
    countryId: '',
  });
  const userId = user?.id || currentAuthUser?.userId || '';
  const profileHydratedRef = useRef(Boolean(initialCache?.profile));
  const addressesHydratedRef = useRef(Boolean(initialCache?.addresses));
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 1023px)').matches);
  const [openSection, setOpenSection] = useState<ProfileSection | null>(
    sectionParam && PROFILE_SECTIONS.includes(sectionParam) ? sectionParam : null,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsCompact(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Persist the latest profile so reopening the page doesn't refetch.
  useEffect(() => {
    if (userId && profileHydratedRef.current) {
      updateProfileCache(userId, { profile: profileData, profileAt: Date.now() });
    }
  }, [userId, profileData]);
  useEffect(() => {
    if (userId && addressesHydratedRef.current && !addressesLoading && !addressesError) {
      updateProfileCache(userId, { addresses, addressesAt: Date.now() });
    }
  }, [userId, addresses, addressesLoading, addressesError]);

  // Temp edit values for inline editing
  const [editValue, setEditValue] = useState('');

  const normalizeCountryToken = (value: string) =>
    String(value || '').trim().toUpperCase().replace(/\s+/g, '');

  const resolveDetectedCountry = (countryRows: CountryOption[]) => {
    try {
      const raw = localStorage.getItem('beauzead_detected_location');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { country?: string; countryCode?: string };
      const tokens = new Set([
        normalizeCountryToken(String(parsed.country || '')),
        normalizeCountryToken(String(parsed.countryCode || '')),
      ]);

      for (const row of countryRows) {
        const rowTokens = [
          normalizeCountryToken(row.country_name),
          normalizeCountryToken(String(row.country_code || '')),
          normalizeCountryToken(String(row.short_code || '')),
          normalizeCountryToken(String(row.iso2 || '')),
        ];
        if (rowTokens.some((token) => token && tokens.has(token))) {
          return row;
        }
      }
    } catch {
      // Ignore malformed cached location
    }
    return null;
  };

  useEffect(() => {
    // Only re-detect on an explicit location update event — NOT on every window focus.
    // Window focus was causing the profile to blink on every tab switch / click.
    const onLocationUpdated = () => setLocationRefreshTick((prev) => prev + 1);
    window.addEventListener('beauzead:location-updated', onLocationUpdated);
    return () => {
      window.removeEventListener('beauzead:location-updated', onLocationUpdated);
    };
  }, []);

  // Fetch countries list
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const data = await cachedQuery('profile:countries', QUERY_TTL.categories, async () => {
          const { data: rows, error: countriesError } = await supabase
            .from('countries')
            .select('id, country_name, country_code, short_code, iso2')
            .eq('is_active', true)
            .order('country_name');
          if (countriesError) throw countriesError;
          return rows;
        });
        if (data) setCountries(data);
      } catch (err) {
        logger.error(err as Error, { context: 'Failed to load countries' });
      }
    };
    loadCountries();
  }, []);

  // Keep country locked to detected location when available
  useEffect(() => {
    if (countries.length === 0) return;

    const detected = resolveDetectedCountry(countries);
    if (!detected) {
      setLocationLockedCountryId('');
      setLocationLockedCountryName('');
      return;
    }

    setLocationLockedCountryId(detected.id);
    setLocationLockedCountryName(detected.country_name);
    // Keep refs in sync so fetchUserProfile can read current values without being in its dep array
    locationLockedCountryIdRef.current = detected.id;
    locationLockedCountryNameRef.current = detected.country_name;
    setProfileData((prev) => ({
      ...prev,
      countryId: detected.id,
      country: detected.country_name,
    }));
  }, [countries, locationRefreshTick]);

  // Fetch user profile on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        if (authLoading) {
          return;
        }

        if (!userId) {
          navigate('/login');
          return;
        }

        const cached = readProfileCache();
        const cacheMatches = cached?.userId === userId && Boolean(cached.profile);
        if (cacheMatches && isFresh(cached?.profileAt)) {
          // Already showing cached data: no refetch, no spinner.
          profileHydratedRef.current = true;
          setLoading(false);
          return;
        }
        // Revalidate silently when stale data is already on screen.
        if (!cacheMatches) {
          profileHydratedRef.current = false;
          setLoading(true);
        }

        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('full_name, email, phone, country_id')
          .eq('id', userId)
          .single();

        if (fetchError) {
          // Fallback to auth context data and self-heal missing profile rows.
          // Some legacy accounts exist in auth.users but have no profiles row.
          let resolvedCountry = '';
          let resolvedCountryId = '';

          try {
            const { data: authData } = await supabase.auth.getUser();
            const authUser = authData?.user;
            const metaCountryId = String(authUser?.user_metadata?.country_id || '').trim();
            const metaFullName = String(authUser?.user_metadata?.full_name || user?.full_name || '').trim();
            const metaPhone = String(authUser?.user_metadata?.phone || user?.phone || '').trim();
            const metaEmail = String(authUser?.email || user?.email || '').trim();

            if (metaCountryId) {
              resolvedCountryId = metaCountryId;
              const { data: countryRow } = await supabase
                .from('countries')
                .select('id, country_name')
                .eq('id', metaCountryId)
                .single();
              if (countryRow) {
                resolvedCountry = countryRow.country_name;
              }
            }

            // Best-effort backfill so future reads use profiles as source of truth.
            if (authUser?.id) {
              await supabase
                .from('profiles')
                .upsert(
                  {
                    id: authUser.id,
                    email: metaEmail,
                    full_name: metaFullName,
                    phone: metaPhone,
                    ...(resolvedCountryId ? { country_id: resolvedCountryId } : {}),
                  },
                  { onConflict: 'id' }
                );
            }
          } catch (_) {
            // Keep UI fallback resilient even if profile backfill fails.
          }

          setProfileData({
            name: user?.full_name || '',
            email: user?.email || '',
            phone: user?.phone || '',
            country: locationLockedCountryNameRef.current || resolvedCountry,
            countryId: locationLockedCountryIdRef.current || resolvedCountryId,
          });
        } else if (data) {
          let resolvedCountry = '';
          let resolvedCountryId = data.country_id || '';

          // Fallback: if profile has country_id but relation did not resolve, fetch country name directly
          if (resolvedCountryId && !resolvedCountry) {
            try {
              const { data: countryRow } = await supabase
                .from('countries')
                .select('id, country_name')
                .eq('id', resolvedCountryId)
                .single();

              if (countryRow) {
                resolvedCountry = countryRow.country_name;
              }
            } catch (_) { /* ignore fallback errors */ }
          }

          // Fallback: if profile has no country_id, check auth metadata and try to backfill
          if (!resolvedCountryId) {
            try {
              const { data: authData } = await supabase.auth.getUser();
              const metaCountryId = authData?.user?.user_metadata?.country_id;
              if (metaCountryId) {
                // Resolve country name from the ID
                const { data: countryRow } = await supabase
                  .from('countries')
                  .select('id, country_name')
                  .eq('id', metaCountryId)
                  .single();
                if (countryRow) {
                  resolvedCountry = countryRow.country_name;
                  resolvedCountryId = countryRow.id;
                  // Backfill the profile so it won't be missing next time — verify with .select()
                  await supabase
                    .from('profiles')
                    .update({ country_id: metaCountryId })
                    .eq('id', userId)
                    .select('country_id')
                    .single();
                }
              }
            } catch (_) { /* ignore fallback errors */ }
          }

          setProfileData({
            name: data.full_name || '',
            email: data.email || '',
            phone: data.phone || '',
            // Use refs so this effect is NOT re-triggered every time the location state updates
            country: locationLockedCountryNameRef.current || resolvedCountry,
            countryId: locationLockedCountryIdRef.current || resolvedCountryId,
          });
        }
        profileHydratedRef.current = true;
      } catch (err) {
        logger.error(err as Error, { context: 'Failed to fetch user profile' });
        setError('Failed to load profile data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  // Keyed on the user id (not the user object) so token refreshes don't refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, navigate]);
  // locationLockedCountryId / locationLockedCountryName intentionally omitted — read via refs
  // to prevent re-fetching (and re-blinking) every time location state changes.

  useEffect(() => {
    const loadAddresses = async () => {
      if (!userId) {
        setAddresses([]);
        setAddressesLoading(false);
        return;
      }

      const cached = readProfileCache();
      const cacheMatches = cached?.userId === userId && Array.isArray(cached.addresses);
      if (cacheMatches && isFresh(cached?.addressesAt)) {
        addressesHydratedRef.current = true;
        setAddressesLoading(false);
        return;
      }

      try {
        if (!cacheMatches) {
          addressesHydratedRef.current = false;
          setAddressesLoading(true);
        }
        setAddressesError(false);
        const { data, error: addressError } = await getUserAddresses(userId);
        if (addressError) throw new Error(addressError);
        setAddresses((data || []) as ProfileAddress[]);
        addressesHydratedRef.current = true;
      } catch (err) {
        logger.error(err as Error, { context: 'Failed to load profile addresses' });
        setAddresses([]);
        setAddressesError(true);
        setError('Failed to load addresses. Please try again.');
      } finally {
        setAddressesLoading(false);
      }
    };

    if (!authLoading) {
      void loadAddresses();
    }
  }, [userId, authLoading]);

  // Persist locked detected country to profile + auth metadata once user is known.
  // countryLockAppliedRef ensures this only writes to DB once per detected country ID,
  // preventing an infinite loop caused by profileData.countryId being in the dep array.
  useEffect(() => {
    const applyDetectedCountryLock = async () => {
      const userId = user?.id || currentAuthUser?.userId;
      if (!userId || !locationLockedCountryId) return;

      // Guard: only apply once per lock ID to avoid infinite update loops
      if (countryLockAppliedRef.current === locationLockedCountryId) return;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ country_id: locationLockedCountryId })
        .eq('id', userId);

      if (updateError) {
        logger.error(updateError as Error, { context: 'Failed to lock profile country to detected location' });
        return;
      }

      countryLockAppliedRef.current = locationLockedCountryId;
      await supabase.auth.updateUser({ data: { country_id: locationLockedCountryId } });
      setProfileData((prev) => ({
        ...prev,
        countryId: locationLockedCountryId,
        country: locationLockedCountryName || prev.country,
      }));
    };

    void applyDetectedCountryLock();
  }, [user, currentAuthUser, locationLockedCountryId, locationLockedCountryName]);

  const startEditing = (field: EditingField) => {
    if (field === 'country' && locationLockedCountryId) return;
    setEditingField(field);
    setError(null);
    setSuccessMessage(null);
    if (field === 'name') setEditValue(profileData.name);
    else if (field === 'phone') setEditValue(profileData.phone);
    else if (field === 'country') {
      const fallbackCountryId = countries.find((country) => country.country_name === profileData.country)?.id || '';
      setEditValue(profileData.countryId || fallbackCountryId);
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
    setError(null);
  };

  const handleSaveField = async (field: 'name' | 'phone' | 'country') => {
    try {
      setSaving(true);
      setError(null);

      const trimmed = editValue.trim();
      if (!trimmed) {
        setError('Please enter a value before saving.');
        setSaving(false);
        return;
      }

      const userId = user?.id || currentAuthUser?.userId;
      if (!userId) throw new Error('User not authenticated');

      if (field === 'country') {
        // Update country_id FK — use .select() to verify the row was actually updated
        const { data: updatedRow, error: updateError } = await supabase
          .from('profiles')
          .update({ country_id: trimmed })
          .eq('id', userId)
          .select('country_id')
          .single();
        if (updateError) throw updateError;
        if (!updatedRow) throw new Error('Profile update returned no data — row may not exist or RLS blocked the write.');

        // Also sync country_id into auth user_metadata so the fallback always works
        await supabase.auth.updateUser({ data: { country_id: trimmed } });

        const { data: selectedCountryRow, error: countryFetchError } = await supabase
          .from('countries')
          .select('id, country_name')
          .eq('id', trimmed)
          .maybeSingle();
        if (countryFetchError) throw countryFetchError;

        const selectedCountry = selectedCountryRow || countries.find(c => c.id === trimmed);
        setProfileData(prev => ({
          ...prev,
          country: selectedCountry?.country_name || prev.country,
          countryId: trimmed,
        }));
      } else {
        const updateMap: Record<string, string> = {
          name: 'full_name',
          phone: 'phone',
        };

        if (field === 'phone' && trimmed.replace(/\D/g, '').length < 6) {
          setError('Please enter a valid phone number.');
          setSaving(false);
          return;
        }

        const dbColumn = updateMap[field];
        const { data: updatedRow, error: updateError } = await supabase
          .from('profiles')
          .update({ [dbColumn]: trimmed })
          .eq('id', userId)
          .select(dbColumn)
          .single();
        if (updateError) throw updateError;
        if (!updatedRow) throw new Error('Profile update returned no data — please try again.');

        setProfileData(prev => ({ ...prev, [field]: trimmed }));
      }

      setSuccessMessage(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully!`);
      setEditingField(null);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      logger.error(err as Error, { context: `Failed to update ${field}` });
      const message = err?.message || `Failed to update ${field}. Please try again.`;
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteAddress = async () => {
    if (!addressToDelete) return;
    try {
      setDeletingAddress(true);
      const result = await deleteUserAddress(addressToDelete.id);
      if (!result.success) throw new Error(result.error || 'Address could not be deleted.');
      setAddresses((current) => current.filter((a) => a.id !== addressToDelete.id));
      setSuccessMessage('Address deleted successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error(err as Error, { context: 'Failed to delete address from profile' });
      setError(err instanceof Error ? err.message : 'Failed to delete address');
    } finally {
      setDeletingAddress(false);
      setAddressToDelete(null);
    }
  };

  const handleLogout = async () => {
    clearProfileCache();
    await signOut();
    navigate('/');
  };

  const getAddressTypeIcon = (type: string) => {
    if (type === 'work') return <Briefcase className="w-4 h-4" />;
    if (type === 'home') return <Home className="w-4 h-4" />;
    return <MapPin className="w-4 h-4" />;
  };

  const formatAddressLine = (address: ProfileAddress) => {
    const line1 = [address.street_address_1, address.street_address_2].filter(Boolean).join(', ');
    const line2 = [address.city, address.state, address.postal_code].filter(Boolean).join(', ');
    return { line1, line2, country: address.country };
  };

  const sectionMeta: Record<ProfileSection, { title: string; subtitle: string }> = {
    personal: { title: 'Personal Information', subtitle: 'Manage your personal details.' },
    security: { title: 'Login & Security', subtitle: 'Manage your password and account actions.' },
    addresses: { title: 'My Addresses', subtitle: 'Manage your saved delivery addresses.' },
  };

  const menuItems: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    section?: ProfileSection;
    path?: string;
  }> = [
    { key: 'personal', label: 'Personal Information', icon: <User className="w-[18px] h-[18px]" />, section: 'personal' },
    { key: 'security', label: 'Login & Security', icon: <Shield className="w-[18px] h-[18px]" />, section: 'security' },
    { key: 'addresses', label: 'My Addresses', icon: <Home className="w-[18px] h-[18px]" />, section: 'addresses' },
    { key: 'orders', label: 'My Orders', icon: <Package className="w-[18px] h-[18px]" />, path: '/orders' },
    { key: 'wishlist', label: 'Wishlist', icon: <Heart className="w-[18px] h-[18px]" />, path: '/wishlist' },
    { key: 'notifications', label: 'Notifications', icon: <Bell className="w-[18px] h-[18px]" />, path: '/notifications' },
    { key: 'help', label: 'Help & Support', icon: <HelpCircle className="w-[18px] h-[18px]" />, path: '/contact' },
  ];

  const renderEditActions = (field: 'name' | 'phone' | 'country') => (
    <>
      {error && editingField === field && <p className="text-red-600 text-xs mt-2">{error}</p>}
      <div className="flex gap-3 mt-3">
        <button onClick={() => handleSaveField(field)} disabled={saving} type="button" className="acct-btn-primary">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={cancelEditing} type="button" className="acct-btn-secondary">
          Cancel
        </button>
      </div>
    </>
  );

  const renderPersonalSection = () => (
    <div className="acct-field-grid">
      <div className="acct-field">
        <div className="acct-field-head">
          <label className="acct-label">Name</label>
          {editingField !== 'name' && (
            <button type="button" onClick={() => startEditing('name')} className="acct-edit-link">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
        {editingField === 'name' ? (
          <>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="acct-input"
              autoFocus
            />
            {renderEditActions('name')}
          </>
        ) : (
          <div className="acct-input acct-input--static">{profileData.name || '—'}</div>
        )}
      </div>

      <div className="acct-field">
        <div className="acct-field-head">
          <label className="acct-label">Phone</label>
          {editingField !== 'phone' && (
            <button type="button" onClick={() => startEditing('phone')} className="acct-edit-link">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
        {editingField === 'phone' ? (
          <>
            <input
              type="tel"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="acct-input"
              autoFocus
            />
            {renderEditActions('phone')}
          </>
        ) : (
          <div className="acct-input acct-input--static">{profileData.phone || '—'}</div>
        )}
      </div>

      <div className="acct-field">
        <div className="acct-field-head">
          <label className="acct-label">Email</label>
        </div>
        <div className="acct-input acct-input--static acct-input--locked">
          <Lock className="w-4 h-4 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{profileData.email || '—'}</span>
        </div>
        <p className="acct-hint">Email address cannot be changed</p>
      </div>

      <div className="acct-field">
        <div className="acct-field-head">
          <label className="acct-label">Country</label>
          {editingField !== 'country' && !locationLockedCountryId && (
            <button type="button" onClick={() => startEditing('country')} className="acct-edit-link">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
        {editingField === 'country' ? (
          <>
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="acct-input bg-white"
              autoFocus
            >
              <option value="">Select a country</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.country_name}</option>
              ))}
            </select>
            {renderEditActions('country')}
          </>
        ) : (
          <>
            <div className={`acct-input acct-input--static ${locationLockedCountryId ? 'acct-input--locked' : ''}`}>
              {locationLockedCountryId && <Lock className="w-4 h-4 shrink-0 text-slate-400" aria-hidden />}
              <span className="truncate">{profileData.country || 'Not set'}</span>
            </div>
            {locationLockedCountryId && (
              <p className="acct-hint">
                Your account is registered in {profileData.country || 'your detected region'}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderSecuritySection = () => (
    <div className="space-y-6">
      <div className="acct-row">
        <div className="min-w-0">
          <p className="acct-label">Password</p>
          <p className="text-sm text-slate-600 mt-1 tracking-widest">••••••••••</p>
        </div>
        <button type="button" onClick={() => navigate('/settings')} className="acct-btn-secondary acct-btn-secondary--outline">
          Change
        </button>
      </div>

      <div>
        <p className="acct-label">Account Actions</p>
        <p className="acct-hint mb-4">Manage your account settings and preferences.</p>
        <div className="profile-account-actions-grid">
          <button
            type="button"
            onClick={() => navigate('/contact', { state: { subject: 'Download My Data Request' } })}
            className="profile-account-action-card"
          >
            <Download className="w-4 h-4 text-[#6D28D9]" />
            <span>Download My Data</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="profile-account-action-card"
          >
            <Key className="w-4 h-4 text-[#6D28D9]" />
            <span>Change Password</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteAcknowledged(false);
              setConfirmDeleteAccount(true);
            }}
            data-no-global-confirm="true"
            className="profile-account-action-card profile-account-action-card--danger"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
            <span>Delete Account</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderAddressesSection = () => {
    if (addressesLoading) return <ListSkeleton rows={3} withAvatar={false} />;
    if (addressesError) return null;

    if (addresses.length === 0) {
      return (
        <div className="profile-address-empty">
          <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">No saved addresses</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Add a delivery address for faster checkout</p>
          <button type="button" onClick={() => navigate('/user/addresses/new')} className="acct-btn-primary">
            <Plus className="w-4 h-4" />
            Add New Address
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="acct-address-list">
          {addresses.slice(0, PROFILE_ADDRESS_PREVIEW).map((address) => {
            const { line1, line2, country } = formatAddressLine(address);
            return (
              <div key={address.id} className="acct-address-row">
                <div className="profile-address-icon-box">{getAddressTypeIcon(address.address_type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{address.full_name}</p>
                    <span className="acct-type-pill">{address.address_type || 'home'}</span>
                    {address.is_default && <span className="profile-address-default-badge">Default</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {[line1, line2, country].filter(Boolean).join(', ')}
                  </p>
                  {address.phone_number && <p className="text-xs text-slate-500 mt-0.5">{address.phone_number}</p>}
                </div>
                <div className="acct-address-actions">
                  <button
                    type="button"
                    onClick={() => navigate(`/user/addresses/${address.id}/edit`)}
                    className="profile-address-link-btn"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddressToDelete(address)}
                    data-no-global-confirm="true"
                    className="profile-address-link-btn profile-address-link-btn--danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => navigate('/user/addresses')}
          className="profile-address-manage-btn mt-5"
        >
          {addresses.length > PROFILE_ADDRESS_PREVIEW
            ? `See more (${addresses.length - PROFILE_ADDRESS_PREVIEW} more)`
            : 'Manage addresses'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </>
    );
  };

  // Show loading state
  if (loading) {
    return (
      <div className="profile-page-shell">
        <Header />
        <main className="profile-page-main">
          <div className="profile-page-inner">
            <div className="acct-layout">
              <div className="acct-sidebar space-y-3">
                <Skeleton rounded="sm" className="h-10 w-full" />
                <Skeleton rounded="sm" className="h-10 w-full" />
                <Skeleton rounded="sm" className="h-10 w-full" />
              </div>
              <div className="acct-panel">
                <FormSkeleton fields={4} />
              </div>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  const meta = sectionMeta[activeSection];

  return (
    <div className="profile-page-shell">
      <Header />
      <main className="profile-page-main">
        <div className="profile-page-inner">
          {!isCompact && (
          <nav className="profile-breadcrumb" aria-label="Breadcrumb">
            <button type="button" onClick={() => navigate('/')} className="profile-breadcrumb-link">Home</button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden />
            <button type="button" onClick={() => selectSection('personal')} className="profile-breadcrumb-link">My Account</button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden />
            <span className="profile-breadcrumb-current">{meta.title}</span>
          </nav>
          )}

          {isCompact ? (
            <div className="acct-accordion">
              {successMessage && (
                <div className="auth-alert auth-alert--success mb-3">
                  <CheckCircle className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} type="button" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {error && editingField === null && (
                <div className="auth-alert auth-alert--error mb-3">
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)} type="button" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {menuItems.map((item) => {
                const section = item.section;
                const isOpen = Boolean(section) && openSection === section;
                return (
                  <div key={item.key} className="acct-acc-item">
                    <button
                      type="button"
                      className="acct-acc-head"
                      aria-expanded={section ? isOpen : undefined}
                      onClick={() => {
                        if (!section) {
                          navigate(item.path as string);
                          return;
                        }
                        setEditingField(null);
                        setEditValue('');
                        setError(null);
                        setOpenSection(isOpen ? null : section);
                      }}
                    >
                      <span className="acct-acc-label">{item.icon}<span>{item.label}</span></span>
                      {!section
                        ? <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden />
                        : isOpen
                          ? <ChevronUp className="w-5 h-5 text-[#6D28D9]" aria-hidden />
                          : <ChevronDown className="w-5 h-5 text-slate-400" aria-hidden />}
                    </button>
                    {isOpen && (
                      <div className="acct-acc-body">
                        {section === 'personal' && renderPersonalSection()}
                        {section === 'security' && renderSecuritySection()}
                        {section === 'addresses' && renderAddressesSection()}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                data-no-global-confirm="true"
                className="acct-acc-head acct-acc-logout"
              >
                <span className="acct-acc-label"><LogOut className="w-[18px] h-[18px]" /><span>Logout</span></span>
              </button>
            </div>
          ) : (
          <div className="acct-layout">
            <aside className="acct-sidebar" aria-label="Account menu">
              <nav className="acct-menu">
                {menuItems.map((item) => {
                  const isActive = item.section === activeSection;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => (item.section ? selectSection(item.section) : navigate(item.path as string))}
                      className={`acct-menu-item ${isActive ? 'acct-menu-item--active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="acct-menu-divider" />
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                data-no-global-confirm="true"
                className="acct-menu-item acct-menu-item--logout"
              >
                <LogOut className="w-[18px] h-[18px]" />
                <span>Logout</span>
              </button>
            </aside>

            <section className="acct-panel" aria-labelledby="acct-section-title">
              <div className="acct-panel-head">
                <div className="min-w-0">
                  <h1 id="acct-section-title" className="acct-panel-title">{meta.title}</h1>
                  <p className="acct-panel-subtitle">{meta.subtitle}</p>
                </div>
                {activeSection === 'addresses' && addresses.length > 0 && (
                  <button type="button" onClick={() => navigate('/user/addresses/new')} className="profile-address-add-link">
                    <Plus className="w-4 h-4" />
                    Add New Address
                  </button>
                )}
              </div>

              {successMessage && (
                <div className="auth-alert auth-alert--success mb-6">
                  <CheckCircle className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} type="button" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {error && editingField === null && (
                <div className="auth-alert auth-alert--error mb-6">
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)} type="button" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {activeSection === 'personal' && renderPersonalSection()}
              {activeSection === 'security' && renderSecuritySection()}
              {activeSection === 'addresses' && renderAddressesSection()}
            </section>
          </div>
          )}

          {confirmLogout && (
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100">
                <h3 id="logout-confirm-title" className="text-lg font-bold text-slate-900 mb-2">Confirm Logout</h3>
                <p className="text-sm text-slate-600 mb-5">Are you sure you want to log out of your account?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmLogout(false)}
                    type="button"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => { setConfirmLogout(false); await handleLogout(); }}
                    type="button"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition font-semibold"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}

          {addressToDelete && (
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-address-title">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100">
                <h3 id="delete-address-title" className="text-lg font-bold text-slate-900 mb-2">Delete address?</h3>
                <p className="text-sm text-slate-600 mb-1 font-medium">{addressToDelete.full_name}</p>
                <p className="text-sm text-slate-500 mb-5">
                  {[addressToDelete.street_address_1, addressToDelete.city, addressToDelete.postal_code].filter(Boolean).join(', ')}
                  <br />
                  This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAddressToDelete(null)}
                    disabled={deletingAddress}
                    type="button"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDeleteAddress}
                    disabled={deletingAddress}
                    data-no-global-confirm="true"
                    type="button"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition font-semibold disabled:opacity-50"
                  >
                    {deletingAddress ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {confirmDeleteAccount && (
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-red-100">
                <h3 id="delete-account-title" className="text-lg font-bold text-red-700 mb-2">Delete Account</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  This will permanently remove your profile, order history access, saved addresses, and wishlist.
                  This action cannot be undone.
                </p>
                <label className="flex items-start gap-3 cursor-pointer mb-5 p-3 rounded-xl bg-red-50 border border-red-100">
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700 leading-relaxed">
                    I understand that deleting my account is permanent and all associated data will be lost.
                  </span>
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setConfirmDeleteAccount(false);
                      setDeleteAcknowledged(false);
                    }}
                    type="button"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDeleteAccount(false);
                      setDeleteAcknowledged(false);
                      navigate('/contact', { state: { subject: 'Account Deletion Request' } });
                    }}
                    disabled={!deleteAcknowledged}
                    type="button"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <MobileNav />
    </div>
  );
};

export default Profile;
