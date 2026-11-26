import { DEFAULT_TEMPLATE_CONFIG, resolvePeriod, type ReportDataset } from '@codario/shared';
import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleAnalysis } from '../../../test/fake-anthropic';
import { createFakeGoogle } from '../../../test/fake-google';
import { buildDataset } from '../../analytics/dataset.builder';
import { SearchConsoleClient } from '../../gsc/gsc.client';
import { donutChart, niceScale, trendChart } from '../charts';
import { escapeHtml, html, raw, readableTextOn, tint } from '../html';
import { PdfRenderer } from '../pdf.renderer';
import { renderPreview, renderReport, type ReportRenderModel } from '../report-template';

let dataset: ReportDataset;

beforeAll(async () => {
  const google = createFakeGoogle({ firstIncompleteDate: '2026-11-22' });
  dataset = await buildDataset({
    client: new SearchConsoleClient(async () => 't', { fetchImpl: google.fetch }),
    siteUrl: 'sc-domain:codariolabs.com',
    period: resolvePeriod('LAST_28_DAYS', { today: '2026-11-24', latestAvailableDate: '2026-11-21' }),
    freshness: { latestAvailableDate: '2026-11-21', source: 'gsc_metadata', firstIncompleteDate: '2026-11-22', dataState: 'final', checkedAt: '' },
    maxRowsPerDimension: 1000,
  });
});

function model(overrides: Partial<ReportRenderModel> = {}): ReportRenderModel {
  return {
    mode: 'pdf',
    dataset,
    analysis: sampleAnalysis(),
    aiMeta: null,
    includeAi: true,
    market: { name: 'Codario Labs', domain: 'codariolabs.com', description: null, logoDataUri: null, primaryColor: '#1E3A8A', secondaryColor: '#0EA5A4' },
    template: DEFAULT_TEMPLATE_CONFIG,
    branding: { companyName: 'Codario Labs', logoDataUri: null },
    generatedAt: new Date('2026-11-24T15:00:00Z'),
    timezone: 'America/Bogota',
    ...overrides,
  };
}

describe('html helpers', () => {
  it('escapes interpolations unless marked raw', () => {
    expect(html`<p>${'<script>alert(1)</script>'}</p>`.value).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(html`<p>${raw('<b>ok</b>')}</p>`.value).toBe('<p><b>ok</b></p>');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });

  it('computes tints and readable text colors', () => {
    expect(tint('#000000', 0.5)).toBe('#808080');
    expect(readableTextOn('#FFFFFF')).toBe('#111827');
    expect(readableTextOn('#1E3A8A')).toBe('#FFFFFF');
  });
});

describe('charts', () => {
  it('computes nice scales', () => {
    expect(niceScale([3, 87], { zeroBased: true }).ticks).toEqual([0, 25, 50, 75, 100]);
    expect(niceScale([null, null], { zeroBased: true })).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('renders SVG with gaps for missing values', () => {
    const svg = trendChart({
      width: 600,
      height: 200,
      dates: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
      series: [{ key: 'clicks', label: 'Clics', color: '#2F5BD3', values: [1, 2, null, 4], axis: 'left', format: String }],
      theme: { fontFamily: 'Inter', text: '#111', muted: '#666', grid: '#eee' },
    });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<circle'); // punto aislado tras el hueco
    expect((svg.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('renders donut segments proportional to values', () => {
    const svg = donutChart([{ value: 3, color: '#111111' }, { value: 1, color: '#222222' }], { track: '#eeeeee' });
    expect((svg.match(/stroke-dasharray/g) ?? []).length).toBe(2);
  });
});

describe('report template', () => {
  it('renders every enabled section with real data and Codario branding', () => {
    const rendered = renderReport(model());
    expect(rendered.bodyHtml).toContain('Resumen ejecutivo');
    expect(rendered.bodyHtml).toContain('Rendimiento de keywords');
    expect(rendered.bodyHtml).toContain('Plan de acción');
    expect(rendered.bodyHtml).toContain('posicionamiento web');
    expect(rendered.coverHtml).toContain('Codario Labs');
    expect(rendered.footerTemplate).toContain('Codario Labs');
    expect(rendered.footerTemplate).toContain('pageNumber');
  });

  it('keeps Codario branding even when the footer is disabled', () => {
    const rendered = renderReport(model({ template: { ...DEFAULT_TEMPLATE_CONFIG, footer: { ...DEFAULT_TEMPLATE_CONFIG.footer, enabled: false } } }));
    expect(rendered.footerTemplate).toContain('Codario Labs');
    expect(rendered.footerTemplate).not.toContain('pageNumber');
  });

  it('escapes AI-generated content', () => {
    const analysis = sampleAnalysis();
    analysis.executiveSummary.headline = '<img src=x onerror=alert(1)>';
    const rendered = renderReport(model({ analysis }));
    expect(rendered.bodyHtml).not.toContain('<img src=x');
    expect(rendered.bodyHtml).toContain('&lt;img src=x');
  });

  it('omits disabled sections and AI sections when no analysis was requested', () => {
    const template = { ...DEFAULT_TEMPLATE_CONFIG, sections: { ...DEFAULT_TEMPLATE_CONFIG.sections, pagePerformance: false } };
    const rendered = renderReport(model({ template, analysis: null, includeAi: false }));
    expect(rendered.bodyHtml).not.toContain('Rendimiento de páginas');
    expect(rendered.bodyHtml).not.toContain('Plan de acción');
    expect(rendered.bodyHtml).toContain('sin análisis de IA');
  });

  it('renders a skeleton preview without any figures when there is no data', () => {
    const preview = renderPreview(model({ dataset: null, analysis: null, mode: 'preview' }));
    expect(preview).toContain('Vista previa de estilo');
    expect(preview).toContain('class="sheet"');
  });
});

describe('PdfRenderer (Chromium)', () => {
  const renderer = new PdfRenderer(pino({ level: 'silent' }));
  afterAll(() => renderer.close());

  it('renders a multi-page PDF with cover, header/footer and metadata', async () => {
    if (!(await renderer.isAvailable())) {
      console.warn('Chromium not installed: skipping PDF rendering test');
      return;
    }
    const rendered = renderReport(model());
    const pdf = await renderer.render(rendered, { title: rendered.title, author: 'Codario Labs', subject: 'Test' });
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.pages).toBeGreaterThanOrEqual(8);
    const doc = await PDFDocument.load(pdf.buffer);
    expect(doc.getTitle()).toContain('SEO Performance Report');
    expect(doc.getAuthor()).toBe('Codario Labs');
    if (process.env.PDF_SAMPLE_OUTPUT) writeFileSync(process.env.PDF_SAMPLE_OUTPUT, pdf.buffer);
  });
});
