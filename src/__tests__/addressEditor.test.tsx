import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressEditor from '../pages/user/AddressEditor';
import type { Address } from '../components/AddressForm';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  setDefault: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../components/layout/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'buyer' }, currentAuthUser: null, loading: false }),
}));
vi.mock('../utils/logger', () => ({ default: { error: vi.fn() } }));
vi.mock('../lib/adminService', () => ({
  getUserAddresses: mocks.getAddresses,
  createUserAddress: mocks.createAddress,
  updateUserAddress: mocks.updateAddress,
  setDefaultUserAddress: mocks.setDefault,
}));
vi.mock('../components/AddressForm', () => ({
  default: ({ initialData, onSubmit }: { initialData?: Address; onSubmit: (address: Address) => void }) => (
    <button onClick={() => onSubmit(initialData || {
      id: 'new', fullName: 'Buyer', phoneNumber: '+447700900000', email: 'buyer@example.com',
      country: 'United Kingdom', streetAddress1: '12 High Street', city: 'London',
      state: 'London', postalCode: 'SW1A 1AA', addressType: 'home', isDefault: false,
      createdAt: '', updatedAt: '',
    })}>{initialData ? `Edit ${initialData.fullName}` : 'Save new'}</button>
  ),
}));

const renderEditor = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/user/addresses/new" element={<AddressEditor />} />
      <Route path="/user/addresses/:addressId/edit" element={<AddressEditor />} />
    </Routes>
  </MemoryRouter>,
);

describe('address editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAddresses.mockResolvedValue({ data: [], error: null });
    mocks.createAddress.mockResolvedValue({ data: { id: 'saved' }, error: null });
    mocks.updateAddress.mockResolvedValue({ data: { id: 'saved' }, error: null });
    mocks.setDefault.mockResolvedValue({ success: true, error: null });
  });

  it('creates the first address as default and returns to the profile', async () => {
    renderEditor('/user/addresses/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Save new' }));
    await waitFor(() => expect(mocks.setDefault).toHaveBeenCalledWith('buyer', 'saved'));
    expect(mocks.createAddress).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'buyer', country: 'United Kingdom', is_default: true,
    }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/profile?section=addresses'));
  });

  it('loads and updates an existing address', async () => {
    mocks.getAddresses.mockResolvedValue({
      data: [{ id: 'saved', full_name: 'Existing buyer', is_default: true }], error: null,
    });
    renderEditor('/user/addresses/saved/edit');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Existing buyer' }));
    await waitFor(() => expect(mocks.updateAddress).toHaveBeenCalledWith('saved', expect.objectContaining({
      full_name: 'Existing buyer', is_default: true,
    })));
    await waitFor(() => expect(mocks.setDefault).toHaveBeenCalledWith('buyer', 'saved'));
  });

  it('does not allow a new address when the existing addresses could not be loaded', async () => {
    mocks.getAddresses.mockResolvedValue({ data: [], error: 'Network error' });
    renderEditor('/user/addresses/new');
    expect(await screen.findByText('Failed to load address. Please try again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save new' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to My Addresses' })).toBeInTheDocument();
  });

  it('updates the created address instead of duplicating it when default selection must be retried', async () => {
    mocks.getAddresses.mockResolvedValue({ data: [], error: null });
    mocks.setDefault.mockResolvedValueOnce({ success: false, error: 'Network error' })
      .mockResolvedValueOnce({ success: true, error: null });
    renderEditor('/user/addresses/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Save new' }));
    expect(await screen.findByText('Failed to save address. Please try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save new' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/profile?section=addresses'));
    expect(mocks.createAddress).toHaveBeenCalledTimes(1);
    expect(mocks.updateAddress).toHaveBeenCalledWith('saved', expect.objectContaining({ is_default: true }));
  });
});
