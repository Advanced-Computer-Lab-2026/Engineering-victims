import React, { useEffect, useState } from 'react';

/**
 * Opening animation for the sign-in route.
 *
 * The wordmark writes itself in letter by letter, a brand hairline rules in
 * under it with the university's full name, and the whole overlay hands the
 * screen over to the form. It plays on every load and refresh of `/`.
 *
 * It is decorative only: `aria-hidden`, no pointer events (so a fast typist
 * clicks straight through to the form), and it leaves the tree when it is
 * done. When the visitor prefers reduced motion it never renders at all —
 * the route opens on the form, unchanged.
 *
 * Timings are derived from the motion tokens (--duration-fast / -slow);
 * see decisions/005-login-intro-animation.md.
 */

/** Last keyframe (the overlay's fade-out) ends at 4 × 350ms + 350ms = 1750ms. */
const HOLD_MS = 1800;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const IntroOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    if (!isVisible) return undefined;
    const timer = window.setTimeout(() => setIsVisible(false), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className="guc-intro bg-surface pointer-events-none fixed inset-0 z-toast flex flex-col items-center justify-center gap-4"
      aria-hidden="true"
    >
      <div className="guc-intro__word flex text-display font-bold text-on-surface">
        <span className="guc-intro__letter">G</span>
        <span className="guc-intro__letter">U</span>
        <span className="guc-intro__letter">C</span>
      </div>

      <span className="guc-intro__rule h-0.5 w-24 bg-primary" />

      <p className="guc-intro__caption text-caption font-medium tracking-eyebrow text-on-surface-variant">
        German University in Cairo
      </p>
    </div>
  );
};

export default IntroOverlay;
