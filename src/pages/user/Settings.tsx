import React, { useState, useEffect } from 'react';
import logger from '../../utils/logger';
import { Header } from '../../components/layout/Header';
import { MobileNav } from '../../components/layout/MobileNav';
import { Footer } from '../../components/layout/Footer';
import { Skeleton, FormSkeleton } from '../../components/common/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Settings as SettingsIcon, Lock, Mail, Bell, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { PushNotificationSettings } from '../../components/settings/PushNotificationSettings';
import { mergeNotificationPreferences } from '../../lib/notificationPreferences';

interface UserSettings {
  email: string;
  fullName: string;
  phone: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  emailNotifications: boolean;
  orderUpdates: boolean;
  promotions: boolean;
}

export const UserSettings: React.FC = () => {
  const { user, currentAuthUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');

  const [settings, setSettings] = useState<UserSettings>({
    email: '',
    fullName: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    emailNotifications: true,
    orderUpdates: true,
    promotions: false,
  });

  useEffect(() => {
    // Wait for auth to initialize before checking
    if (authLoading) return;
    // Check if user is logged in
    if (!user && !currentAuthUser) {
      navigate('/login');
      return;
    }

    const loadSettings = async () => {
      try {
        setLoading(true);

        const userId = user?.id || currentAuthUser?.userId;
        if (!userId) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email, phone, notification_preferences')
          .eq('id', userId)
          .single();

        if (error) throw error;

        setSettings((prev) => ({
          ...prev,
          email: data?.email || user?.email || currentAuthUser?.email || '',
          fullName: data?.full_name || user?.full_name || '',
          phone: data?.phone || '',
          emailNotifications: (data?.notification_preferences as Record<string, boolean> | null)?.emailNotifications ?? true,
          orderUpdates: (data?.notification_preferences as Record<string, boolean> | null)?.orderUpdates ?? true,
          promotions: (data?.notification_preferences as Record<string, boolean> | null)?.promotions ?? false,
        }));
      } catch (error) {
        logger.error(error as Error, { context: 'Failed to load settings' });
        // Fallback to auth context
        setSettings((prev) => ({
          ...prev,
          email: user?.email || currentAuthUser?.email || '',
          fullName: user?.full_name || '',
          phone: user?.phone || '',
        }));
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user, currentAuthUser, navigate, authLoading]);

  const handleProfileChange = (field: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setSuccessMessage('');
      setErrorMessage('');

      if (!settings.fullName.trim()) {
        setErrorMessage('Full name is required');
        setSaving(false);
        return;
      }

      const userId = user?.id || currentAuthUser?.userId;
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: settings.fullName.trim(),
          phone: settings.phone.trim() || null,
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      setSaving(true);
      setSuccessMessage('');
      setErrorMessage('');

      if (!settings.currentPassword) {
        setErrorMessage('Please enter your current password');
        setSaving(false);
        return;
      }

      if (!settings.newPassword || settings.newPassword.length < 8) {
        setErrorMessage('New password must be at least 8 characters');
        setSaving(false);
        return;
      }

      if (settings.newPassword !== settings.confirmPassword) {
        setErrorMessage('Passwords do not match');
        setSaving(false);
        return;
      }

      // Verify current password before allowing change
      const email = settings.email || user?.email || currentAuthUser?.email || '';
      if (!email) {
        setErrorMessage('Unable to verify identity — email not found');
        setSaving(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: settings.currentPassword,
      });

      if (verifyError) {
        setErrorMessage('Current password is incorrect');
        setSaving(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: settings.newPassword,
      });

      if (error) throw error;

      setSuccessMessage('Password changed successfully!');
      setSettings((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      setSaving(true);
      setSuccessMessage('');
      setErrorMessage('');

      const userId = user?.id || currentAuthUser?.userId;
      if (!userId) throw new Error('User not authenticated');

      // Read-merge-write: preserve any keys owned by other sections
      // (e.g. the push notification toggles below) instead of clobbering them.
      const { data: existing, error: readError } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', userId)
        .single();
      if (readError) throw readError;

      const merged = {
        ...mergeNotificationPreferences(existing?.notification_preferences),
        emailNotifications: settings.emailNotifications,
        orderUpdates: settings.orderUpdates,
        promotions: settings.promotions,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ notification_preferences: merged })
        .eq('id', userId);

      if (error) throw error;

      setSuccessMessage('Notification preferences saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to update notifications');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <MobileNav />

      <main className="flex-grow max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="h-8 w-8 text-amber-600" />
            <h1 className="text-2xl font-bold text-amber-600">Settings</h1>
          </div>
          <p className="text-gray-500">Manage your account preferences</p>
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="mb-6 bg-green-900 border border-green-700 rounded-lg p-4 flex items-center gap-3 text-green-200 animate-fadeIn">
            <Check className="h-5 w-5" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 bg-red-900 border border-red-700 rounded-lg p-4 text-red-200 animate-fadeIn">
            {errorMessage}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} rounded="lg" className="h-10 w-full" />
              ))}
            </div>
            <div className="lg:col-span-3">
              <FormSkeleton fields={5} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Tabs */}
            <div className="lg:col-span-1">
              <div className="space-y-2 sticky top-24">
                {([
                  { id: 'profile' as const, label: 'Profile', icon: '👤' },
                  { id: 'security' as const, label: 'Security', icon: '🔒' },
                  { id: 'notifications' as const, label: 'Notifications', icon: '🔔' },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all duration-300 flex items-center gap-3 ${
                      activeTab === tab.id
                        ? 'bg-amber-500 text-black'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Information</h2>

                  {/* Full Name */}
                  <div>
                    <label className="block text-gray-900 font-medium mb-2">Full Name</label>
                    <input
                      type="text"
                      value={settings.fullName}
                      onChange={(e) => handleProfileChange('fullName', e.target.value)}
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Email (Read-only) */}
                  <div>
                    <label className="block text-gray-900 font-medium mb-2">Email Address</label>
                    <input
                      type="email"
                      value={settings.email}
                      disabled
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-500 placeholder-gray-500 opacity-60 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-gray-900 font-medium mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={settings.phone}
                      onChange={(e) => handleProfileChange('phone', e.target.value)}
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="bg-amber-500 text-black px-6 py-2 rounded-lg font-semibold hover:bg-yellow-500 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Security Settings</h2>

                  {/* Current Password */}
                  <div>
                    <label className="block text-gray-900 font-medium mb-2">Current Password</label>
                    <div className="relative">
                      <input
                        type={showPasswords.current ? 'text' : 'password'}
                        value={settings.currentPassword}
                        onChange={(e) => handleProfileChange('currentPassword', e.target.value)}
                        className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500 pr-10"
                      />
                      <button
                        onClick={() => setShowPasswords((prev) => ({ ...prev, current: !prev.current }))}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-amber-600"
                      >
                        {showPasswords.current ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-gray-900 font-medium mb-2">New Password</label>
                    <div className="relative">
                      <input
                        type={showPasswords.new ? 'text' : 'password'}
                        value={settings.newPassword}
                        onChange={(e) => handleProfileChange('newPassword', e.target.value)}
                        placeholder="Min 8 characters"
                        className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500 pr-10"
                      />
                      <button
                        onClick={() => setShowPasswords((prev) => ({ ...prev, new: !prev.new }))}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-amber-600"
                      >
                        {showPasswords.new ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-gray-900 font-medium mb-2">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showPasswords.confirm ? 'text' : 'password'}
                        value={settings.confirmPassword}
                        onChange={(e) => handleProfileChange('confirmPassword', e.target.value)}
                        className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-amber-500 pr-10"
                      />
                      <button
                        onClick={() => setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-amber-600"
                      >
                        {showPasswords.confirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleChangePassword}
                    disabled={saving}
                    className="bg-amber-500 text-black px-6 py-2 rounded-lg font-semibold hover:bg-yellow-500 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Change Password
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Notification Preferences</h2>

                  {/* Email Notifications */}
                  <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium text-gray-900">Email Notifications</p>
                        <p className="text-sm text-gray-500">Receive email updates about your account</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.emailNotifications}
                      onChange={(e) => handleProfileChange('emailNotifications', e.target.checked)}
                      className="w-5 h-5 rounded cursor-pointer"
                    />
                  </div>

                  {/* Order Updates */}
                  <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium text-gray-900">Order Updates</p>
                        <p className="text-sm text-gray-500">Get notified about your order status</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.orderUpdates}
                      onChange={(e) => handleProfileChange('orderUpdates', e.target.checked)}
                      className="w-5 h-5 rounded cursor-pointer"
                    />
                  </div>

                  {/* Promotions */}
                  <div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎉</span>
                      <div>
                        <p className="font-medium text-gray-900">Promotional Offers</p>
                        <p className="text-sm text-gray-500">Receive special deals and offers</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.promotions}
                      onChange={(e) => handleProfileChange('promotions', e.target.checked)}
                      className="w-5 h-5 rounded cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={handleSaveNotifications}
                    disabled={saving}
                    className="bg-amber-500 text-black px-6 py-2 rounded-lg font-semibold hover:bg-yellow-500 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Save Preferences
                      </>
                    )}
                  </button>

                  {/* Browser push notifications (hidden on native shells) */}
                  {(user?.id || currentAuthUser?.userId) && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <PushNotificationSettings
                        userId={(user?.id || currentAuthUser?.userId) as string}
                        onSaved={(msg) => {
                          setSuccessMessage(msg);
                          setTimeout(() => setSuccessMessage(''), 3000);
                        }}
                        onError={(msg) => setErrorMessage(msg)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
