/**
 * Returns the correct cart button to target for the fly animation.
 * On mobile (< 768 px) the floating cart bubble is the primary target;
 * on desktop the header cart icon is.
 */
export function getCartTarget(): HTMLElement | null {
  const floating = document.getElementById('floating-cart-btn');
  const header   = document.getElementById('cart-icon');
  if (floating && window.innerWidth < 768) return floating;
  return header || floating;
}

/**
 * Fly-to-cart animation: arcs a thumbnail from the product image to the
 * cart button along a parabolic path, then bounces the cart icon.
 * Returns a Promise that resolves when the flight completes.
 */
export function flyToCart(
  productEl: HTMLElement,
  cartEl: HTMLElement,
): Promise<void> {
  return new Promise((resolve) => {
    const productRect = productEl.getBoundingClientRect();
    const cartRect    = cartEl.getBoundingClientRect();

    // Origin: centre of the product thumbnail
    const startX = productRect.left + productRect.width  / 2;
    const startY = productRect.top  + productRect.height / 2;
    // Destination: centre of the cart button
    const endX   = cartRect.left + cartRect.width  / 2;
    const endY   = cartRect.top  + cartRect.height / 2;

    const dx = endX - startX;
    const dy = endY - startY;

    // Arc height: pull the midpoint up by 35 % of the total distance so the
    // throw curves naturally regardless of direction.
    const dist      = Math.sqrt(dx * dx + dy * dy);
    const arcPull   = Math.max(60, dist * 0.35);
    // Perpendicular offset — always arc "above" (negative screen-Y = upward)
    const arcMidDX  = dx  / 2;
    const arcMidDY  = dy  / 2 - arcPull;

    // Thumbnail starts at product image size, shrinks to a dot
    const startW = Math.min(productRect.width,  80);
    const startH = Math.min(productRect.height, 80);

    const clone = document.createElement('img') as HTMLImageElement;
    clone.src = (productEl as HTMLImageElement).currentSrc
             || (productEl as HTMLImageElement).src
             || '';
    clone.style.cssText = [
      'position: fixed',
      `left: ${startX - startW / 2}px`,
      `top:  ${startY - startH / 2}px`,
      `width:  ${startW}px`,
      `height: ${startH}px`,
      'z-index: 999999',
      'pointer-events: none',
      'border-radius: 10px',
      'object-fit: cover',
      'transform-origin: center',
      'will-change: transform, opacity',
    ].join('; ');

    document.body.appendChild(clone);

    // Parabolic arc via Web Animations API (GPU-accelerated, no layout reflow)
    clone.animate(
      [
        {
          transform: 'translate(0, 0) scale(1) rotate(0deg)',
          opacity: '1',
          borderRadius: '10px',
        },
        {
          // Peak of the arc — halfway through the flight
          transform: `translate(${arcMidDX}px, ${arcMidDY}px) scale(0.55) rotate(200deg)`,
          opacity: '0.9',
          borderRadius: '50%',
          offset: 0.42,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(0.07) rotate(400deg)`,
          opacity: '0',
          borderRadius: '50%',
        },
      ],
      { duration: 680, easing: 'ease-in', fill: 'forwards' },
    );

    setTimeout(() => {
      clone.remove();
      cartEl.classList.add('cart-bounce');
      setTimeout(() => cartEl.classList.remove('cart-bounce'), 500);
      resolve();
    }, 700);
  });
}
