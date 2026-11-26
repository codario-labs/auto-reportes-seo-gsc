import { ChevronLeft, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** Calendario (react-day-picker v9) con estilos propios, sin la hoja de estilos por defecto. */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn('relative text-sm', className)}
      classNames={{
        months: 'flex flex-col gap-6 sm:flex-row',
        month: 'grid gap-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-0 top-0 flex h-8 items-center justify-between',
        button_previous:
          'inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-ink/[0.05] disabled:opacity-30',
        button_next:
          'inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-ink/[0.05] disabled:opacity-30',
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-xs font-normal text-muted',
        week: 'mt-1 flex',
        day: 'relative size-9 p-0 text-center',
        day_button:
          'inline-flex size-9 items-center justify-center rounded-control text-sm transition-colors hover:bg-ink/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
        today: '[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4',
        selected: '[&>button]:bg-ink [&>button]:text-white [&>button]:hover:bg-ink',
        range_start: 'rounded-l-control bg-ink/[0.07]',
        range_end: 'rounded-r-control bg-ink/[0.07]',
        range_middle: 'bg-ink/[0.07] [&>button]:!bg-transparent [&>button]:!text-ink',
        outside: 'text-muted/60',
        disabled: 'pointer-events-none [&>button]:text-muted/40 [&>button]:line-through',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  );
}
