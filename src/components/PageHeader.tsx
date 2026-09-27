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
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
    )}

    <div className="min-w-0 flex-1">
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
    </div>

    {meta && <div className="shrink-0">{meta}</div>}
  </header>
);

export default PageHeader;
