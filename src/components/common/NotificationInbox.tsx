/**
 * NotificationInbox — shared Amazon / Flipkart-style notification centre shell.
 * Used by seller, buyer, and admin notification pages.
 */

import React from 'react';
import { AlertCircle, Bell, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import NotificationCard from './NotificationCard';
import { ListSkeleton } from './Skeleton';

export type ReadFilterKey = 'all' | 'unread' | 'read';

export interface InboxCategoryFilter {
  key: string;
  label: string;
  count?: number;
}

export interface InboxNotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  extra?: string;
  onClick?: () => void;
  onDelete?: () => void;
}

export interface NotificationInboxProps {
  unreadCount: number;
  readFilter: ReadFilterKey;
  onReadFilterChange: (filter: ReadFilterKey) => void;
  categoryFilters?: InboxCategoryFilter[];
  categoryFilter?: string;
  onCategoryFilterChange?: (key: string) => void;
  items: InboxNotificationItem[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  onMarkAllRead?: () => void;
  onItemClick?: (id: string) => void;
  onItemDelete?: (id: string) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onClearFilters?: () => void;
  showClearFilters?: boolean;
  /** Mobile back button (seller sidebar layout) */
  onBack?: () => void;
  /** Slot below filters — e.g. admin test push panel */
  toolbarExtra?: React.ReactNode;
  className?: string;
}

const NotificationInbox: React.FC<NotificationInboxProps> = ({
  unreadCount,
  readFilter,
  onReadFilterChange,
  categoryFilters,
  categoryFilter = 'all',
  onCategoryFilterChange,
  items,
  loading = false,
  refreshing = false,
  error,
  onRetry,
  onRefresh,
  onMarkAllRead,
  onItemClick,
  onItemDelete,
  onLoadMore,
  loadingMore = false,
  hasMore = false,
  emptyTitle = 'No notifications',
  emptyMessage = "You're all caught up.",
  onClearFilters,
  showClearFilters = false,
  onBack,
  toolbarExtra,
  className = '',
}) => {
  const readTabs: { key: ReadFilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: unreadCount > 0 ? `Unread (${unreadCount})` : 'Unread' },
    { key: 'read', label: 'Read' },
  ];

  return (
    <div className={`w-full max-w-3xl mx-auto ${className}`}>
      {/* Header — white bar, Amazon/Flipkart style */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-sm px-3 py-3 sm:px-5 sm:py-4 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="lg:hidden mt-0.5 p-1.5 -ml-1 text-gray-600 hover:text-gray-900"
                aria-label="Go back"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#2874f0] text-white text-[10px] font-bold">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-[#2874f0] transition disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
            )}
            {unreadCount > 0 && onMarkAllRead && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-[11px] sm:text-xs font-semibold text-[#2874f0] hover:text-blue-800 whitespace-nowrap"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Read filters */}
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
          {readTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onReadFilterChange(key)}
              className={`px-3 py-1.5 rounded-sm text-[11px] sm:text-xs font-semibold border transition-colors ${
                readFilter === key
                  ? 'bg-[#2874f0] border-[#2874f0] text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-[#2874f0] hover:text-[#2874f0]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Category filters (seller) */}
      {categoryFilters && categoryFilters.length > 0 && onCategoryFilterChange && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoryFilters.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => onCategoryFilterChange(key)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-sm text-[11px] font-semibold whitespace-nowrap border shrink-0 transition-colors ${
                categoryFilter === key
                  ? 'bg-white border-[#2874f0] text-[#2874f0] shadow-sm'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              {label}
              {count != null && count > 0 && key !== 'all' && (
                <span className="text-[10px] text-gray-400">({count})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {toolbarExtra}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-xs sm:text-sm">{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="text-xs font-semibold text-red-700 underline">
              Retry
            </button>
          )}
        </div>
      )}

      {/* Inbox list */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : items.length === 0 ? (
          <div className="py-14 px-4 text-center">
            <Bell size={32} className="mx-auto mb-3 text-gray-300" strokeWidth={1.5} />
            <h2 className="text-sm font-bold text-gray-800">{emptyTitle}</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">{emptyMessage}</p>
            {showClearFilters && onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="mt-3 text-xs font-semibold text-[#2874f0] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {items.map((item) => (
              <NotificationCard
                key={item.id}
                type={item.type}
                title={item.title}
                message={item.message}
                createdAt={item.createdAt}
                isRead={item.isRead}
                extra={item.extra}
                onClick={onItemClick ? () => onItemClick(item.id) : item.onClick}
                onDelete={onItemDelete ? () => onItemDelete(item.id) : item.onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {hasMore && onLoadMore && !loading && items.length > 0 && (
        <div className="text-center py-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-5 py-2 text-sm font-semibold text-[#2874f0] border border-gray-300 bg-white rounded-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Loading…
              </span>
            ) : (
              'Load more notifications'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationInbox;
