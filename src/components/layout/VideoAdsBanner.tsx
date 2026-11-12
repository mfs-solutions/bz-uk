import { useState, useEffect } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AdSenseSlot } from '../ads/AdSenseSlot';

const ADSENSE_SLOT_HOME_FOOTER = (import.meta.env.VITE_ADSENSE_SLOT_HOME_FOOTER as string | undefined)?.trim() || '';

interface VideoAd {
  id: string;
  title: string;
  video_url: string;
  is_active: boolean;
  position: number;
}

export const VideoAdsBanner: React.FC = () => {
  const [videoAds, setVideoAds] = useState<VideoAd[]>([]);
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    supabase
      .from('banners')
      .select('id, title, video_url, is_active, position')
      .eq('is_active', true)
      .eq('banner_type', 'video')
      .not('video_url', 'is', null)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setVideoAds(data as VideoAd[]);
        }
      });
  }, []);

  // Auto-rotate if multiple video ads (30s each)
  useEffect(() => {
    if (videoAds.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % videoAds.length);
    }, 30000);
    return () => clearInterval(timer);
  }, [videoAds.length]);

  useEffect(() => {
    if (videoAds.length === 0) return;
    setMediaFailed(false);
  }, [current, videoAds]);

  if (dismissed || videoAds.length === 0) {
    // Fallback: when there are no internal video ads (or user dismissed),
    // show a Google AdSense slot in the same space — but only if the
    // publisher + slot env vars are configured. Otherwise render nothing,
    // matching the original behaviour.
    if (!dismissed && ADSENSE_SLOT_HOME_FOOTER) {
      return (
        <section className="my-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <AdSenseSlot slot={ADSENSE_SLOT_HOME_FOOTER} />
          </div>
        </section>
      );
    }
    return null;
  }

  const ad = videoAds[current];

  // Detect if this is a direct video file (uploaded) or a YouTube embed
  const isDirectVideo = /\.(mp4|webm|mov)(\?|$)/i.test(ad.video_url);
  // Append autoplay + mute params to YouTube embed URL
  const embedSrc = isDirectVideo ? '' : `${ad.video_url}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${ad.video_url.split('/').pop()}&rel=0&modestbranding=1&controls=0&showinfo=0`;

  return (
    <section className="my-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative w-full bg-gray-900 aspect-video overflow-hidden">
          {isDirectVideo ? (
            <video
              key={ad.video_url}
              src={ad.video_url}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              loop
              muted={muted}
              playsInline
              controls
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <iframe
              src={embedSrc}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={ad.title}
              loading="lazy"
              onError={() => setMediaFailed(true)}
            />
          )}

          {mediaFailed && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95 px-4 text-center">
              <p className="text-sm text-white/90">Unable to load this video ad right now.</p>
            </div>
          )}

          {/* Controls overlay — top-right */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
            <button
              onClick={() => setMuted((m) => !m)}
              className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
              title="Dismiss ad"
            >
              <X size={16} />
            </button>
          </div>

          {/* Pagination dots if multiple video ads */}
          {videoAds.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {videoAds.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-white scale-125' : 'bg-white/50'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
