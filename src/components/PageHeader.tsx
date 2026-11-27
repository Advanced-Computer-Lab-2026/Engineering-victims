import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Rendered on the right, e.g. the result count. */
  meta?: React.ReactNode;
  onOpenNav?: () => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, meta }) => (
  <header className="page-header mb-6 flex flex-wrap items-start gap-4">
    <div className="min-w-0 flex-1">
      <h1 className="text-h2 font-bold tracking-tight text-on-surface md:text-h1">{title}</h1>
      {description && <p className="mt-2 max-w-prose text-body text-on-surface-variant">{description}</p>}
    </div>

    {meta && <div className="page-header__actions flex flex-wrap items-center gap-2">{meta}</div>}
  </header>
);

export default PageHeader;
