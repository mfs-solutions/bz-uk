import React from 'react';
import { Header, type HeaderDetectedLocation } from './Header';
import { Search } from './Search';

interface StorefrontHeaderProps {
  enableLocationAutoDetect?: boolean;
  onLocationDetected?: (location: HeaderDetectedLocation) => void;
}

/**
 * Shared customer browsing header: keeps the existing homepage search bar
 * behavior identical across all storefront browsing pages.
 */
export const StorefrontHeader: React.FC<StorefrontHeaderProps> = ({
  enableLocationAutoDetect,
  onLocationDetected,
}) => {
  return (
    <>
      <Header
        enableLocationAutoDetect={enableLocationAutoDetect}
        onLocationDetected={onLocationDetected}
      />
      <Search />
    </>
  );
};
