import { comparisonLabel, PERIOD_PRESET_LABELS, PERIOD_PRESETS, type PeriodPreset } from '@codario/shared';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { displayDate, displayRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isoToLocalDate, localDateToIso, resolvePeriodSafe, usePeriodContext, type PeriodValue } from './period-utils';

export type { PeriodValue } from './period-utils';

interface PeriodSelectorProps {
  id?: string;
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  marketId?: string | null;
  className?: string;
  /** Oculta la línea con el rango resuelto y la comparación. */
  hideSummary?: boolean;
  triggerClassName?: string;
}

export function PeriodSelector({ id, value, onChange, marketId, className, hideSummary, triggerClassName }: PeriodSelectorProps) {
  const context = usePeriodContext(marketId);
  const resolved = resolvePeriodSafe(value, context);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerRange | undefined>(undefined);

  const openCustom = () => {
    setDraft(
      value.startDate && value.endDate
        ? { from: isoToLocalDate(value.startDate), to: isoToLocalDate(value.endDate) }
        : undefined,
    );
    setOpen(true);
  };

  const applyCustom = () => {
    if (!draft?.from) return;
    const startDate = localDateToIso(draft.from);
    const endDate = localDateToIso(draft.to ?? draft.from);
    onChange({ preset: 'CUSTOM', startDate, endDate });
    setOpen(false);
  };

  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={value.preset}
          onValueChange={(next) => {
            const preset = next as PeriodPreset;
            if (preset === 'CUSTOM') {
              // Parte del rango resuelto actual para que el periodo personalizado sea válido de inmediato;
              // el usuario lo ajusta con el botón de fechas (abrir el popover aquí perdería el foco al cerrar el Select).
              const seed = resolved.period?.current;
              onChange({ preset, startDate: value.startDate ?? seed?.startDate, endDate: value.endDate ?? seed?.endDate });
            } else {
              onChange({ preset });
            }
          }}
        >
          <SelectTrigger id={id} className={cn('w-full sm:w-48', triggerClassName)} aria-label="Period">
            <SelectValue placeholder="Select a period" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.filter((p) => p !== 'CUSTOM').map((preset) => (
              <SelectItem key={preset} value={preset}>
                {PERIOD_PRESET_LABELS[preset]}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value="CUSTOM">{PERIOD_PRESET_LABELS.CUSTOM}</SelectItem>
          </SelectContent>
        </Select>

        {value.preset === 'CUSTOM' ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="secondary" onClick={openCustom} aria-label="Choose custom dates">
                <CalendarDays />
                {value.startDate && value.endDate ? displayRange(value.startDate, value.endDate) : 'Choose dates'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={draft}
                onSelect={setDraft}
                defaultMonth={draft?.from ?? isoToLocalDate(context.latestAvailableDate)}
                disabled={[
                  { before: isoToLocalDate(context.earliestAvailableDate) },
                  { after: isoToLocalDate(context.latestAvailableDate) },
                ]}
                startMonth={isoToLocalDate(context.earliestAvailableDate)}
                endMonth={isoToLocalDate(context.latestAvailableDate)}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-xs text-muted">
                  Data available {displayDate(context.earliestAvailableDate)} to {displayDate(context.latestAvailableDate)}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={!draft?.from} onClick={applyCustom}>
                    Apply dates
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {hideSummary ? null : resolved.period ? (
        <p className="text-ui text-muted" data-testid="period-summary">
          <span className="text-ink-2">{displayRange(resolved.period.current.startDate, resolved.period.current.endDate)}</span>{' '}
          {comparisonLabel(resolved.period, 'en')} ({displayRange(resolved.period.previous.startDate, resolved.period.previous.endDate)})
        </p>
      ) : (
        <p className="text-ui text-warning" data-testid="period-summary">
          {resolved.error}
        </p>
      )}
    </div>
  );
}
