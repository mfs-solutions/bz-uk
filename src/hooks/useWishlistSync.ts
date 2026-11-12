import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../contexts/WishlistContext';
import logger from '../utils/logger';

/**
 * Hook to automatically sync wishlist with backend when user logs in
 * Call this hook in a top-level component (e.g., App.tsx)
 */
export const useWishlistSync = () => {
  const { user, currentAuthUser, authRole } = useAuth();
  const { loadFromBackend } = useWishlist();

  useEffect(() => {
    const syncWishlist = async () => {
      if (authRole && authRole !== 'user') return;
      const userId = user?.id || currentAuthUser?.userId;
      
      if (userId) {
        try {
          await loadFromBackend(userId, { mergeLocal: true });
          logger.log('Wishlist auto-synced on login', { userId });
        } catch (error) {
          logger.error(error as Error, { context: 'Wishlist auto-sync failed' });
        }
      }
    };

    syncWishlist();
  }, [authRole, user?.id, currentAuthUser?.userId, loadFromBackend]);
};
