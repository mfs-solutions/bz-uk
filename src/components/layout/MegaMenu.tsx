import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ChevronRight } from 'lucide-react';
import { fetchCategoryTree, type CategoryNode } from '../../lib/productService';

/* ------------------------------------------------------------------ */
/*  Amazon-style 3-level Mega Menu                                     */
/*  Desktop : hover-triggered dropdown                                */
/*  Mobile  : full-screen slide panel                                 */
/* ------------------------------------------------------------------ */

export const MegaMenu: React.FC = () => {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [activeMain, setActiveMain] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDrill, setMobileDrill] = useState<CategoryNode | null>(null);
  const [mobileDept, setMobileDept] = useState<CategoryNode | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  /* ---- Fetch once ------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;

    const loadTree = async (attempt = 0) => {
      const { data, error } = await fetchCategoryTree();
      if (cancelled) return;

      if (!error && data.length > 0) {
        setTree(data);
        return;
      }

      if (attempt < 2) {
        setTimeout(() => {
          void loadTree(attempt + 1);
        }, 1000 * (attempt + 1));
      }
    };

    void loadTree();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Desktop hover handlers ------------------------------------ */
  const handleMainEnter = useCallback((id: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveMain(id);
  }, []);

  const handleMainLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setActiveMain(null), 200);
  }, []);

  const handleDropdownEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const handleDropdownLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setActiveMain(null), 200);
  }, []);

  /* Close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveMain(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Close mobile panel on route change (link click) */
  const closeMobile = () => {
    setMobileDrill(null);
    setMobileDept(null);
    setMobileOpen(false);
  };

  const activeCat = tree.find((c) => c.id === activeMain);

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <>
      {/* ======== DESKTOP NAV BAR ======== */}
      <nav
        ref={barRef}
        className="hidden md:block bg-[#1e293b] relative z-40"
        onMouseLeave={handleMainLeave}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-10 space-x-1 overflow-x-auto scrollbar-hide"
               style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* "All" button — opens side panel like Amazon */}
            <button
              className="flex items-center px-3 py-1 text-sm font-semibold text-white hover:bg-white/10 rounded transition whitespace-nowrap"
              onClick={() => {
                setMobileOpen(true);
                setMobileDrill(null);
                setMobileDept(null);
              }}
              onMouseEnter={() => {
                if (tree.length > 0) handleMainEnter(tree[0].id);
              }}
            >
              <Menu className="h-4 w-4 mr-1.5" />
              All
            </button>

            <div className="w-px h-5 bg-white/20" />

            {tree.map((main) => (
              <button
                key={main.id}
                onMouseEnter={() => handleMainEnter(main.id)}
                className={`px-3 py-1 text-sm font-medium rounded transition whitespace-nowrap ${
                  activeMain === main.id
                    ? 'bg-white/15 text-amber-300'
                    : 'text-gray-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                {main.name}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Desktop dropdown panel ---- */}
        {activeMain && activeCat && activeCat.children && activeCat.children.length > 0 && (
          <div
            className="absolute left-0 right-0 bg-white border-t border-gray-200 shadow-xl z-50"
            onMouseEnter={handleDropdownEnter}
            onMouseLeave={handleDropdownLeave}
          >
            <div className="max-w-7xl mx-auto px-6 py-6">
              {/* Category heading */}
              <Link
                to={`/category/${activeCat.slug}`}
                className="inline-block text-lg font-bold text-gray-900 hover:text-amber-600 transition mb-4"
                onClick={() => setActiveMain(null)}
              >
                {activeCat.name}
              </Link>

              {/* Departments grid — 3 to 5 columns based on count */}
              <div
                className={`grid gap-x-8 gap-y-6 ${
                  activeCat.children.length <= 3
                    ? 'grid-cols-3'
                    : activeCat.children.length <= 4
                    ? 'grid-cols-4'
                    : 'grid-cols-5'
                }`}
              >
                {activeCat.children.map((dept) => (
                  <div key={dept.id}>
                    <Link
                      to={`/category/${dept.slug}`}
                      className="block text-sm font-bold text-gray-900 hover:text-amber-600 transition mb-2 pb-1 border-b border-gray-100"
                      onClick={() => setActiveMain(null)}
                    >
                      {dept.name}
                    </Link>
                    {dept.children && dept.children.length > 0 && (
                      <ul className="space-y-1">
                        {dept.children.map((sub) => (
                          <li key={sub.id}>
                            <Link
                              to={`/category/${sub.slug}`}
                              className="block text-sm text-gray-600 hover:text-amber-600 transition py-0.5"
                              onClick={() => setActiveMain(null)}
                            >
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ======== MOBILE: Category bar + "All" trigger ======== */}
      <div className="md:hidden bg-[#1e293b]">
        <div className="flex items-center h-10 px-4 space-x-2 overflow-x-auto scrollbar-hide"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center px-3 py-1 text-sm font-semibold text-white bg-white/10 rounded whitespace-nowrap"
          >
            <Menu className="h-4 w-4 mr-1.5" />
            All
          </button>

          <div className="w-px h-5 bg-white/20 flex-shrink-0" />

          {tree.map((main) => (
            <button
              key={main.id}
              onClick={() => {
                setMobileDrill(main);
                setMobileDept(null);
                setMobileOpen(true);
              }}
              className="px-3 py-1 text-sm font-medium text-gray-200 rounded whitespace-nowrap hover:bg-white/10"
            >
              {main.name}
            </button>
          ))}
        </div>
      </div>

      {/* ======== Side panel (mobile + desktop "All" click) ======== */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeMobile}
          />

          {/* Panel */}
          <div className="relative w-[85vw] max-w-sm bg-white h-full overflow-y-auto animate-slideInLeft">
            {/* Panel header */}
            <div className="sticky top-0 bg-[#0f172a] text-white px-4 py-3 flex items-center justify-between z-10">
              {mobileDrill ? (
                <button
                  onClick={() => {
                    if (mobileDept) {
                      setMobileDept(null);
                    } else {
                      setMobileDrill(null);
                    }
                  }}
                  className="flex items-center text-sm font-medium"
                >
                  <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
                  Back
                </button>
              ) : (
                <span className="font-bold text-sm">Shop by Category</span>
              )}
              <button onClick={closeMobile}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Panel heading */}
            {mobileDrill && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <Link
                  to={`/category/${mobileDept?.slug || mobileDrill.slug}`}
                  className="text-base font-bold text-gray-900 hover:text-amber-600"
                  onClick={closeMobile}
                >
                  {mobileDept ? mobileDept.name : mobileDrill.name}
                </Link>
              </div>
            )}

            {/* LIST */}
            <ul className="divide-y divide-gray-100">
              {/* Level: all main categories */}
              {!mobileDrill &&
                tree.map((main) => (
                  <li key={main.id}>
                    <button
                      onClick={() => {
                        setMobileDrill(main);
                        setMobileDept(null);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                    >
                      <span className="font-medium">{main.name}</span>
                      {main.children && main.children.length > 0 && (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </li>
                ))}

              {/* Level: departments inside a main category */}
              {mobileDrill && !mobileDept && (
                <>
                  {/* "See all" link */}
                  <li>
                    <Link
                      to={`/category/${mobileDrill.slug}`}
                      className="block px-4 py-3 text-sm font-semibold text-amber-600 hover:bg-amber-50"
                      onClick={closeMobile}
                    >
                      See all in {mobileDrill.name}
                    </Link>
                  </li>
                  {mobileDrill.children?.map((dept) => (
                    <li key={dept.id}>
                      {dept.children && dept.children.length > 0 ? (
                        <button
                          onClick={() => setMobileDept(dept)}
                          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                        >
                          <span>{dept.name}</span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </button>
                      ) : (
                        <Link
                          to={`/category/${dept.slug}`}
                          className="block px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                          onClick={closeMobile}
                        >
                          {dept.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </>
              )}

              {/* Level: subcategories inside a department */}
              {mobileDept && (
                <>
                  <li>
                    <Link
                      to={`/category/${mobileDept.slug}`}
                      className="block px-4 py-3 text-sm font-semibold text-amber-600 hover:bg-amber-50"
                      onClick={closeMobile}
                    >
                      See all in {mobileDept.name}
                    </Link>
                  </li>
                  {mobileDept.children?.map((sub) => (
                    <li key={sub.id}>
                      <Link
                        to={`/category/${sub.slug}`}
                        className="block px-4 py-3 text-sm text-gray-800 hover:bg-gray-50"
                        onClick={closeMobile}
                      >
                        {sub.name}
                      </Link>
                    </li>
                  ))}
                </>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Slide-in animation */}
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        .animate-slideInLeft {
          animation: slideInLeft 0.25s ease-out;
        }
      `}</style>
    </>
  );
};
