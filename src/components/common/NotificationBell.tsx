/**
 * NotificationBell — Reusable bell icon with real-time unread count badge.
 * Drop into any seller page header to show notification status.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getUnreadCount,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '../../lib/notificationService';

interface NotificationBellProps {
  /** Navigation callback — e.g. onNavigate('seller-notifications') */
  onNavigate: (view: string) => void;
  /** Visual variant to match the page header style */
  variant?: 'dark' | 'light';
}

const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate, variant = 'dark' }) => {
  const { user, currentAuthUser } = useAuth();
  const userId = user?.id || currentAuthUser?.userId || '';
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!userId) return;
    const { count } = await getUnreadCount(userId);
    setUnreadCount(count);
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Realtime subscription — increment on new notification
  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToNotifications(userId, () => {
      setUnreadCount((c) => c + 1);
    });
    return () => {
      unsubscribeFromNotifications(channel);
    };
  }, [userId]);

  const isDark = variant === 'dark';

  return (
    <button
      onClick={() => onNavigate('seller-notifications')}
      className={`relative p-2 rounded-lg transition-colors ${
        isDark
          ? 'hover:bg-white/10 text-white'
          : 'hover:bg-gray-100 text-gray-700'
      }`}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      title="Notifications"
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full h-[18px] min-w-[18px] flex items-center justify-center px-1 leading-none shadow-sm">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;
