import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { readHomeHeroBannersCache, writeHomeHeroBannersCache, type HomeHeroBanner } from '../../lib/homePageCache';

export const HeroCarousel: React.FC = () => {
  const [cachedBanners] = useState(readHomeHeroBannersCache);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [banners, setBanners] = useState<HomeHeroBanner[]>(() => cachedBanners?.value || []);
  const [loaded, setLoaded] = useState(Boolean(cachedBanners));

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => { if (!cancelled) setLoaded(true); }, 5000);
    supabase
      .from('banners')
      .select('id, title, image_url, link')
      .eq('is_active', true)
      .eq('banner_type', 'hero')
      .order('position', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load hero banners:', error);
        } else {
          const nextBanners = (data || []).map((b) => ({
            id: b.id,
            image: b.image_url,
            alt: b.title,
            link: b.link || '',
          }));
          setBanners(nextBanners);
          setCurrentSlide((current) => Math.min(current, Math.max(nextBanners.length - 1, 0)));
          writeHomeHeroBannersCache(nextBanners);
        }
        setLoaded(true);
      });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 15000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % banners.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const removeBrokenBanner = (bannerId: string) => {
    setBanners((prev) => {
      const next = prev.filter((b) => b.id !== bannerId);
      setCurrentSlide((s) => Math.min(s, Math.max(next.length - 1, 0)));
      return next;
    });
  };

  const renderSlideImage = (banner: HomeHeroBanner, index: number) => {
    const img = (
      <img
        src={banner.image}
        alt={banner.alt}
        loading={index === currentSlide ? 'eager' : 'lazy'}
        fetchPriority={index === currentSlide ? 'high' : 'low'}
        decoding="async"
        className="h-full w-full object-cover object-center"
        onError={() => removeBrokenBanner(banner.id)}
      />
    );

    if (banner.link) {
      return (
        <a href={banner.link} className="block h-full w-full">
          {img}
        </a>
      );
    }

    return img;
  };

  if (!loaded) {
    return (
      <section className="px-4 sm:px-6 lg:px-8 pt-3 pb-1">
        <div className="mx-auto max-w-7xl">
          <div className="h-[180px] animate-pulse rounded-2xl bg-[#1e293b] sm:h-[220px] md:h-[280px] lg:h-[320px]" />
        </div>
      </section>
    );
  }

  if (banners.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 pt-3 pb-1">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-2xl bg-[#1e293b] shadow-md">
          <div className="relative h-[180px] w-full sm:h-[220px] md:h-[280px] lg:h-[320px]">
            <div
              className="flex h-full w-full transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {banners.map((banner, index) => (
                <div key={banner.id} className="h-full w-full flex-shrink-0">
                  {renderSlideImage(banner, index)}
                </div>
              ))}
            </div>

            {banners.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Previous slide"
                  className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60 sm:h-10 sm:w-10"
                >
                  <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Next slide"
                  className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60 sm:h-10 sm:w-10"
                >
                  <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>

                <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                  {banners.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Go to slide ${index + 1}`}
                      onClick={() => setCurrentSlide(index)}
                      className={`h-2 rounded-full transition-all ${
                        index === currentSlide ? 'w-5 bg-white' : 'w-2 bg-white/45 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
