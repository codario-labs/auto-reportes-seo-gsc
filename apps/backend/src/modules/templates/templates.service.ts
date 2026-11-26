import {
  DEFAULT_TEMPLATE_CONFIG,
  normalizeTemplateConfig,
  type TemplateConfig,
  type TemplateDTO,
  type TemplateInput,
  type TemplateUpdateInput,
} from '@codario/shared';
import type { Prisma, PrismaClient, Template } from '@prisma/client';
import { Errors } from '../../lib/errors';

export const SYSTEM_TEMPLATE_NAME = 'Codario Premium';

type TemplateWithCount = Template & { _count?: { markets: number } };

/** Columnas relacionales + JSON de layout → configuración validada. */
export function templateToConfig(row: Template): TemplateConfig {
  const layout = (row.layout ?? {}) as Record<string, unknown>;
  return normalizeTemplateConfig({
    ...layout,
    colors: {
      primary: row.primaryColor,
      secondary: row.secondaryColor,
      background: row.backgroundColor,
      text: row.textColor,
    },
    useMarketColors: row.useMarketColors,
    typography: { headingFont: row.headingFont, bodyFont: row.bodyFont, baseFontSize: row.baseFontSize },
  });
}

export function configToColumns(config: TemplateConfig) {
  return {
    primaryColor: config.colors.primary,
    secondaryColor: config.colors.secondary,
    backgroundColor: config.colors.background,
    textColor: config.colors.text,
    useMarketColors: config.useMarketColors,
    headingFont: config.typography.headingFont,
    bodyFont: config.typography.bodyFont,
    baseFontSize: config.typography.baseFontSize,
    layout: {
      cover: config.cover,
      sections: config.sections,
      charts: config.charts,
      trendMetrics: config.trendMetrics,
      header: config.header,
      footer: config.footer,
      tables: config.tables,
    } as Prisma.InputJsonValue,
  };
}

export function toTemplateDTO(row: TemplateWithCount): TemplateDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    isSystem: row.isSystem,
    config: templateToConfig(row),
    marketsCount: row._count?.markets ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const withCount = { _count: { select: { markets: true } } } as const;

export class TemplatesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<TemplateDTO[]> {
    const rows = await this.prisma.template.findMany({
      include: withCount,
      orderBy: [{ isDefault: 'desc' }, { isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toTemplateDTO);
  }

  async getRow(id: string): Promise<Template> {
    const row = await this.prisma.template.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Template');
    return row;
  }

  async get(id: string): Promise<TemplateDTO> {
    const row = await this.prisma.template.findUnique({ where: { id }, include: withCount });
    if (!row) throw Errors.notFound('Template');
    return toTemplateDTO(row);
  }

  /** Plantilla predeterminada (marcada como default, o la de sistema). */
  async getDefaultRow(): Promise<Template | null> {
    return (
      (await this.prisma.template.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.template.findFirst({ where: { isSystem: true } })) ??
      (await this.prisma.template.findFirst({ orderBy: { createdAt: 'asc' } }))
    );
  }

  private async assertUniqueName(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.template.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (existing) throw Errors.conflict(`A template named "${name}" already exists.`);
  }

  async create(input: TemplateInput): Promise<TemplateDTO> {
    await this.assertUniqueName(input.name);
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.template.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.template.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          isDefault: Boolean(input.isDefault),
          ...configToColumns(input.config),
        },
        include: withCount,
      });
    });
    return toTemplateDTO(row);
  }

  async update(id: string, input: TemplateUpdateInput): Promise<TemplateDTO> {
    await this.getRow(id);
    if (input.name) await this.assertUniqueName(input.name, id);
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.template.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.template.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.config ? configToColumns(input.config) : {}),
        },
        include: withCount,
      });
    });
    return toTemplateDTO(row);
  }

  async duplicate(id: string): Promise<TemplateDTO> {
    const source = await this.getRow(id);
    let name = `${source.name} (copy)`;
    for (let i = 2; await this.prisma.template.count({ where: { name } }); i += 1) {
      name = `${source.name} (copy ${i})`;
    }
    const row = await this.prisma.template.create({
      data: {
        name: name.slice(0, 80),
        description: source.description,
        isDefault: false,
        isSystem: false,
        ...configToColumns(templateToConfig(source)),
      },
      include: withCount,
    });
    return toTemplateDTO(row);
  }

  async resetToDefaults(id: string): Promise<TemplateDTO> {
    await this.getRow(id);
    const row = await this.prisma.template.update({
      where: { id },
      data: configToColumns(DEFAULT_TEMPLATE_CONFIG),
      include: withCount,
    });
    return toTemplateDTO(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.getRow(id);
    if (row.isSystem) throw Errors.conflict('The system template cannot be deleted. You can duplicate it or edit it instead.', 'TEMPLATE_PROTECTED');
    await this.prisma.$transaction(async (tx) => {
      await tx.template.delete({ where: { id } });
      if (row.isDefault) {
        const fallback = await tx.template.findFirst({ where: { isSystem: true } });
        if (fallback) await tx.template.update({ where: { id: fallback.id }, data: { isDefault: true } });
      }
    });
  }
}
