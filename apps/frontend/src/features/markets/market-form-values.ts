import { DEFAULT_MARKET_COLORS, type MarketDTO } from '@codario/shared';
import type { MarketFormValues } from './market-form';

export function marketToFormValues(market?: MarketDTO): MarketFormValues {
  return {
    name: market?.name ?? '',
    domain: market?.domain ?? '',
    description: market?.description ?? '',
    primaryColor: market?.primaryColor ?? DEFAULT_MARKET_COLORS.primaryColor,
    secondaryColor: market?.secondaryColor ?? DEFAULT_MARKET_COLORS.secondaryColor,
    status: market?.status ?? 'ACTIVE',
    gscSiteUrl: market?.gscSiteUrl ?? null,
    templateId: market?.templateId ?? null,
  };
}
