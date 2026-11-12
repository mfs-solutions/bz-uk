import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search as SearchIcon, Clock, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchPublicProductsByKeywords, resolveProductImageUrl, isBlobUrl } from '../../lib/productService';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// ── Constants ──────────────────────────────────────────────────────────────
const GUEST_HISTORY_KEY = 'bzead_search_history';
const GUEST_HISTORY_MAX = 20; // store up to 20 for migration coverage
const DISPLAY_LIMIT = 5;
const SUGGESTION_CACHE_LIMIT = 100;
const SUGGESTION_CACHE_TTL_MS = 5 * 60 * 1000;
const SUGGESTION_MIN_QUERY_LENGTH = 2;

// ── Types ──────────────────────────────────────────────────────────────────
interface SearchSuggestion {
  id: string;
  public_product_id?: string;
  name: string;
  slug?: string;
  brand?: string;
  image_url?: string;
  category?: string | null;
  sub_category?: string | null;
  product_type?: string | null;
}

interface SearchHistoryItem {
  id: string;
  typed_input: string;
  is_product_click: boolean;
  product_id?: string | null;
  product_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  sub_category_id?: string | null;
  sub_category_name?: string | null;
  product_type_id?: string | null;
  product_type_name?: string | null;
  user_location?: string | null;
  user_country?: string | null;
  searched_at: string;
}

// ── Pure helpers (no hooks) ────────────────────────────────────────────────
function getLocationData(): { user_location: string | null; user_country: string | null } {
  try {
    const raw = localStorage.getItem('beauzead_detected_location');
    if (!raw) return { user_location: null, user_country: null };
    const parsed = JSON.parse(raw);
    const parts = [parsed.city, parsed.state, parsed.country].filter(Boolean);
    return {
      user_location: parts.length > 0 ? parts.join(', ') : null,
      user_country: parsed.country || null,
    };
  } catch {
    return { user_location: null, user_country: null };
  }
}

function readGuestHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(GUEST_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchHistoryItem[];
  } catch {
    return [];
  }
}

