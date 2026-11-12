import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCarousel } from '../components/layout/HeroCarousel';
import { writeHomeHeroBannersCache } from '../lib/homePageCache';

const { order } = vi.hoisted(() => ({ order: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ order }) }),
      }),
    }),
  },
}));

describe('hero carousel', () => {
  beforeEach(() => {
    localStorage.clear();
    order.mockReset();
  });

  it('renders cached banners immediately and refreshes them from Supabase', async () => {
    writeHomeHeroBannersCache([{ id: 'old', image: '/old.jpg', alt: 'Cached offer', link: '' }]);
    let resolveRequest!: (value: unknown) => void;
    order.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));

    render(<HeroCarousel />);
    expect(screen.getByAltText('Cached offer')).toHaveAttribute('src', '/old.jpg');
    resolveRequest({
      data: [
        { id: 'new', image_url: '/new.jpg', title: 'New offer', link: '/offer' },
        { id: 'next', image_url: '/next.jpg', title: 'Next offer', link: '' },
      ],
      error: null,
    });

    const first = await screen.findByAltText('New offer');
    const next = screen.getByAltText('Next offer');
    expect(first).toHaveAttribute('loading', 'eager');
    expect(next).toHaveAttribute('loading', 'lazy');
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(next).toHaveAttribute('loading', 'eager');
  });

  it('keeps cached banners when refresh fails', async () => {
    writeHomeHeroBannersCache([{ id: 'old', image: '/old.jpg', alt: 'Cached offer', link: '' }]);
    order.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<HeroCarousel />);
      await waitFor(() => expect(consoleError).toHaveBeenCalled());
      expect(screen.getByAltText('Cached offer')).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rotates hero banners after 15 seconds, not before', () => {
    vi.useFakeTimers();
    try {
      writeHomeHeroBannersCache([
        { id: 'first', image: '/first.jpg', alt: 'First', link: '' },
        { id: 'second', image: '/second.jpg', alt: 'Second', link: '' },
      ]);
      order.mockReturnValue(new Promise(() => {}));
      const { unmount } = render(<HeroCarousel />);

      expect(screen.getByAltText('First')).toHaveAttribute('loading', 'eager');
      act(() => vi.advanceTimersByTime(14999));
      expect(screen.getByAltText('First')).toHaveAttribute('loading', 'eager');
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByAltText('Second')).toHaveAttribute('loading', 'eager');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
