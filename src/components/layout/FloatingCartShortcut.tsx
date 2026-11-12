import { ShoppingCart } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';

const HIDDEN_PATHS = ['/cart', '/checkout', '/seller', '/admin', '/login', '/signup'];

export const FloatingCartShortcut: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();

  if (HIDDEN_PATHS.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) {
    return null;
  }

  return (
    <button
      id="floating-cart-btn"
      type="button"
      onClick={() => navigate('/cart')}
      aria-label={`Cart${totalItems > 0 ? `, ${totalItems} items` : ''}`}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#D4AF37] bg-white text-[#D4AF37] shadow-[0_3px_12px_rgba(15,23,42,0.2)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 md:bottom-6 md:right-6"
    >
      <ShoppingCart size={22} strokeWidth={2.25} aria-hidden="true" />
      {totalItems > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#D4AF37] px-1 text-[10px] font-bold leading-none text-white">
          {totalItems > 99 ? '99+' : totalItems}
        </span>
      )}
    </button>
  );
};