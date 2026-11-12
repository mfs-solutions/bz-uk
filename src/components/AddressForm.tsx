import React, { useEffect, useState } from 'react';
import { Home, Briefcase, MoreHorizontal } from 'lucide-react';
import { fetchCountries, type Country } from '../lib/shippingDataService';

export interface Address {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  country: string;
  streetAddress1: string;
  streetAddress2?: string;
  city: string;
  state: string;
  postalCode: string;
  addressType: 'home' | 'work' | 'other';
  deliveryNotes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddressFormProps {
  initialData?: Address;
  onSubmit: (data: Address) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const AddressForm: React.FC<AddressFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<Partial<Address>>(
    initialData || {
      fullName: '',
      phoneNumber: '',
      email: '',
      country: '',
      streetAddress1: '',
      streetAddress2: '',
      city: '',
      state: '',
      postalCode: '',
      addressType: 'home',
      deliveryNotes: '',
      isDefault: false,
    }
  );

  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    let isCurrent = true;

    const loadCountries = async () => {
      try {
        const { data, error } = await fetchCountries();
        if (!isCurrent) return;
        if (error) throw new Error(error);
        setCountries(data || []);
      } catch (error) {
        console.error('Failed to load address countries:', error);
        if (isCurrent) setCountriesError(true);
      } finally {
        if (isCurrent) setCountriesLoading(false);
      }
    };

    void loadCountries();
    return () => {
      isCurrent = false;
    };
  }, []);

  const requiredFields = [
    'fullName',
    'phoneNumber',
    'email',
    'country',
    'streetAddress1',
    'city',
    'state',
    'postalCode',
  ];

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    requiredFields.forEach((field) => {
      if (!formData[field as keyof Address] || formData[field as keyof Address] === '') {
        newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
      }
    });

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Phone validation (basic)
    if (formData.phoneNumber && !/^\+?[\d\s\-()]{7,}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      const finalData: Address = {
        id: initialData?.id || `addr_${Date.now()}`,
        fullName: formData.fullName || '',
        phoneNumber: formData.phoneNumber || '',
        email: formData.email || '',
        country: formData.country || '',
        streetAddress1: formData.streetAddress1 || '',
        streetAddress2: formData.streetAddress2 || '',
        city: formData.city || '',
        state: formData.state || '',
        postalCode: formData.postalCode || '',
        addressType: (formData.addressType as 'home' | 'work' | 'other') || 'home',
        deliveryNotes: formData.deliveryNotes || '',
        isDefault: formData.isDefault || false,
        createdAt: initialData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onSubmit(finalData);
    }
  };

  const inputClass = (field: string) =>
    `addr-input ${errors[field] ? 'addr-input--error' : ''}`;

  const typeOptions: Array<{ value: 'home' | 'work' | 'other'; label: string; icon: React.ReactNode }> = [
    { value: 'home', label: 'Home', icon: <Home size={14} /> },
    { value: 'work', label: 'Work', icon: <Briefcase size={14} /> },
    { value: 'other', label: 'Other', icon: <MoreHorizontal size={14} /> },
  ];

  const renderError = (field: string) =>
    errors[field] ? <p className="addr-error">{errors[field]}</p> : null;

  return (
      <form onSubmit={handleSubmit} className="addr-form" noValidate>
        <div>
          <h1 className="addr-page-title">{initialData ? 'Edit your address' : 'Add a new address'}</h1>
          <p className="addr-subtitle">Enter your delivery address details below. Fields marked with * are required.</p>
        </div>

        <div className="addr-grid">
          <div className="addr-field">
            <label className="addr-label" htmlFor="addr-fullName">Full name <span>*</span></label>
            <input
              id="addr-fullName"
              type="text"
              name="fullName"
              autoComplete="name"
              value={formData.fullName || ''}
              onChange={handleChange}
              className={inputClass('fullName')}
            />
            {renderError('fullName')}
          </div>

          <div className="addr-field">
            <label className="addr-label" htmlFor="addr-phoneNumber">Mobile number <span>*</span></label>
            <input
              id="addr-phoneNumber"
              type="tel"
              name="phoneNumber"
              autoComplete="tel"
              value={formData.phoneNumber || ''}
              onChange={handleChange}
              placeholder="+44 7700 900000"
              className={inputClass('phoneNumber')}
            />
            {renderError('phoneNumber')}
          </div>

          <div className="addr-field">
            <label className="addr-label" htmlFor="addr-email">Email address <span>*</span></label>
            <input
              id="addr-email"
              type="email"
              name="email"
              autoComplete="email"
              value={formData.email || ''}
              onChange={handleChange}
              className={inputClass('email')}
            />
            {renderError('email')}
          </div>

          <div className="addr-field">
            <label className="addr-label" htmlFor="addr-country">Country / Region <span>*</span></label>
            <select
              id="addr-country"
              name="country"
              value={formData.country || ''}
              onChange={handleChange}
              disabled={countriesLoading}
              className={inputClass('country')}
            >
              <option value="">Select a country</option>
              {formData.country && !countries.some((country) => country.country_name === formData.country) && (
                <option value={formData.country}>{formData.country}</option>
              )}
              {countries.map((country) => (
                <option key={country.id} value={country.country_name}>
                  {country.country_name}
                </option>
              ))}
            </select>
            {countriesError && (
              <p className="addr-error">Unable to load countries. Please refresh and try again.</p>
            )}
            {renderError('country')}
          </div>

          <div className="addr-field">
            <label className="addr-label" htmlFor="addr-streetAddress1">
              Flat, house no., building, company <span>*</span>
            </label>
            <input
              id="addr-streetAddress1"
              type="text"
              name="streetAddress1"
              autoComplete="address-line1"
              value={formData.streetAddress1 || ''}
              onChange={handleChange}
              className={inputClass('streetAddress1')}
            />
            {renderError('streetAddress1')}
          </div>

          <div className="addr-field">
            <label className="addr-label" htmlFor="addr-streetAddress2">
              Area, street, village, landmark <span className="addr-optional">(optional)</span>
            </label>
            <input
              id="addr-streetAddress2"
              type="text"
              name="streetAddress2"
              autoComplete="address-line2"
              value={formData.streetAddress2 || ''}
              onChange={handleChange}
              className="addr-input"
            />
          </div>

          <div className="addr-field addr-field--third">
            <label className="addr-label" htmlFor="addr-city">Town / City <span>*</span></label>
            <input
              id="addr-city"
              type="text"
              name="city"
              autoComplete="address-level2"
              value={formData.city || ''}
              onChange={handleChange}
              className={inputClass('city')}
            />
            {renderError('city')}
          </div>

          <div className="addr-field addr-field--third">
            <label className="addr-label" htmlFor="addr-state">State / Province <span>*</span></label>
            <input
              id="addr-state"
              type="text"
              name="state"
              autoComplete="address-level1"
              value={formData.state || ''}
              onChange={handleChange}
              className={inputClass('state')}
            />
            {renderError('state')}
          </div>

          <div className="addr-field addr-field--third">
            <label className="addr-label" htmlFor="addr-postalCode">PIN / ZIP code <span>*</span></label>
            <input
              id="addr-postalCode"
              type="text"
              name="postalCode"
              autoComplete="postal-code"
              value={formData.postalCode || ''}
              onChange={handleChange}
              className={inputClass('postalCode')}
            />
            {renderError('postalCode')}
          </div>

          <div className="addr-field addr-field--full">
            <label className="addr-label" htmlFor="addr-deliveryNotes">
              Delivery instructions <span className="addr-optional">(optional)</span>
            </label>
            <input
              id="addr-deliveryNotes"
              type="text"
              name="deliveryNotes"
              value={formData.deliveryNotes || ''}
              onChange={handleChange}
              placeholder="Leave at door, call before delivery, gate code..."
              className="addr-input"
            />
          </div>
        </div>

        <div className="addr-footer">
          <div className="addr-type-group" role="radiogroup" aria-label="Address type">
            {typeOptions.map((option) => {
              const selected = formData.addressType === option.value;
              return (
                <label key={option.value} className={`addr-type-chip ${selected ? 'addr-type-chip--active' : ''}`}>
                  <input
                    type="radio"
                    name="addressType"
                    value={option.value}
                    checked={selected}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  {option.icon}
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <label className="addr-default">
            <input
              type="checkbox"
              name="isDefault"
              checked={formData.isDefault || false}
              onChange={handleChange}
            />
            <span>Set as default address</span>
          </label>
          <div className="addr-actions">
            <button type="submit" disabled={isLoading} className="addr-btn addr-btn--primary">
              {isLoading ? 'Saving...' : initialData ? 'Update address' : 'Save address'}
            </button>
            <button type="button" onClick={onCancel} className="addr-btn addr-btn--secondary">
              Cancel
            </button>
          </div>
        </div>
      </form>
  );
};

export default AddressForm;
