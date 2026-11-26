import { PDFDocument } from 'pdf-lib';
import { chromium, type Browser, type Page } from 'playwright';
import type { Logger } from '../../lib/logger';
import type { RenderedReport } from './report-template';

export interface RenderedPdf {
  buffer: Buffer;
  pages: number;
  durationMs: number;
}

/**
 * Renderiza HTML a PDF con Chromium headless (Playwright).
 * - JavaScript desactivado y todas las peticiones de red bloqueadas (solo data: URIs).
 * - Portada a sangre completa sin encabezado/pie + cuerpo con encabezado, pie y numeración.
 * - Ambos documentos se fusionan con pdf-lib y se añaden metadatos.
 */
export class PdfRenderer {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly options: { executablePath?: string } = {},
  ) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (!this.launching) {
      this.launching = chromium
        .launch({
          headless: true,
          executablePath: this.options.executablePath,
          args: ['--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-gpu'],
        })
        .then((browser) => {
          this.browser = browser;
          browser.on('disconnected', () => {
            this.browser = null;
          });
          return browser;
        })
        .finally(() => {
          this.launching = null;
        });
    }
    return this.launching;
  }

  /** Comprueba que Chromium puede arrancar (para el estado de integraciones). */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getBrowser();
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'chromium is not available');
      return false;
    }
  }

  private async htmlToPdf(
    content: string,
    pdfOptions: Parameters<Page['pdf']>[0],
    signal?: AbortSignal,
  ): Promise<Buffer> {
    signal?.throwIfAborted();
    const browser = await this.getBrowser();
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true, colorScheme: 'light' });
    try {
      const page = await context.newPage();
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('data:') || url === 'about:blank') return route.continue();
        return route.abort();
      });
      await page.setContent(content, { waitUntil: 'load', timeout: 60_000 });
      await page.emulateMedia({ media: 'print' });
      signal?.throwIfAborted();
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: false, ...pdfOptions });
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async render(report: RenderedReport, meta: { title: string; author: string; subject: string }, signal?: AbortSignal): Promise<RenderedPdf> {
    const started = Date.now();
    const cover = await this.htmlToPdf(
      report.coverHtml,
      { margin: { top: '0', right: '0', bottom: '0', left: '0' }, displayHeaderFooter: false, pageRanges: '1' },
      signal,
    );
    const body = await this.htmlToPdf(
      report.bodyHtml,
      {
        margin: report.margins,
        displayHeaderFooter: true,
        headerTemplate: report.headerTemplate,
        footerTemplate: report.footerTemplate,
      },
      signal,
    );

    const merged = await PDFDocument.create();
    for (const source of [cover, body]) {
      const doc = await PDFDocument.load(source);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    merged.setTitle(meta.title);
    merged.setAuthor(meta.author);
    merged.setSubject(meta.subject);
    merged.setCreator('Codario Labs SEO Report Generator');
    merged.setProducer('Codario Labs SEO Report Generator (Chromium + pdf-lib)');
    merged.setLanguage('es-ES');
    merged.setCreationDate(new Date());
    const bytes = await merged.save();
    return { buffer: Buffer.from(bytes), pages: merged.getPageCount(), durationMs: Date.now() - started };
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await browser?.close().catch(() => undefined);
  }
}
