import type { MarketDTO, MarketParsedInput } from '@codario/shared';
import type { GoogleProperty, Market, PrismaClient, Template } from '@prisma/client';
import path from 'node:path';
import { randomToken } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { STORAGE_DIRS, type StorageService } from '../../lib/storage';
import { detectImage, validateLogoUpload, type UploadedFileLike } from '../../lib/uploads';
import { toPropertyDTO, type GooglePropertiesService } from '../google/properties.service';
import type { LogoAsset } from '../settings/settings.service';

type MarketWithRelations = Market & {
  googleProperty: (GoogleProperty & { _count?: { markets: number } }) | null;
  template: Pick<Template, 'id' | 'name'> | null;
  _count?: { reports: number };
  reports?: Array<{ createdAt: Date }>;
};

const marketInclude = {
  googleProperty: { include: { _count: { select: { markets: true } } } },
  template: { select: { id: true, name: true } },
  _count: { select: { reports: true } },
  reports: { select: { createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1, where: { status: 'COMPLETED' as const } },
};

export function logoUrlFor(logoPath: string | null, updatedAt: Date): string | null {
  if (!logoPath) return null;
  return `/api/files/logos/${encodeURIComponent(path.posix.basename(logoPath))}?v=${updatedAt.getTime()}`;
}

export function toMarketDTO(row: MarketWithRelations): MarketDTO {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    description: row.description,
    logoUrl: logoUrlFor(row.logoPath, row.updatedAt),
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    status: row.status,
    gscSiteUrl: row.gscSiteUrl,
    googleProperty: row.googleProperty ? toPropertyDTO(row.googleProperty) : null,
    propertyLinked: Boolean(row.googlePropertyId),
    templateId: row.templateId,
    template: row.template ? { id: row.template.id, name: row.template.name } : null,
    reportsCount: row._count?.reports ?? 0,
    lastReportAt: row.reports?.[0]?.createdAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MarketsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly properties: GooglePropertiesService,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<MarketDTO[]> {
    const rows = await this.prisma.market.findMany({
      include: marketInclude,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toMarketDTO);
  }

  async getRow(id: string): Promise<Market> {
    const row = await this.prisma.market.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Market');
    return row;
  }

  async get(id: string): Promise<MarketDTO> {
    const row = await this.prisma.market.findUnique({ where: { id }, include: marketInclude });
    if (!row) throw Errors.notFound('Market');
    return toMarketDTO(row);
  }

  private async resolveRelations(input: Partial<MarketParsedInput>) {
    const data: { templateId?: string | null; gscSiteUrl?: string | null; googlePropertyId?: string | null } = {};
    if (input.templateId !== undefined) {
      if (input.templateId) {
        const exists = await this.prisma.template.count({ where: { id: input.templateId } });
        if (!exists) throw Errors.validation([{ path: 'templateId', message: 'Template not found' }]);
      }
      data.templateId = input.templateId;
    }
    if (input.gscSiteUrl !== undefined) {
      data.gscSiteUrl = input.gscSiteUrl;
      const property = input.gscSiteUrl ? await this.properties.findBySiteUrl(input.gscSiteUrl) : null;
      data.googlePropertyId = property?.id ?? null;
    }
    return data;
  }

  private async assertUniqueDomain(domain: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.market.findFirst({ where: { domain, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (existing) throw Errors.conflict(`A market for ${domain} already exists.`);
  }

  async create(input: MarketParsedInput): Promise<MarketDTO> {
    await this.assertUniqueDomain(input.domain);
    const relations = await this.resolveRelations(input);
    const row = await this.prisma.market.create({
      data: {
        name: input.name,
        domain: input.domain,
        description: input.description,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        status: input.status,
        ...relations,
      },
      include: marketInclude,
    });
    return toMarketDTO(row);
  }

  async update(id: string, input: Partial<MarketParsedInput>): Promise<MarketDTO> {
    await this.getRow(id);
    if (input.domain) await this.assertUniqueDomain(input.domain, id);
    const relations = await this.resolveRelations(input);
    const row = await this.prisma.market.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
        ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...relations,
      },
      include: marketInclude,
    });
    return toMarketDTO(row);
  }

  /** Elimina el market, sus reportes (cascada) y los archivos asociados. */
  async remove(id: string): Promise<void> {
    const market = await this.getRow(id);
    const reports = await this.prisma.report.findMany({ where: { marketId: id }, select: { filePath: true } });
    await this.prisma.market.delete({ where: { id } });
    await Promise.all([
      ...reports.map((r) => this.storage.remove(r.filePath).catch(() => undefined)),
      this.storage.remove(market.logoPath).catch(() => undefined),
    ]);
    await this.storage.removeDir(path.posix.join(STORAGE_DIRS.reports, id)).catch(() => undefined);
    this.logger.info({ marketId: id, reports: reports.length }, 'market deleted');
  }

  async setLogo(id: string, file: UploadedFileLike | undefined): Promise<MarketDTO> {
    const market = await this.getRow(id);
    const detected = validateLogoUpload(file);
    const relative = path.posix.join(STORAGE_DIRS.logos, `${id}-${randomToken(8)}.${detected.ext}`);
    await this.storage.write(relative, file!.buffer);
    await this.prisma.market.update({ where: { id }, data: { logoPath: relative } });
    await this.storage.remove(market.logoPath).catch(() => undefined);
    return this.get(id);
  }

  async removeLogo(id: string): Promise<MarketDTO> {
    const market = await this.getRow(id);
    await this.prisma.market.update({ where: { id }, data: { logoPath: null } });
    await this.storage.remove(market.logoPath).catch(() => undefined);
    return this.get(id);
  }

  async getLogo(market: Pick<Market, 'logoPath'>): Promise<LogoAsset | null> {
    if (!market.logoPath) return null;
    try {
      const buffer = await this.storage.read(market.logoPath);
      const detected = detectImage(buffer);
      return detected ? { buffer, mime: detected.mime } : null;
    } catch {
      return null;
    }
  }
}
