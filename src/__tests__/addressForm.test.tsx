import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddressForm, { type Address } from '../components/AddressForm';

vi.mock('../lib/shippingDataService', () => ({
  fetchCountries: vi.fn().mockResolvedValue({
    data: [{ id: 'gb', country_name: 'United Kingdom' }],
    error: null,
  }),
}));

describe('AddressForm', () => {
  it('validates required fields and submits a complete new address', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddressForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.queryByText(/current location/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/address preview/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('full Name is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Full name/), 'Test Buyer');
    await user.type(screen.getByLabelText(/Mobile number/), '+447700900000');
    await user.type(screen.getByLabelText(/Email address/), 'buyer@example.com');
    await waitFor(() => expect(screen.getByLabelText(/Country \/ Region/)).toBeEnabled());
    await user.selectOptions(screen.getByLabelText(/Country \/ Region/), 'United Kingdom');
    await user.type(screen.getByLabelText(/Flat, house/), '12 Main Street');
    await user.type(screen.getByLabelText(/Area, street/), 'Near market');
    await user.type(screen.getByLabelText(/Town \/ City/), 'London');
    await user.type(screen.getByLabelText(/State \/ Province/), 'London');
    await user.type(screen.getByLabelText(/PIN \/ ZIP/), 'SW1A 1AA');
    await user.type(screen.getByLabelText(/Delivery instructions/), 'Call first');
    await user.click(screen.getByRole('radio', { name: 'Work' }));
    await user.click(screen.getByRole('checkbox', { name: 'Set as default address' }));
    await user.click(screen.getByRole('button', { name: 'Save address' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Test Buyer',
      phoneNumber: '+447700900000',
      email: 'buyer@example.com',
      country: 'United Kingdom',
      streetAddress1: '12 Main Street',
      streetAddress2: 'Near market',
      city: 'London',
      state: 'London',
      postalCode: 'SW1A 1AA',
      addressType: 'work',
      deliveryNotes: 'Call first',
      isDefault: true,
    }));
  });

  it('preserves existing address fields when editing and supports cancel', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const address: Address = {
      id: 'address-1', fullName: 'Test Buyer', phoneNumber: '+447700900000',
      email: 'buyer@example.com', country: 'United Kingdom', streetAddress1: '12 Main Street',
      streetAddress2: 'Near market', city: 'London', state: 'London', postalCode: 'SW1A 1AA',
      addressType: 'other', deliveryNotes: 'Call first', isDefault: true,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
    render(<AddressForm initialData={address} onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByRole('heading', { name: 'Edit your address' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Other' })).toBeChecked();
    await user.clear(screen.getByLabelText(/Town \/ City/));
    await user.type(screen.getByLabelText(/Town \/ City/), 'Bristol');
    await user.click(screen.getByRole('button', { name: 'Update address' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      ...address, city: 'Bristol', updatedAt: expect.any(String),
    }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
