import { describe, expect, it } from 'vitest';
import { countryName, deviceLabel, searchAppearanceLabel } from '../dimensions';
import { detectPropertyType, propertyDisplayName } from '../report-data';
import { aiAnalysisSchema } from '../schemas/ai-analysis';
import { domainSchema, gscSiteUrlSchema } from '../schemas/common';
import { marketInputSchema } from '../schemas/market';
import { generateReportInputSchema } from '../schemas/report';
import { DEFAULT_TEMPLATE_CONFIG, normalizeTemplateConfig, templateConfigSchema } from '../schemas/template';

describe('domainSchema', () => {
  it('normalizes URLs to a hostname', () => {
    expect(domainSchema.parse('https://www.CodarioLabs.com/blog?x=1')).toBe('www.codariolabs.com');
    expect(domainSchema.parse('tienda.com.co')).toBe('tienda.com.co');
  });

  it('rejects invalid domains', () => {
    expect(domainSchema.safeParse('not a domain').success).toBe(false);
    expect(domainSchema.safeParse('localhost').success).toBe(false);
  });
});

describe('gscSiteUrlSchema', () => {
  it('accepts domain and URL-prefix properties', () => {
    expect(gscSiteUrlSchema.safeParse('sc-domain:example.com').success).toBe(true);
    expect(gscSiteUrlSchema.safeParse('https://www.example.com/').success).toBe(true);
  });

  it('rejects malformed properties', () => {
    expect(gscSiteUrlSchema.safeParse('example.com').success).toBe(false);
    expect(gscSiteUrlSchema.safeParse('https://www.example.com').success).toBe(false);
    expect(gscSiteUrlSchema.safeParse('javascript:alert(1)/').success).toBe(false);
  });

  it('detects the property type', () => {
    expect(detectPropertyType('sc-domain:example.com')).toBe('DOMAIN');
    expect(detectPropertyType('https://example.com/')).toBe('URL_PREFIX');
    expect(propertyDisplayName('https://www.example.com/es/')).toBe('www.example.com/es');
  });
});

describe('marketInputSchema', () => {
  it('parses a valid market and normalizes colors', () => {
    const parsed = marketInputSchema.parse({
      name: 'Codario Labs',
      domain: 'https://codariolabs.com',
      primaryColor: '#1e3a8a',
      secondaryColor: '#0ea5a4',
      gscSiteUrl: 'sc-domain:codariolabs.com',
    });
    expect(parsed.domain).toBe('codariolabs.com');
    expect(parsed.primaryColor).toBe('#1E3A8A');
    expect(parsed.status).toBe('ACTIVE');
    expect(parsed.description).toBeNull();
  });

  it('rejects invalid colors', () => {
    const result = marketInputSchema.safeParse({
      name: 'X Market',
      domain: 'x.com',
      primaryColor: 'red',
      secondaryColor: '#000000',
    });
    expect(result.success).toBe(false);
  });
});

describe('generateReportInputSchema', () => {
  it('requires dates for custom periods', () => {
    const result = generateReportInputSchema.safeParse({ marketId: 'm1', periodPreset: 'CUSTOM' });
    expect(result.success).toBe(false);
  });

  it('defaults includeAi to true', () => {
    const result = generateReportInputSchema.parse({ marketId: 'm1', periodPreset: 'LAST_28_DAYS' });
    expect(result.includeAi).toBe(true);
  });
});

describe('template config', () => {
  it('accepts the default config', () => {
    expect(templateConfigSchema.safeParse(DEFAULT_TEMPLATE_CONFIG).success).toBe(true);
  });

  it('normalizes partial configs with defaults and drops unknown keys', () => {
    const config = normalizeTemplateConfig({ colors: { primary: '#000000' }, unknownKey: true });
    expect(config.colors.primary).toBe('#000000');
    expect(config.colors.secondary).toBe(DEFAULT_TEMPLATE_CONFIG.colors.secondary);
    expect('unknownKey' in config).toBe(false);
  });

  it('falls back to defaults on invalid configs', () => {
    expect(normalizeTemplateConfig({ colors: { primary: 'nope' } })).toEqual(DEFAULT_TEMPLATE_CONFIG);
  });
});

describe('aiAnalysisSchema', () => {
  it('rejects incomplete AI responses', () => {
    expect(aiAnalysisSchema.safeParse({ executiveSummary: { headline: 'x' } }).success).toBe(false);
  });
});

describe('dimension labels', () => {
  it('maps GSC country codes to names', () => {
    expect(countryName('col', 'es')).toBe('Colombia');
    expect(countryName('usa', 'en')).toBe('United States');
    expect(countryName('zzz', 'es')).toBe('Región desconocida');
  });

  it('maps devices and search appearance', () => {
    expect(deviceLabel('MOBILE', 'es')).toBe('Móvil');
    expect(searchAppearanceLabel('REVIEW_SNIPPET')).toBe('Review snippets');
    expect(searchAppearanceLabel('SOME_NEW_TYPE')).toBe('Some new type');
  });
});
