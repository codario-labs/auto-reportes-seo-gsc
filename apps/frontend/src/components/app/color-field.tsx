import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ColorFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
  label?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Selector de color nativo + campo hexadecimal (controlado; se valida al guardar). */
export function ColorField({ id, value, onChange, invalid, className, label = 'color' }: ColorFieldProps) {
  const valid = HEX_RE.test(value);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label
        className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-control border border-line hover:border-line-strong focus-within:ring-2 focus-within:ring-focus/40"
        style={{ backgroundColor: valid ? value : '#FFFFFF' }}
      >
        <input
          type="color"
          aria-label={`Pick ${label}`}
          value={valid ? value.toLowerCase() : '#000000'}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <Input
        id={id}
        value={value}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className="w-28 uppercase"
        onChange={(event) => {
          const next = event.target.value.trim().toUpperCase();
          onChange(next === '' || next.startsWith('#') ? next : `#${next}`);
        }}
      />
    </div>
  );
}
