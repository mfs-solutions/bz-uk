import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { MobileNav } from '../../components/layout/MobileNav';
import { ListSkeleton } from '../../components/common/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import NotificationInbox from '../../components/common/NotificationInbox';
import type { ReadFilterKey } from '../../components/common/NotificationInbox';
import {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  SELLER_ONLY_TYPES,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '../../lib/notificationService';
import { deleteNotification } from '../../lib/adminService';

const SELLER_TYPES_SET = new Set(SELLER_ONLY_TYPES);

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  is_read: boolean;
  metadata?: Record<string, unknown>;
}

type CategoryFilter = 'all' | 'orders' | 'returns' | 'offers';

const ORDER_TYPES = new Set([
  'order_placed', 'order_accepted', 'order_shipped', 'order_in_transit',
  'order_out_for_delivery', 'order_delivered', 'order_cancelled', 'order_update',
  'order_picked_up', 'label_ready', 'in_transit',
]);
const RETURN_TYPES = new Set(['return_requested', 'return_approved', 'return_rejected', 'refund', 'refund_processed']);

function matchesBuyerCategory(type: string, category: CategoryFilter): boolean {
  if (category === 'all') return true;
  if (category === 'orders') return ORDER_TYPES.has(type);
  if (category === 'returns') return RETURN_TYPES.has(type);
  if (category === 'offers') return type === 'info' || type === 'system';
  return true;
}

export const NotificationsPage: React.FC = () => {
  const { user, currentAuthUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id || currentAuthUser?.userId || '';
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilterKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [serverOffset, setServerOffset] = useState(0);

  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await fetchNotifications(userId, PAGE_SIZE, 0);
      if (error) throw new Error(error);
      const buyerNotifs = (data || []).filter((n) => !SELLER_TYPES_SET.has(n.type as typeof SELLER_ONLY_TYPES[number]));
      setNotifications(buyerNotifs);
      setServerOffset((data || []).length);
      setHasMore((data || []).length >= PAGE_SIZE);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(err as Error, { context: 'Failed to load notifications' });
      setFetchError(`Failed to load notifications: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await fetchNotifications(userId, PAGE_SIZE, serverOffset);
      if (error) throw new Error(error);
      const buyerNotifs = (data || []).filter((n) => !SELLER_TYPES_SET.has(n.type as typeof SELLER_ONLY_TYPES[number]));
      setNotifications((prev) => [...prev, ...buyerNotifs]);
      setServerOffset((prev) => prev + (data || []).length);
      setHasMore((data || []).length >= PAGE_SIZE);
    } catch (err) {
      logger.error(err as Error, { context: 'Failed to load more notifications' });
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore, serverOffset]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { navigate('/login'); return; }
    load();
  }, [userId, authLoading, navigate, load]);

  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof subscribeToNotifications> | null = null;
    try {
      channel = subscribeToNotifications(
        userId,
        (newNotif) => {
          if (!SELLER_TYPES_SET.has(newNotif.type)) {
            setNotifications((prev) => [newNotif, ...prev]);
            setServerOffset((prev) => prev + 1);
          }
        },
        (updatedNotif) => {
          if (!SELLER_TYPES_SET.has(updatedNotif.type)) {
            setNotifications((prev) => prev.map((n) => (n.id === updatedNotif.id ? { ...n, ...updatedNotif } : n)));
          }
        },
      );
    } catch (err) {
      logger.error(err as Error, { context: 'Notifications: realtime subscribe failed' });
    }
    return () => {
      try { if (channel) unsubscribeFromNotifications(channel); } catch { /* ignore */ }
    };
  }, [userId]);

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const { success } = await markAsRead(id, userId);
    if (!success) await load();
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const { success } = await markAllAsRead(userId);
    if (!success) await load();
  };

  const handleDelete = async (id: string) => {
    const { success } = await deleteNotification(id, userId || undefined);
    if (success) setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleItemClick = (id: string) => {
    const n = notifications.find((item) => item.id === id);
    if (!n) return;
    if (!n.is_read) void handleMarkRead(id);
    const orderId = n.metadata?.order_id as string | undefined;
    if (orderId) navigate(`/orders/${orderId}`);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const filtered = useMemo(() => notifications.filter((n) => {
    if (readFilter === 'unread' && n.is_read) return false;
    if (readFilter === 'read' && !n.is_read) return false;
    if (!matchesBuyerCategory(n.type, categoryFilter)) return false;
    return true;
  }), [notifications, readFilter, categoryFilter]);

  const categoryCounts = useMemo(() => ({
    orders: notifications.filter((n) => ORDER_TYPES.has(n.type)).length,
    returns: notifications.filter((n) => RETURN_TYPES.has(n.type)).length,
  }), [notifications]);

  const inboxItems = filtered.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    createdAt: n.created_at,
    isRead: n.is_read,
    extra: n.metadata?.tracking_number ? `Tracking: ${n.metadata.tracking_number}` : undefined,
  }));

  if (authLoading || (loading && notifications.length === 0)) {
    return (
      <div className="min-h-screen bg-[#eaeded] flex flex-col">
        <Header />
        <main className="flex-grow w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <ListSkeleton rows={6} />
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eaeded] flex flex-col">
      <Header />

      <main className="flex-1 pb-24 md:pb-8 pt-3 sm:pt-4 px-2 sm:px-4">
        <NotificationInbox
          unreadCount={unreadCount}
          readFilter={readFilter}
          onReadFilterChange={setReadFilter}
          categoryFilters={[
            { key: 'all', label: 'All updates' },
            { key: 'orders', label: 'Orders', count: categoryCounts.orders },
            { key: 'returns', label: 'Returns', count: categoryCounts.returns },
            { key: 'offers', label: 'Offers & info' },
          ]}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={(key) => setCategoryFilter(key as CategoryFilter)}
          items={inboxItems}
          loading={loading}
          error={fetchError}
          onRetry={load}
          onRefresh={load}
          onMarkAllRead={handleMarkAllRead}
          onItemClick={handleItemClick}
          onItemDelete={handleDelete}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          hasMore={hasMore && readFilter === 'all' && categoryFilter === 'all'}
          emptyTitle="No notifications"
          emptyMessage="Order and delivery updates will show up here."
          showClearFilters={readFilter !== 'all' || categoryFilter !== 'all'}
          onClearFilters={() => { setReadFilter('all'); setCategoryFilter('all'); }}
        />
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default NotificationsPage;
