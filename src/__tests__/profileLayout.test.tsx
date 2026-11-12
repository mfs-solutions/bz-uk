import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Profile } from '../pages/user/Profile';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getAddresses: vi.fn(),
  deleteAddress: vi.fn(),
  user: { id: 'buyer', full_name: 'Buyer', email: 'buyer@example.com' },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, currentAuthUser: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../utils/logger', () => ({ default: { error: vi.fn() } }));
vi.mock('../lib/adminService', () => ({
  getUserAddresses: mocks.getAddresses,
  deleteUserAddress: mocks.deleteAddress,
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({
          data: table === 'profiles' ? { full_name: 'Buyer', email: 'buyer@example.com', phone: '', country_id: null } : null,
          error: null,
        }),
      };
      return query;
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));

describe('profile account layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getAddresses.mockResolvedValue({
      data: [{
        id: 'address-1', full_name: 'Buyer', street_address_1: '12 High Street',
        city: 'London', state: 'London', postal_code: 'SW1A 1AA',
        country: 'United Kingdom', address_type: 'home', is_default: true,
      }],
      error: null,
    });
    mocks.deleteAddress.mockResolvedValue({ success: true, error: null });
  });

  it('switches sections and provides address edit, management and confirmed removal', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Personal Information' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'My Addresses' }));
    expect(await screen.findByText(/12 High Street/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage addresses' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/user/addresses');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/user/addresses/address-1/edit');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.deleteAddress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }));
    await waitFor(() => expect(mocks.deleteAddress).toHaveBeenCalledWith('address-1'));
    expect(await screen.findByText('No saved addresses')).toBeInTheDocument();
  });

  it('shows an address loading error instead of an empty-address message', async () => {
    mocks.getAddresses.mockResolvedValue({ data: [], error: 'Network error' });
    render(<MemoryRouter initialEntries={['/profile?section=addresses']}><Profile /></MemoryRouter>);
    expect(await screen.findByText('Failed to load addresses. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('No saved addresses')).not.toBeInTheDocument();
  });

  it('on compact screens shows an accordion without breadcrumb and caches the loaded profile', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      const view = render(<MemoryRouter><Profile /></MemoryRouter>);
      const personal = await screen.findByRole('button', { name: 'Personal Information' });
      expect(screen.queryByLabelText('Breadcrumb')).not.toBeInTheDocument();
      expect(personal).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(personal);
      expect(personal).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(personal);
      expect(personal).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(screen.getByRole('button', { name: 'My Orders' }));
      expect(mocks.navigate).toHaveBeenCalledWith('/orders');
      const buttons = screen.getAllByRole('button').map((b) => b.textContent);
      expect(buttons[buttons.length - 1]).toBe('Logout');
      await waitFor(() => expect(localStorage.getItem('beauzead_profile_cache_v1')).toContain('buyer@example.com'));

      view.unmount();
      render(<MemoryRouter><Profile /></MemoryRouter>);
      expect(screen.getByRole('button', { name: 'Personal Information' })).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
