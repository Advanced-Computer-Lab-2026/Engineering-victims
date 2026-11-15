import React from 'react';
import { Menu } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Rendered on the right, e.g. the result count. */
  meta?: React.ReactNode;
  onOpenNav?: () => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, meta, onOpenNav }) => (
  <header className="mb-6 flex flex-wrap items-start gap-4">
    {onOpenNav && (
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
    )}

    <div className="min-w-0 flex-1">
      <h1 className="text-h2 font-bold tracking-tight text-on-surface md:text-h1">{title}</h1>
      {description && <p className="mt-1 text-body text-on-surface-variant">{description}</p>}
    </div>

    {meta && <div className="shrink-0">{meta}</div>}
  </header>
);

export default PageHeader;
