import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { Footer } from '../components/layout/Footer';

const mocks = vi.hoisted(() => ({ role: null as string | null }));

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ authRole: mocks.role, loading: false, user: null, currentAuthUser: null }),
}));
vi.mock('../contexts/CartContext', () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => children,
  useCart: () => ({ syncCartWithBackend: vi.fn(), totalItems: 0 }),
}));
vi.mock('../contexts/WishlistContext', () => ({
  WishlistProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../contexts/CurrencyContext', () => ({
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../hooks/useWishlistSync', () => ({ useWishlistSync: () => {} }));
vi.mock('../components/OfflineScreen', () => ({
  OfflineScreen: () => null,
  useOnlineStatus: () => true,
}));
vi.mock('../components/common/GlobalActionConfirmation', () => ({ GlobalActionConfirmation: () => null }));
vi.mock('../components/layout/FloatingCartShortcut', () => ({ FloatingCartShortcut: () => null }));
vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../mobile/nativeRuntime', () => ({
  NativePullToRefreshIndicator: () => null,
  useNativeBackButton: () => {},
  useNativePagePersist: () => {},
  useNativePullToRefresh: () => ({ enabled: false, pullDistance: 0, isRefreshing: false }),
}));
vi.mock('../mobile/nativePlatform', () => ({ isNativePlatform: false }));
vi.mock('../pages/BzeadHomePage', () => ({ BzeadHomePage: () => <Footer /> }));

describe('account deletion policy', () => {
  afterEach(() => {
    mocks.role = null;
    vi.restoreAllMocks();
  });

  it('navigates from the homepage footer to the policy and offers a support request', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.history.replaceState({}, '', '/');
    render(<App />);

    const link = screen.getByRole('link', { name: 'Delete Account Policy' });
    expect(link).toHaveAttribute('href', '/deleteaccount');
    fireEvent.click(link);

    expect(await screen.findByRole('heading', { name: 'Delete Account Policy' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/deleteaccount');
    expect(screen.getByText(/does not delete your account immediately/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request account deletion' }))
      .toHaveAttribute('href', 'mailto:support@bzead.com?subject=Account%20Deletion%20Request');
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' }).length).toBeGreaterThan(0);
  });

  it.each([null, 'user', 'admin', 'seller'])('opens the direct URL for role %s', async (role) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mocks.role = role;
    window.history.replaceState({}, '', '/deleteaccount');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Delete Account Policy' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/deleteaccount');
  });
});
