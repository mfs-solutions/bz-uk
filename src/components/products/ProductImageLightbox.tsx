import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  productName: string;
  onIndexChange?: (index: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

export const ProductImageLightbox: React.FC<Props> = ({
  images,
  initialIndex,
  open,
  onClose,
  productName,
  onIndexChange,
}) => {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
      setZoom(MIN_ZOOM);
      setPan({ x: 0, y: 0 });
    }
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) goPrev();
      if (e.key === 'ArrowRight' && images.length > 1) goNext();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, index, images.length, onClose]);

  const resetTransform = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  const goPrev = () => {
    const next = index === 0 ? images.length - 1 : index - 1;
    setIndex(next);
    onIndexChange?.(next);
    resetTransform();
  };

  const goNext = () => {
    const next = index === images.length - 1 ? 0 : index + 1;
    setIndex(next);
    onIndexChange?.(next);
    resetTransform();
  };

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2));
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= MIN_ZOOM) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panStart.current || zoom <= MIN_ZOOM) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  };

  const onPointerUp = () => {
    panStart.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStart.current = { distance, zoom };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchStart.current) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / pinchStart.current.distance;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(pinchStart.current.zoom * ratio).toFixed(2)));
    setZoom(next);
    if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
  };

  const onTouchEnd = () => {
    pinchStart.current = null;
  };

  if (!open || images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} image viewer`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        {images.length > 1 && (
          <span className="text-xs font-semibold tabular-nums text-white/80">
            {index + 1} / {images.length}
          </span>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="rounded-lg bg-white/10 p-2.5 text-white hover:bg-white/20 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut size={20} />
          </button>
          <span className="min-w-[3rem] text-center text-xs font-semibold tabular-nums text-white/80">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="rounded-lg bg-white/10 p-2.5 text-white hover:bg-white/20 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn size={20} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 z-10 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25 sm:left-4"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 z-10 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25 sm:right-4"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
        <div
          className="flex h-full w-full touch-none items-center justify-center"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <img
            src={images[index] || ''}
            alt={productName}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-150 ease-out"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