function writeGuestHistory(item: SearchHistoryItem): void {
  try {
    const existing = readGuestHistory();
    const updated = [item, ...existing].slice(0, GUEST_HISTORY_MAX);
    localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

function deleteGuestHistoryByQuery(typedInput: string): void {
  try {
    const existing = readGuestHistory();
    const filtered = existing.filter(
      (e) => e.typed_input.toLowerCase() !== typedInput.toLowerCase(),
    );
    localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(filtered));
  } catch {
    // Search history is optional when browser storage is unavailable.
  }
}

function clearGuestHistory(): void {
  try {
    localStorage.removeItem(GUEST_HISTORY_KEY);
  } catch {
    // Search history is optional when browser storage is unavailable.
  }
}

/** Keep first (most-recent) occurrence of each typed_input */
function deduplicateHistory(items: SearchHistoryItem[]): SearchHistoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.typed_input.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveCategoryNames(
  categoryId?: string | null,
  subCategoryId?: string | null,
  productTypeId?: string | null,
): Promise<{ categoryName?: string; subCategoryName?: string; productTypeName?: string }> {
  const ids = [categoryId, subCategoryId, productTypeId].filter(Boolean) as string[];
  if (ids.length === 0) return {};
  try {
    const { data } = await supabase.from('categories').select('id, name').in('id', ids);
    const map = new Map((data || []).map((c: any) => [c.id as string, c.name as string]));
    return {
      categoryName: categoryId ? map.get(categoryId) : undefined,
      subCategoryName: subCategoryId ? map.get(subCategoryId) : undefined,
      productTypeName: productTypeId ? map.get(productTypeId) : undefined,
    };
  } catch {
    return {};
  }
}

// ── Session-level suggestion cache (lives as long as the page is open) ──────
// Keyed by lowercase normalized query → avoids hitting DB for repeated /
// revisited search terms within the same browsing session.
const _suggestionCache = new Map<string, { data: SearchSuggestion[]; expiresAt: number }>();

// ── Component ──────────────────────────────────────────────────────────────
export const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsStatus, setSuggestionsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionRequestId = useRef(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setShowDropdown(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, []);

  // ── Live product suggestions ──
  useEffect(() => {
    const value = query.trim().replace(/\s+/g, ' ');
    const requestId = ++suggestionRequestId.current;
    if (value.length < SUGGESTION_MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSuggestionsStatus('idle');
      setActiveSuggestionIndex(-1);
      return;
    }

    const cacheKey = value.toLowerCase();
    const cached = _suggestionCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      setSuggestions(cached.data);
      setSuggestionsStatus('success');
      setActiveSuggestionIndex(-1);
      return;
    }
    if (cached) _suggestionCache.delete(cacheKey);

    setSuggestions([]);
    setSuggestionsStatus('loading');
    setActiveSuggestionIndex(-1);
    const timer = window.setTimeout(async () => {
      const { data, error } = await searchPublicProductsByKeywords(value, 8);
      if (requestId !== suggestionRequestId.current) return;
      if (error) {
        setSuggestions([]);
        setSuggestionsStatus('error');
        return;
      }
      const results = (data || []) as SearchSuggestion[];
      _suggestionCache.set(cacheKey, { data: results, expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS });
      if (_suggestionCache.size > SUGGESTION_CACHE_LIMIT) {
        const oldestKey = _suggestionCache.keys().next().value;
        if (oldestKey) _suggestionCache.delete(oldestKey);
      }
      setSuggestions(results);
      setSuggestionsStatus('success');
      setActiveSuggestionIndex(-1);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  // ── Fetch search history (called on every input focus) ──
  const fetchHistory = useCallback(async () => {
    if (userId) {
      setHistoryLoading(true);
      try {
        const { data } = await supabase
          .from('user_search_history')
          .select('*')
          .eq('user_id', userId)
          .order('searched_at', { ascending: false })
          .limit(20);
        const deduped = deduplicateHistory((data || []) as SearchHistoryItem[]).slice(0, DISPLAY_LIMIT);
        setSearchHistory(deduped);
      } catch {
        setSearchHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    } else {
      const items = deduplicateHistory(readGuestHistory()).slice(0, DISPLAY_LIMIT);
      setSearchHistory(items);
    }
  }, [userId]);

  // ── Save a history entry ──
  const saveHistory = useCallback(
    async (entry: Omit<SearchHistoryItem, 'id'>) => {
      if (userId) {
        supabase
          .from('user_search_history')
          .insert({
            user_id: userId,
            typed_input: entry.typed_input,
            is_product_click: entry.is_product_click,
            product_id: entry.product_id ?? null,
            product_name: entry.product_name ?? null,
            category_id: entry.category_id ?? null,
            category_name: entry.category_name ?? null,
            sub_category_id: entry.sub_category_id ?? null,
            sub_category_name: entry.sub_category_name ?? null,
            product_type_id: entry.product_type_id ?? null,
            product_type_name: entry.product_type_name ?? null,
            user_location: entry.user_location ?? null,
            user_country: entry.user_country ?? null,
          })
          .then(() => { void fetchHistory(); }, () => {});
      } else {
        const item: SearchHistoryItem = {
          ...entry,
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        };
        writeGuestHistory(item);
        setSearchHistory(deduplicateHistory(readGuestHistory()).slice(0, DISPLAY_LIMIT));
      }
    },
    [userId, fetchHistory],
  );

  // ── Delete all occurrences of a query from history ──
  const deleteHistoryItem = useCallback(
    async (item: SearchHistoryItem, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (userId) {
        await supabase
          .from('user_search_history')
          .delete()
          .eq('user_id', userId)
          .eq('typed_input', item.typed_input);
        fetchHistory();
      } else {
        deleteGuestHistoryByQuery(item.typed_input);
        setSearchHistory(deduplicateHistory(readGuestHistory()).slice(0, DISPLAY_LIMIT));
      }
    },
    [userId, fetchHistory],
  );

  // ── Clear all history ──
  const clearAllHistory = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (userId) {
        await supabase.from('user_search_history').delete().eq('user_id', userId);
        setSearchHistory([]);
      } else {
        clearGuestHistory();
        setSearchHistory([]);
      }
    },
    [userId],
  );

  // ── Submit free-text search ──
  const submitSearch = (rawQuery: string) => {
    const value = rawQuery.trim();
    if (!value) return;
    setShowDropdown(false);
    const { user_location, user_country } = getLocationData();
    saveHistory({
      typed_input: value,
      is_product_click: false,
      user_location,
      user_country,
      searched_at: new Date().toISOString(),
    });
    navigate(`/products/section/featured?search=${encodeURIComponent(value)}`);
  };

  // ── Select a product suggestion ──
  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    const selectedValue = suggestion.name;
    setQuery(selectedValue);
    setShowDropdown(false);
    const productRef = String(suggestion.public_product_id || suggestion.slug || suggestion.id || '').trim();
    const { user_location, user_country } = getLocationData();

    // Navigate immediately
    if (productRef) {
      navigate(`/products/${encodeURIComponent(productRef)}`);
    } else {
      navigate(`/products/section/featured?search=${encodeURIComponent(selectedValue)}`);
    }

    // Resolve category names then save history (non-blocking)
    resolveCategoryNames(suggestion.category, suggestion.sub_category, suggestion.product_type).then(
      ({ categoryName, subCategoryName, productTypeName }) => {
        saveHistory({
          typed_input: selectedValue,
          is_product_click: true,
          product_id: String(suggestion.public_product_id || suggestion.id || ''),
          product_name: suggestion.name,
          category_id: suggestion.category ?? null,
          category_name: categoryName ?? null,
          sub_category_id: suggestion.sub_category ?? null,
          sub_category_name: subCategoryName ?? null,
          product_type_id: suggestion.product_type ?? null,
          product_type_name: productTypeName ?? null,
          user_location,
          user_country,
          searched_at: new Date().toISOString(),
        });
      },
    );
  };

  // ── Click a history item ──
  const handleHistoryItemClick = (item: SearchHistoryItem) => {
    setShowDropdown(false);
    if (item.is_product_click && item.product_id) {
      navigate(`/products/${encodeURIComponent(item.product_id)}`);
    } else {
      navigate(`/products/section/featured?search=${encodeURIComponent(item.typed_input)}`);
    }
  };

  // ── Form submit ──
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
      handleSuggestionSelect(suggestions[activeSuggestionIndex]);
      return;
    }
    submitSearch(query);
  };

  // ── Keyboard navigation ──
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (suggestionsStatus !== 'success' || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => {
        const next = prev + 1;
        return next >= suggestions.length ? 0 : next;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? suggestions.length - 1 : next;
      });
    }
  };

  const showHistoryPanel =
    showDropdown && query.trim() === '' && (historyLoading || searchHistory.length > 0);
  const showSuggestionsPanel =
    showDropdown && query.trim().length >= SUGGESTION_MIN_QUERY_LENGTH;

  return (
    <div
      className="bg-gray-50 border-b border-gray-200 sticky z-[70]"
      style={{ top: 'var(--bz-header-offset)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <form onSubmit={handleSearch} className="flex items-center space-x-2" ref={containerRef} role="search">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 h-4 sm:h-5 w-4 sm:w-5 text-gray-500" />
            <input
              ref={inputRef}
              id="storefront-product-search"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => {
                setShowDropdown(true);
                fetchHistory();
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Search for products, brands..."
              className="w-full pl-9 sm:pl-12 pr-10 py-2 sm:py-3 text-sm sm:text-base bg-white border-2 border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:border-amber-500 transition-colors"
              autoComplete="off"
              role="combobox"
              aria-label="Search products"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={showSuggestionsPanel || showHistoryPanel}
              aria-controls="storefront-search-suggestions"
              aria-activedescendant={
                activeSuggestionIndex >= 0
                  ? `storefront-search-option-${activeSuggestionIndex}`
                  : undefined
              }
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                  setSuggestionsStatus('idle');
                  setActiveSuggestionIndex(-1);
                  setShowDropdown(true);
                  fetchHistory();
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* ── Recent Searches (empty query) ── */}
            {showHistoryPanel && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[70] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Recent Searches
                  </span>
                  {searchHistory.length > 0 && (
                    <button
                      type="button"
                      onMouseDown={clearAllHistory}
                      className="text-xs text-[#007185] hover:underline font-medium"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-4 gap-2 text-gray-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  searchHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer group"
                      onMouseDown={() => handleHistoryItemClick(item)}
                    >
                      <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{item.typed_input}</p>
                        {item.category_name && (
                          <p className="text-xs text-gray-400 truncate">
                            {[item.category_name, item.sub_category_name, item.product_type_name]
                              .filter(Boolean)
                              .join(' › ')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onMouseDown={(e) => deleteHistoryItem(item, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-opacity shrink-0"
                        aria-label="Remove from history"
                      >
                        <X className="h-3.5 w-3.5 text-gray-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Live Product Suggestions (while typing) ── */}
            {showSuggestionsPanel && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[70] overflow-hidden">
                {suggestionsStatus === 'loading' && (
                  <div className="flex items-center justify-center py-4 gap-2 text-gray-500 text-sm" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching products...</span>
                  </div>
                )}
                {suggestionsStatus === 'error' && (
                  <p className="px-4 py-3 text-sm text-red-600" role="status">
                    Search suggestions are temporarily unavailable. Press Go to view results.
                  </p>
                )}
                {suggestionsStatus === 'success' && suggestions.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-500" role="status">
                    No matching products. Press Go to search all products.
                  </p>
                )}
                {suggestionsStatus === 'success' && suggestions.length > 0 && (
                  <ul id="storefront-search-suggestions" role="listbox" aria-label="Product suggestions">
                    {suggestions.map((suggestion, index) => (
                      <li key={suggestion.id} role="presentation">
                        <button
                          id={`storefront-search-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeSuggestionIndex}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSuggestionSelect(suggestion);
                          }}
                          className={`w-full px-3 sm:px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                            index === activeSuggestionIndex ? 'bg-amber-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          {suggestion.image_url && !isBlobUrl(suggestion.image_url) ? (
                            <img
                              src={resolveProductImageUrl(suggestion.image_url)}
                              alt=""
                              className="h-8 w-8 rounded object-cover bg-gray-100"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center">
                              <SearchIcon className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{suggestion.name}</p>
                            {suggestion.brand && (
                              <p className="text-xs text-gray-500 truncate">{suggestion.brand}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="bg-black text-white font-semibold px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-base rounded-lg hover:bg-gray-900 transition-all duration-200 shadow-sm"
          >
            Go
          </button>
        </form>
      </div>
    </div>
  );
};
