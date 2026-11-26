import { useState } from 'react';
import { cn, initials, readableTextOn } from '@/lib/utils';

interface MarketAvatarProps {
  name: string;
  color: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: 'size-7 text-[11px] rounded-[6px]',
  md: 'size-9 text-xs rounded-[8px]',
  lg: 'size-12 text-sm rounded-[10px]',
} as const;

/** Identidad del market: su logo, o un monograma sobre su color primario (también si el logo no carga). */
export function MarketAvatar({ name, color, logoUrl, size = 'md', className }: MarketAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (logoUrl && failedUrl !== logoUrl) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden border border-line bg-surface p-1', SIZE[size], className)}>
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          onError={() => setFailedUrl(logoUrl)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center font-semibold tracking-tight', SIZE[size], className)}
      style={{ backgroundColor: color, color: readableTextOn(color) }}
    >
      {initials(name)}
    </span>
  );
}
