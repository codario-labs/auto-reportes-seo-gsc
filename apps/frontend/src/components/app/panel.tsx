import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('min-w-0 rounded-panel border border-line bg-surface', className)} {...props} />;
}

interface PanelHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  id?: string;
}

export function PanelHeader({ title, description, actions, className, id }: PanelHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="grid min-w-0 gap-0.5">
        <h2 id={id} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="text-ui text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, actions, leading, children }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="grid min-w-0 gap-1">
          <h1 className="truncate text-title font-semibold text-ink">{title}</h1>
          {description ? <div className="text-sm text-ink-2">{description}</div> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

interface DefinitionListProps {
  items: { label: React.ReactNode; value: React.ReactNode }[];
  className?: string;
}

export function DefinitionList({ items, className }: DefinitionListProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]', className)}>
      {items.map((item, index) => (
        <div key={index} className="contents">
          <dt className="text-ui text-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
