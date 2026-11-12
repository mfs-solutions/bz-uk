import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { MobileNav } from '../../components/layout/MobileNav';
import { ListSkeleton } from '../../components/common/Skeleton';
import type { Address } from '../../components/AddressForm';
import { MapPin, Edit2, Trash2, Plus, ArrowLeft, Home, Briefcase, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import logger from '../../utils/logger';
import {
  getUserAddresses,
  deleteUserAddress as deleteAddressApi,
  setDefaultUserAddress,
} from '../../lib/adminService';

const UserAddressManagement: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentAuthUser, loading: authLoading } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadAddresses = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setLoadFailed(false);

      const userId = user?.id || currentAuthUser?.userId;
      if (!userId) { if (!authLoading) navigate('/login'); return false; }

      const result = await getUserAddresses(userId);
      if (result.error) throw new Error(result.error);
      if (result.data) {
        setAddresses(result.data.map((a: any) => ({
          id: a.id,
          fullName: a.full_name || '',
          phoneNumber: a.phone_number || '',
          email: a.email || '',
          country: a.country || '',
          streetAddress1: a.street_address_1 || '',
          streetAddress2: a.street_address_2 || '',
          city: a.city || '',
          state: a.state || '',
          postalCode: a.postal_code || '',
          addressType: (a.address_type || 'home') as 'home' | 'work' | 'other',
          deliveryNotes: a.delivery_notes || '',
          isDefault: a.is_default || false,
          createdAt: a.created_at || new Date().toISOString(),
          updatedAt: a.updated_at || new Date().toISOString(),
        })));
      }
      return true;
    } catch (err) {
      logger.error(err as Error, { context: 'Failed to load addresses' });
      setError('Failed to load addresses');
      setLoadFailed(true);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Load addresses from the database when the active user changes.
  useEffect(() => {
    void loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentAuthUser, authLoading]);

  const handleDeleteAddress = async (id: string) => {
    try {
      setIsSaving(true);
      setError(null);

      const result = await deleteAddressApi(id);
      if (!result.success) {
        throw new Error(result.error || 'Address could not be deleted.');
      }

      setAddresses((current) => current.filter((address) => address.id !== id));
      setSuccessMessage('Address deleted!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error(err as Error, { context: 'Failed to delete address' });
      setError(err instanceof Error ? err.message : 'Failed to delete address');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      setIsSaving(true);
      setError(null);

      const userId = user?.id || currentAuthUser?.userId;
      if (!userId) throw new Error('User not authenticated');

      // Batch update: unset all defaults then set new one (2 DB calls instead of N+1)
      const result = await setDefaultUserAddress(userId, id);
      if (result.error) throw new Error(result.error);

      if (await loadAddresses()) {
        setSuccessMessage('Default address updated!');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      logger.error(err as Error, { context: 'Failed to set default address' });
      setError('Failed to set default address');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (id: string) => navigate(`/user/addresses/${id}/edit`);

  const getAddressTypeIcon = (type: 'home' | 'work' | 'other') => {
    switch (type) {
      case 'home':
        return <Home size={16} className="text-amber-600" />;
      case 'work':
        return <Briefcase size={16} className="text-amber-600" />;
      default:
        return <MapPin size={16} className="text-amber-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 pb-16 md:pb-0">
        <div className="w-full max-w-3xl mx-auto px-4 py-6">
          <div className="h-6 w-44 rounded bg-gray-200 animate-pulse mb-5" />
          <ListSkeleton rows={4} withAvatar={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 pb-16 md:pb-0">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-amber-600 hover:text-yellow-400 transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Back</span>
        </button>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-900 border border-green-600 rounded-lg p-4 mb-6 flex items-center gap-3">
            <span className="text-green-300">{successMessage}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-900 border border-red-600 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300">{error}</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">My Addresses</h1>
          <p className="text-gray-500">Manage your delivery addresses</p>
        </div>

        {/* Add Address Button */}
        <button
            onClick={() => navigate('/user/addresses/new')}
            disabled={isSaving}
            className="mb-8 flex items-center gap-2 px-6 py-3 bg-amber-500 text-black rounded-lg hover:bg-yellow-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus size={20} />}
            Add New Address
          </button>

        {/* Addresses List */}
        {loadFailed ? null : addresses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {addresses.map((address) => (
              <div
                key={address.id}
                className="bg-gray-50 border border-gray-200 rounded-2xl p-6 hover:border-gray-200 transition-colors relative"
              >
                {/* Default Badge */}
                {address.isDefault && (
                  <div className="absolute top-4 right-4 bg-amber-500 text-black text-xs font-semibold px-3 py-1 rounded-full">
                    Default
                  </div>
                )}

                {/* Address Type Icon & Type */}
                <div className="flex items-center gap-2 mb-4">
                  {getAddressTypeIcon(address.addressType)}
                  <span className="text-sm font-semibold text-amber-600 capitalize">{address.addressType}</span>
                </div>

                {/* Address Details */}
                <div className="space-y-3 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium">{address.fullName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="text-sm">{address.phoneNumber}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="text-sm break-all">{address.email}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="text-sm">
                      {address.streetAddress1}
                      {address.streetAddress2 && `, ${address.streetAddress2}`}
                    </p>
                    <p className="text-sm">
                      {address.city}, {address.state} {address.postalCode}
                    </p>
                    <p className="text-sm text-gray-500">{address.country}</p>
                  </div>

                  {address.deliveryNotes && (
                    <div>
                      <p className="text-sm text-gray-500">Delivery Notes</p>
                      <p className="text-sm text-gray-600">{address.deliveryNotes}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleEditClick(address.id)}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit2 size={16} />
                    Edit
                  </button>

                  <button
                    onClick={() => setConfirmDeleteId(address.id)}
                    data-no-global-confirm="true"
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    Delete
                  </button>

                  {!address.isDefault && (
                    <button
                      onClick={() => handleSetDefault(address.id)}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-yellow-400 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Set Default'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-2xl">
            <MapPin size={36} className="mx-auto mb-4 text-gray-600" />
            <p className="text-gray-500 mb-4">No addresses added yet</p>
            <button
              onClick={() => navigate('/user/addresses/new')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-black rounded-lg hover:bg-yellow-400 transition-colors font-medium"
            >
              <Plus size={18} />
              Add Your First Address
            </button>
          </div>
        )}
      </div>

      {/* Custom delete confirmation — replaces window.confirm to avoid the ugly 'https://localhost' browser dialog on Android */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Address</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this address? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { const id = confirmDeleteId; setConfirmDeleteId(null); handleDeleteAddress(id); }}
                data-no-global-confirm="true"
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <MobileNav />
    </div>
  );
};

export default UserAddressManagement;
