import { detectPropertyType, propertyDisplayName } from '@codario/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function PropertyTypeBadge({ siteUrl }: { siteUrl: string }) {
  return detectPropertyType(siteUrl) === 'DOMAIN' ? (
    <Badge variant="outline">Domain</Badge>
  ) : (
    <Badge variant="outline">URL prefix</Badge>
  );
}

export function PropertyLabel({ siteUrl, className }: { siteUrl: string; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)} title={siteUrl}>
      <span className="truncate text-ink-2">{propertyDisplayName(siteUrl)}</span>
      <PropertyTypeBadge siteUrl={siteUrl} />
    </span>
  );
}
