import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import {
  applySizePresetOverrides,
  getSizePresetVersion,
  subscribeSizePresets,
  type SizeChart,
  type SizeOption,
} from '../config/variantThemeConfig';

interface VariantSizePresetRow {
  preset_key: string;
  position: number | null;
  value: string;
  label: string;
  chart: SizeChart | null;
}

let loadPromise: Promise<void> | null = null;

/**
 * Load editable size presets from the database and override the hardcoded
 * defaults in variantThemeConfig. Safe to call multiple times — the network
 * request runs at most once. Any failure leaves the hardcoded defaults intact,
 * so the size dropdowns and size guide never break.
 */
export function loadVariantSizePresets(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('variant_size_presets')
        .select('preset_key, position, value, label, chart')
        .eq('is_active', true)
        .order('preset_key', { ascending: true })
        .order('position', { ascending: true });

      if (error || !data) return;

      const grouped: Record<string, SizeOption[]> = {};
      for (const row of data as VariantSizePresetRow[]) {
        const key = String(row.preset_key || '').trim();
        if (!key || !row.value) continue;
        if (!grouped[key]) grouped[key] = [];
        const option: SizeOption = {
          value: String(row.value),
          label: String(row.label || row.value),
        };
        if (row.chart && typeof row.chart === 'object') {
          option.chart = row.chart;
        }
        grouped[key].push(option);
      }

      applySizePresetOverrides(grouped);
    } catch {
      // Keep hardcoded defaults on any failure.
    }
  })();

  return loadPromise;
}

/**
 * React hook returning a version number that changes when DB presets are
 * applied. Include it in dependency arrays (or just call it to subscribe) so a
 * component re-resolves its variant theme once the DB overrides load.
 */
export function useVariantPresetsVersion(): number {
  return useSyncExternalStore(
    subscribeSizePresets,
    getSizePresetVersion,
    getSizePresetVersion,
  );
}
