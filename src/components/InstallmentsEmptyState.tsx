import React from 'react';

/* From Uiverse.io by JkHuger - https://uiverse.io/JkHuger/new-deer-97
   MIT License, Copyright (c) JkHuger (JkHuger) */

/**
 * "Nothing to pay" state on the installments screen: the Uiverse astronaut
 * tumbles through a falling starfield while the copy says the quiet plainly.
 *
 * The illustration is decorative — `aria-hidden`, no controls inside — so the
 * two lines under it carry the meaning for everyone else. Styles live in
 * `index.css` under the `astro-` prefix; the source's class names (`.body`,
 * `.head`, `.arm`, `.leg`, `.panel`) were too generic to ship as they were.
 *
 * Only the student view renders this: staff get a prompt, because for them an
 * empty list is "pick a student first", not "nothing to pay".
 */

/** One box per source `.box-of-star*`; four passes keep the fall continuous. */
const STAR_BOXES = [1, 2, 3, 4] as const;
const STARS = [1, 2, 3, 4, 5, 6, 7] as const;

const InstallmentsEmptyState: React.FC = () => (
  <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center">
    <div className="astro-field relative h-64 w-full max-w-xs overflow-hidden" aria-hidden="true">
      {STAR_BOXES.map((box) => (
        <div key={box} className={`astro-stars-${box}`}>
          {STARS.map((star) => (
            <span key={star} className={`astro-star astro-star-${star}`} />
          ))}
        </div>
      ))}

      <div className="astro-astronaut">
        <div className="astro-head" />
        <div className="astro-arm astro-arm-left" />
        <div className="astro-arm astro-arm-right" />
        <div className="astro-body">
          <div className="astro-panel" />
        </div>
        <div className="astro-leg astro-leg-left" />
        <div className="astro-leg astro-leg-right" />
        <div className="astro-schoolbag" />
      </div>
    </div>

    <div className="space-y-1">
      <p className="text-body font-semibold text-on-surface">You can rest easy for now</p>
      <p className="max-w-sm text-caption leading-relaxed text-on-surface-variant">
        Nothing is due — no installment plan has been assigned yet.
      </p>
    </div>
  </div>
);

export default InstallmentsEmptyState;
