import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHistoryNavigation } from '../hooks/useHistoryNavigation';

/**
 * Back/forward pair modelled on the browser's own: the buttons stay in the
 * same place on every page, grey out when there is nowhere to go, and use the
 * browser's history (so Alt+← / Alt+→ and the trackpad swipe keep working).
 */
const HistoryButtons: React.FC = () => {
  const { canGoBack, canGoForward, goBack, goForward } = useHistoryNavigation();

  const buttonClass =
    'rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-600';

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Page history">
      <button
        type="button"
        onClick={goBack}
        disabled={!canGoBack}
        aria-label="Go back"
        title={canGoBack ? 'Back (Alt+←)' : 'No previous page'}
        className={buttonClass}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={goForward}
        disabled={!canGoForward}
        aria-label="Go forward"
        title={canGoForward ? 'Forward (Alt+→)' : 'No later page'}
        className={buttonClass}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
};

export default HistoryButtons;
