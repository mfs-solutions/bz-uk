import type { CSSProperties, ReactNode } from 'react';

// ============================================================================
// Skeleton loader primitives + composites.
// Style matches the app convention: Tailwind `animate-pulse` on muted gray
// blocks. Use these instead of spinners for content-fetch loading states
// (grids, lists, tables, detail pages, forms, dashboards, full pages).
// Keep real spinners for button submit / inline action states.
// ============================================================================

type Rounded = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

const ROUNDED: Record<Rounded, string> = {
  none: '',
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  rounded?: Rounded;
}

/** Base pulsing block. Compose these to build any skeleton shape. */
export function Skeleton({ className = '', style, rounded = 'md' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-gray-200 ${ROUNDED[rounded]} ${className}`}
      style={style}
    />
  );
}

/** A run of text lines with the last line shortened, like a paragraph. */
export function SkeletonText({
  lines = 3,
  className = '',
  lineClassName = 'h-3',
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          rounded="sm"
          className={`${lineClassName} ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/** Single product card placeholder — mirrors ProductCard layout. */
export function ProductCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl overflow-hidden ${className}`}>
      <Skeleton rounded="none" className="aspect-[3/4] w-full" />
      <div className="p-3 space-y-2">
        <Skeleton rounded="sm" className="h-3 w-11/12" />
        <Skeleton rounded="sm" className="h-3 w-2/3" />
        <Skeleton rounded="sm" className="h-4 w-1/2 mt-1" />
      </div>
    </div>
  );
}

/** Responsive grid of product card skeletons. */
export function ProductGridSkeleton({
  count = 8,
  className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Vertical list of row placeholders (orders, notifications, addresses…). */
export function ListSkeleton({
  rows = 5,
  withAvatar = true,
  withThumb = false,
  className = '',
  rowClassName = '',
}: {
  rows?: number;
  withAvatar?: boolean;
  withThumb?: boolean;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 sm:p-4 ${rowClassName}`}
        >
          {withThumb && <Skeleton rounded="lg" className="w-16 h-16 flex-shrink-0" />}
          {withAvatar && !withThumb && <Skeleton rounded="full" className="w-10 h-10 flex-shrink-0" />}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton rounded="sm" className="h-3.5 w-1/2" />
            <Skeleton rounded="sm" className="h-3 w-3/4" />
            <Skeleton rounded="sm" className="h-2.5 w-1/3" />
          </div>
          <Skeleton rounded="md" className="h-6 w-16 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Data table placeholder with a header row and body rows. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  className = '',
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      <div
        className="bg-gray-50 border-b border-gray-200 px-4 py-3 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} rounded="sm" className="h-3 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="px-4 py-4 border-b border-gray-100 grid gap-3 items-center"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              rounded="sm"
              className={`h-3 ${c === 0 ? 'w-11/12' : 'w-2/3'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Row of dashboard stat-card placeholders. */
export function StatCardsSkeleton({
  count = 4,
  className = 'grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <Skeleton rounded="sm" className="h-3 w-1/2" />
          <Skeleton rounded="md" className="h-6 sm:h-7 w-2/3" />
          <Skeleton rounded="sm" className="h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Form placeholder — label + field pairs, with an optional submit bar. */
export function FormSkeleton({
  fields = 5,
  className = '',
  withSubmit = true,
}: {
  fields?: number;
  className?: string;
  withSubmit?: boolean;
}) {
  return (
    <div className={`space-y-5 ${className}`}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton rounded="sm" className="h-3 w-32" />
          <Skeleton rounded="lg" className="h-10 w-full" />
        </div>
      ))}
      {withSubmit && <Skeleton rounded="lg" className="h-11 w-40" />}
    </div>
  );
}

/** Product/order detail placeholder — media block beside info column. */
export function DetailSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 ${className}`}>
      <Skeleton rounded="2xl" className="aspect-square w-full" />
      <div className="space-y-4">
        <Skeleton rounded="sm" className="h-6 w-3/4" />
        <Skeleton rounded="sm" className="h-4 w-1/3" />
        <Skeleton rounded="md" className="h-8 w-1/2 mt-2" />
        <SkeletonText lines={4} className="mt-4" />
        <div className="flex gap-3 pt-4">
          <Skeleton rounded="lg" className="h-12 w-40" />
          <Skeleton rounded="lg" className="h-12 w-40" />
        </div>
      </div>
    </div>
  );
}

/**
 * Neutral full-page skeleton shell (header bar + content blocks). Use for
 * route-level / Suspense / auth-gating loaders where the final layout is
 * unknown. `variant` tweaks the content body shape.
 */
export function PageSkeleton({
  variant = 'list',
  children,
  className = '',
}: {
  variant?: 'grid' | 'list' | 'detail' | 'form' | 'table' | 'plain';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <Skeleton rounded="md" className="h-8 w-8" />
          <Skeleton rounded="sm" className="h-5 w-40" />
          <div className="flex-1" />
          <Skeleton rounded="full" className="h-8 w-8" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {children ??
          (variant === 'grid' ? (
            <ProductGridSkeleton count={8} />
          ) : variant === 'detail' ? (
            <DetailSkeleton />
          ) : variant === 'form' ? (
            <div className="max-w-xl">
              <FormSkeleton fields={6} />
            </div>
          ) : variant === 'table' ? (
            <TableSkeleton rows={8} columns={5} />
          ) : variant === 'plain' ? (
            <div className="space-y-4">
              <Skeleton rounded="lg" className="h-40 w-full" />
              <SkeletonText lines={6} />
            </div>
          ) : (
            <ListSkeleton rows={6} />
          ))}
      </div>
    </div>
  );
}

export default Skeleton;
