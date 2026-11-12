import React, { useState } from 'react';
import { Home, Briefcase, Loader2, Truck, X, MapPin, Plus, Search, LocateFixed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UseDeliveryEstimateReturn } from '../../hooks/useDeliveryEstimate';
import { detectLocationWithCaching } from '../../lib/locationService';

interface DeliveryEstimateProps {
  delivery: UseDeliveryEstimateReturn;
}

export const DeliveryEstimate: React.FC<DeliveryEstimateProps> = ({ delivery }) => {
  const {
    address,
    addresses,
    pincode,
    tat,
    serviceability,
    loading,
    error,
    selectAddress,
    setPincode,
    setCountry,
    checkDelivery,
  } = delivery;

  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const addressTypeLabel =
    address?.address_type === 'home' ? 'HOME' :
    address?.address_type === 'work' ? 'WORK' : 'OTHER';

  const AddressIcon = address?.address_type === 'work' ? Briefcase : Home;
  const filteredAddresses = addresses.filter((addr) => {
    const haystack = `${addr.full_name} ${addr.street_address_1} ${addr.street_address_2 || ''} ${addr.city} ${addr.postal_code}`.toLowerCase();
    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  const hasDeliveryDate = Boolean(tat?.expectedDeliveryDate);
  const deliveryDateText = hasDeliveryDate
    ? new Date(tat!.expectedDeliveryDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  const topAddressText = address
    ? `${address.street_address_1}${address.street_address_2 ? `, ${address.street_address_2}` : ''}${address.city ? `, ${address.city}` : ''}`
    : 'Select delivery location';

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const { data, error: locError } = await detectLocationWithCaching({
        userId: user?.id || null,
        forceRefresh: true,
      });

      if (locError) {
        setLocationError(locError);
        return;
      }

      let resolvedPostal = String(data?.postalCode || '').trim();
      let resolvedCountry = String(data?.country || data?.countryCode || '').trim();

      // Some reverse-geocode responses contain city/state but miss postcode.
      // Retry through cached/IP-assisted detection before failing hard.
      if (!resolvedPostal) {
        const fallback = await detectLocationWithCaching({
          userId: user?.id || null,
          forceRefresh: false,
        });
        if (fallback.data?.postalCode) {
          resolvedPostal = String(fallback.data.postalCode).trim();
        }
        if (!resolvedCountry && (fallback.data?.country || fallback.data?.countryCode)) {
          resolvedCountry = String(fallback.data.country || fallback.data.countryCode || '').trim();
        }
      }

      if (!resolvedPostal) {
        setLocationError('Could not detect postal code from your current location. Please select a saved address.');
        return;
      }

      setPincode(resolvedPostal);
      setCountry(resolvedCountry);
      await checkDelivery();
      setShowAddressPicker(false);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="mb-2.5 border border-gray-300 rounded-sm overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setShowAddressPicker(true)}
        className="w-full px-3 py-2 bg-[#eef3fa] border-b border-gray-300 flex items-center gap-1.5 text-left hover:bg-[#e7effa] transition-colors"
      >
        {address ? <AddressIcon size={13} className="text-[#6b7280]" /> : <MapPin size={13} className="text-[#6b7280]" />}
        {address ? (
          <span className="text-[11px] text-[#111111] font-[Arial,sans-serif] truncate">
            <span className="font-semibold uppercase mr-1.5">{addressTypeLabel}</span>
            {topAddressText}
          </span>
        ) : (
          <span className="text-[11px] text-[#666666] font-[Arial,sans-serif]">
            {pincode || 'Select'} <span className="text-[#1f5ea8] font-semibold">Select delivery location</span> ›
          </span>
        )}
      </button>

      <div className="px-3 py-2 flex items-center gap-1.5 min-h-[36px]">
        <Truck size={12} className="text-[#6b7280]" />
        {loading ? (
          <span className="text-[11px] text-[#666666] font-[Arial,sans-serif]">Checking delivery availability…</span>
        ) : error ? (
          <span className="text-[11px] text-red-600 font-[Arial,sans-serif]">{error}</span>
        ) : serviceability && !serviceability.serviceable ? (
          <span className="text-[11px] text-red-600 font-[Arial,sans-serif]">Delivery not available to this location</span>
        ) : deliveryDateText ? (
          <span className="text-[11px] text-[#111111] font-[Arial,sans-serif]">Delivery by {deliveryDateText}</span>
        ) : (
          <span className="text-[11px] text-[#111111] font-[Arial,sans-serif]">Delivery details available at checkout</span>
        )}
      </div>

      {showAddressPicker && (
        <div className="fixed inset-0 z-[10020] bg-black/45">
          <div className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-[16px] sm:text-[18px] leading-none text-[#111111] font-[Arial,sans-serif]">Select delivery address</h3>
              <button onClick={() => setShowAddressPicker(false)} className="text-gray-500 hover:text-gray-700">
                <X size={30} />
              </button>
            </div>

            <div className="px-5 py-4 border-b border-gray-100">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by area, street name, pin code"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl border border-gray-300 text-[14px] text-[#111111] outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleUseCurrentLocation()}
                disabled={locating}
                className="mt-4 inline-flex items-center gap-2.5 text-[#1f67ff] text-[16px] font-semibold font-[Arial,sans-serif] disabled:opacity-60"
              >
                {locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                Use my current location
              </button>
              {locationError && <p className="mt-2 text-[12px] text-red-600">{locationError}</p>}
            </div>

            <div className="px-5 py-4 flex items-center justify-between border-b border-dashed border-gray-200">
              <h4 className="text-[16px] font-semibold text-[#111111] font-[Arial,sans-serif]">Saved addresses</h4>
              <button
                onClick={() => {
                  setShowAddressPicker(false);
                  navigate('/user/addresses');
                }}
                className="inline-flex items-center gap-1 text-[#1f67ff] text-[18px] font-semibold font-[Arial,sans-serif]"
              >
                <Plus size={18} /> Add New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-2">
              {filteredAddresses.length === 0 ? (
                <p className="text-[14px] text-gray-500 py-5">No saved addresses found.</p>
              ) : (
                <div className="space-y-1">
                  {filteredAddresses.map((addr) => {
                    const Icon = addr.address_type === 'work' ? Briefcase : Home;
                    const isSelected = address?.id === addr.id;
                    return (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => {
                          selectAddress(addr.id);
                          setShowAddressPicker(false);
                        }}
                        className={`w-full text-left px-1 py-3 border-b border-gray-100 ${isSelected ? 'bg-blue-50/40' : ''}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <Icon size={18} className="mt-0.5 text-[#3a3f47] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] sm:text-[16px] leading-none font-semibold text-[#111111] font-[Arial,sans-serif] truncate">{addr.full_name}</p>
                            <p className="text-[13px] sm:text-[14px] text-[#636a73] mt-1 truncate font-[Arial,sans-serif]">
                              {addr.street_address_1}{addr.street_address_2 ? `, ${addr.street_address_2}` : ''}, {addr.city}, {addr.state}, {addr.postal_code}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
