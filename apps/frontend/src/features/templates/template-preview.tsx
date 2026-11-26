import { templateConfigSchema, type TemplateConfig } from '@codario/shared';
import { Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MarketAvatar } from '@/components/app/market-avatar';
import { Panel, PanelHeader } from '@/components/app/panel';
import { EmptyState } from '@/components/app/states';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { NONE_VALUE, Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMarkets, useTemplatePreview } from '@/features/api-hooks';
import { errorMessage } from '@/lib/api';

/** Ancho de una página A4 a 96 ppp. */
const PAGE_WIDTH = 794;
const FRAME_HEIGHT = 3600;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Vista previa en vivo del PDF (HTML renderizado por el backend, sin scripts). */
export function TemplatePreview({ config }: { config: TemplateConfig }) {
  const markets = useMarkets();
  const preview = useTemplatePreview();
  const [marketId, setMarketId] = useState<string>(NONE_VALUE);
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const valid = templateConfigSchema.safeParse(config).success;
  const serialized = JSON.stringify(config);
  const { mutate } = preview;

  useEffect(() => {
    if (!valid) return;
    const timer = window.setTimeout(() => {
      mutate({ config: JSON.parse(serialized) as TemplateConfig, marketId: marketId === NONE_VALUE ? null : marketId });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [serialized, marketId, valid, mutate]);

  const scale = width > 0 ? Math.min(1, width / PAGE_WIDTH) : 0.5;

  return (
    <Panel className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Preview"
        description="Layout and branding only. Report pages show real data when generated."
        actions={preview.isPending ? <Spinner /> : null}
      />
      <div className="grid gap-1.5 border-b border-line px-5 py-3">
        <Label htmlFor="preview-market">Preview with market</Label>
        <Select value={marketId} onValueChange={setMarketId}>
          <SelectTrigger id="preview-market">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>No market (template colors)</SelectItem>
            {markets.data?.length ? <SelectSeparator /> : null}
            {markets.data?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex items-center gap-2">
                  <MarketAvatar name={m.name} color={m.primaryColor} logoUrl={m.logoUrl} size="sm" className="size-5 text-[9px]" />
                  {m.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div ref={containerRef} className="relative h-[70vh] min-h-[420px] overflow-y-auto overflow-x-hidden bg-[#ECEEF1]">
        {!valid ? (
          <EmptyState compact icon={Eye} title="Fix the highlighted fields to update the preview" />
        ) : preview.isError ? (
          <EmptyState compact icon={Eye} title="The preview could not be rendered" description={errorMessage(preview.error)} />
        ) : preview.data ? (
          <div style={{ height: FRAME_HEIGHT * scale }}>
            <iframe
              title="Report preview"
              sandbox=""
              srcDoc={preview.data}
              style={{ width: PAGE_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              className="block border-0 bg-transparent"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center" role="status" aria-label="Rendering preview">
            <Spinner className="size-5" />
          </div>
        )}
      </div>
    </Panel>
  );
}
