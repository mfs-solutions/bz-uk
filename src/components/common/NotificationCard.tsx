/**
 * NotificationCard — flat Amazon / Flipkart inbox row.
 * Used inside NotificationInbox list (divide-y container).
 */

import React from 'react';
import {
  CheckCircle2,
  Info,
  Package,
  PackageCheck,
  PackageX,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';

type StatusKey =
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refund'
  | 'info'
  | 'success';

interface StatusStyle {
  iconBg: string;
  iconFg: string;
}

const STATUS_STYLES: Record<StatusKey, StatusStyle> = {
  packed:    { iconBg: 'bg-amber-100',   iconFg: 'text-amber-700' },
  shipped:   { iconBg: 'bg-blue-100',    iconFg: 'text-blue-700' },
  delivered: { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-700' },
  cancelled: { iconBg: 'bg-red-100',     iconFg: 'text-red-700' },
  refund:    { iconBg: 'bg-violet-100',  iconFg: 'text-violet-700' },
  info:      { iconBg: 'bg-gray-100',    iconFg: 'text-gray-600' },
  success:   { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-700' },
};

export function resolveNotificationTypeMeta(type: string): { status: StatusKey; icon: React.ReactNode } {
  switch (type) {
    case 'order_placed':
    case 'order_new':
    case 'order_accepted':
      return { status: 'packed', icon: <ShoppingBag size={15} /> };
    case 'order_packed':
      return { status: 'packed', icon: <Package size={15} /> };
    case 'order_shipped':
    case 'order_picked_up':
    case 'order_update':
    case 'order_in_transit':
    case 'order_out_for_delivery':
    case 'label_ready':
    case 'in_transit':
      return { status: 'shipped', icon: <Truck size={15} /> };
    case 'order_delivered':
      return { status: 'delivered', icon: <PackageCheck size={15} /> };
    case 'order_cancelled':
    case 'order_rejected':
    case 'order_failed_delivery':
      return { status: 'cancelled', icon: <XCircle size={15} /> };
    case 'return_requested':
    case 'return_approved':
    case 'return_rejected':
      return { status: 'refund', icon: <RotateCcw size={15} /> };
    case 'refund':
    case 'refund_processed':
      return { status: 'refund', icon: <CheckCircle2 size={15} /> };
    case 'identity_approved':
    case 'product_approved':
    case 'payout_completed':
    case 'warehouse_approved':
      return { status: 'success', icon: <ShieldCheck size={15} /> };
    case 'identity_rejected':
    case 'product_rejected':
    case 'payout_failed':
    case 'warehouse_rejected':
      return { status: 'cancelled', icon: <PackageX size={15} /> };
    case 'identity_pending':
    case 'warehouse_pending':
    case 'product_pending':
      return { status: 'shipped', icon: <ShieldCheck size={15} /> };
    default:
      return { status: 'info', icon: <Info size={15} /> };
  }
}

export function notificationTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export interface NotificationCardProps {
  type: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  extra?: string;
  onClick?: () => void;
  onDelete?: () => void;
}

const NotificationCard: React.FC<NotificationCardProps> = ({
  type,
  title,
  message,
  createdAt,
  isRead,
  extra,
  onClick,
  onDelete,
}) => {
  const { status, icon } = resolveNotificationTypeMeta(type);
  const s = STATUS_STYLES[status];
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        'group flex items-start gap-3 px-3 py-3.5 sm:px-4 sm:py-4 transition-colors',
        onClick ? 'cursor-pointer hover:bg-[#f7fafa]' : '',
        !isRead ? 'bg-[#f0f8ff]/60' : 'bg-white',
      ].join(' ')}
    >
      <div
        className={`mt-0.5 flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-full ${s.iconBg} ${s.iconFg}`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1 pr-1">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <h4
            className={`text-[13px] sm:text-sm leading-snug ${
              isRead ? 'font-normal text-gray-700' : 'font-bold text-gray-900'
            }`}
          >
            {title}
          </h4>
          <div className="flex flex-shrink-0 items-center gap-1.5 pt-0.5">
            <span className="text-[10px] sm:text-[11px] text-gray-400 whitespace-nowrap">
              {notificationTimeAgo(createdAt)}
            </span>
            {!isRead && (
              <span
                className="h-2 w-2 rounded-full bg-[#2874f0]"
                aria-label="Unread"
              />
            )}
          </div>
        </div>

        {message && (
          <p className={`mt-0.5 text-[12px] sm:text-[13px] leading-relaxed line-clamp-2 ${isRead ? 'text-gray-500' : 'text-gray-600'}`}>
            {message}
          </p>
        )}

        {extra && (
          <p className="mt-1 text-[11px] text-gray-400 truncate">{extra}</p>
        )}
      </div>

      {onDelete && (
        <div className="flex-shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); onDelete(); }}
                className="text-[10px] font-semibold text-red-600 hover:text-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
              aria-label="Delete notification"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCard;
export { Info as NotificationEmptyIcon } from 'lucide-react';
