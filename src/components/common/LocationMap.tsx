import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon in bundled environments
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LocationMapProps {
  lat: string;
  lng: string;
  onLocationChange: (lat: string, lng: string) => void;
  disabled?: boolean;
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]; // India center
const DEFAULT_ZOOM = 5;
const SELECTED_ZOOM = 15;

const LocationMap: React.FC<LocationMapProps> = ({ lat, lng, onLocationChange, disabled }) => {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

    const map = L.map(containerRef.current, {
      center: hasCoords ? [parsedLat, parsedLng] : DEFAULT_CENTER,
      zoom: hasCoords ? SELECTED_ZOOM : DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Add marker
    const marker = L.marker(
      hasCoords ? [parsedLat, parsedLng] : DEFAULT_CENTER,
      { draggable: !disabled },
    ).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onLocationChange(pos.lat.toFixed(6), pos.lng.toFixed(6));
    });

    // Click on map to reposition marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (disabled) return;
      marker.setLatLng(e.latlng);
      onLocationChange(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker when lat/lng props change externally
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) return;

    const currentPos = markerRef.current.getLatLng();
    if (Math.abs(currentPos.lat - parsedLat) > 0.00001 || Math.abs(currentPos.lng - parsedLng) > 0.00001) {
      markerRef.current.setLatLng([parsedLat, parsedLng]);
      mapRef.current.setView([parsedLat, parsedLng], Math.max(mapRef.current.getZoom(), SELECTED_ZOOM));
    }
  }, [lat, lng]);

  // Update marker draggable state
  useEffect(() => {
    if (!markerRef.current) return;
    if (disabled) {
      markerRef.current.dragging?.disable();
    } else {
      markerRef.current.dragging?.enable();
    }
  }, [disabled]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.trim())}&limit=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      if (data.length === 0) {
        setSearchError('Location not found. Try a different search.');
        return;
      }
      const { lat: foundLat, lon: foundLon } = data[0];
      onLocationChange(parseFloat(foundLat).toFixed(6), parseFloat(foundLon).toFixed(6));
      if (mapRef.current && markerRef.current) {
        const pos: [number, number] = [parseFloat(foundLat), parseFloat(foundLon)];
        markerRef.current.setLatLng(pos);
        mapRef.current.setView(pos, SELECTED_ZOOM);
      }
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setSearchError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
          placeholder="Search location (city, address, landmark...)"
          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
          disabled={disabled || searching}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={disabled || searching || !searchQuery.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>
      {searchError && <p className="text-xs text-red-500">{searchError}</p>}

      {/* Map container */}
      <div
        ref={containerRef}
        className="w-full rounded-xl border border-gray-200 overflow-hidden"
        style={{ height: '280px' }}
      />

      <p className="text-[11px] text-gray-400">Click on the map or drag the marker to set your location. You can also search above.</p>
    </div>
  );
};

export default LocationMap;
