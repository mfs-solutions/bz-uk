import { useEffect, useRef } from 'react';

// Loader script is injected in index.html with this publisher id. Keep in sync.
const ADSENSE_CLIENT =
  (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() ||
  'ca-pub-5485098198270460';

interface Props {
  slot: string;
  format?: string;
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const AdSenseSlot: React.FC<Props> = ({
  slot,
  format = 'auto',
  responsive = true,
  className,
  style,
}) => {
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!slot) return;
    if (pushed.current) return;
    try {
      // @ts-expect-error adsbygoogle is injected by the static loader script
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded yet or blocked — silently ignore.
    }
  }, [slot]);

  if (!slot) return null;

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle ${className || ''}`}
      style={style || { display: 'block' }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  );
};
