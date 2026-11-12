import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, User, Bell, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isNativePlatform } from '../../mobile/nativePlatform';
import {
  getBuyerUnreadCount,
  SELLER_ONLY_TYPES,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '../../lib/notificationService';

export const MobileNav: React.FC = () => (
  isNativePlatform ? <BuyerMobileNav /> : null
);

const BuyerMobileNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || '';
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!userId) return;
    const { count } = await getBuyerUnreadCount(userId);
    setUnreadCount(count);
  }, [userId]);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToNotifications(userId, (notif: any) => {
      if (!SELLER_ONLY_TYPES.includes(notif.type)) {
        setUnreadCount((c) => c + 1);
      }
    });
    return () => { unsubscribeFromNotifications(channel); };
  }, [userId]);

  const isActive = (path: string) => location.pathname === path;

  const handleAccountClick = () => {
    if (user) {
      navigate('/profile');
    } else {
      navigate('/login');
    }
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around py-1.5">
        <Link
          to="/"
          className={`flex flex-col items-center space-y-0.5 px-2.5 py-1.5 transition-all duration-300 ${
            isActive('/') ? 'text-amber-600' : 'text-gray-500'
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] leading-none">Home</span>
        </Link>

        <Link
          to="/orders"
          className={`flex flex-col items-center space-y-0.5 px-2.5 py-1.5 transition-all duration-300 ${
            isActive('/orders') ? 'text-amber-600' : 'text-gray-500'
          }`}
        >
          <Package className="h-5 w-5" />
          <span className="text-[10px] leading-none">Orders</span>
        </Link>

        <Link
          to="/notifications"
          className={`flex flex-col items-center space-y-0.5 px-2.5 py-1.5 relative transition-all duration-300 ${
            isActive('/notifications') ? 'text-amber-600' : 'text-gray-500'
          }`}
        >
          <Bell className="h-5 w-5" />
          <span className="text-[10px] leading-none">Notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-2 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-0.5 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <button
          onClick={handleAccountClick}
          className={`flex flex-col items-center space-y-0.5 px-2.5 py-1.5 transition-all duration-300 ${
            isActive('/profile') || isActive('/login') ? 'text-amber-600' : 'text-gray-500'
          }`}
        >
          <User className="h-5 w-5" />
          <span className="text-[10px] leading-none">{user ? 'Profile' : 'Login'}</span>
        </button>
      </div>
    </nav>
  );
};
