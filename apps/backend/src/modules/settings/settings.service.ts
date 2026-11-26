import type { SettingsDTO, SettingsUpdateInput } from '@codario/shared';
import type { AppSettings, PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { STORAGE_DIRS, type StorageService } from '../../lib/storage';
import { assertSafeSvg, detectImage, sanitizeSvg, validateLogoUpload, type UploadedFileLike } from '../../lib/uploads';

const SETTINGS_ID = 1;

export interface LogoAsset {
  buffer: Buffer;
  mime: string;
}

export function toDataUri(asset: LogoAsset | null): string | null {
  return asset ? `data:${asset.mime};base64,${asset.buffer.toString('base64')}` : null;
}

export class SettingsService {
  private envLogoCache: { loaded: boolean; asset: LogoAsset | null } = { loaded: false, asset: null };

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly logger: Logger,
    private readonly defaults: { timezone: string; envLogoPath?: string },
  ) {}

  async get(): Promise<AppSettings> {
    return this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, timezone: this.defaults.timezone },
      update: {},
    });
  }

  async toDTO(settings?: AppSettings): Promise<SettingsDTO> {
    const s = settings ?? (await this.get());
    const envLogo = await this.loadEnvLogo();
    return {
      companyName: s.companyName,
      timezone: s.timezone,
      defaultPeriodPreset: s.defaultPeriodPreset === 'CUSTOM' ? 'LAST_28_DAYS' : s.defaultPeriodPreset,
      dataDelayDays: s.dataDelayDays,
      defaultTemplateId: s.defaultTemplateId,
      globalLogoUrl: s.globalLogoPath || envLogo ? `/api/files/branding/logo?v=${s.updatedAt.getTime()}` : null,
      globalLogoSource: s.globalLogoPath ? 'upload' : envLogo ? 'env' : null,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async update(input: SettingsUpdateInput): Promise<SettingsDTO> {
    await this.get();
    if (input.defaultTemplateId) {
      const exists = await this.prisma.template.count({ where: { id: input.defaultTemplateId } });
      if (!exists) throw Errors.validation([{ path: 'defaultTemplateId', message: 'Template not found' }]);
    }
    const updated = await this.prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.defaultPeriodPreset !== undefined ? { defaultPeriodPreset: input.defaultPeriodPreset } : {}),
        ...(input.dataDelayDays !== undefined ? { dataDelayDays: input.dataDelayDays } : {}),
        ...(input.defaultTemplateId !== undefined ? { defaultTemplateId: input.defaultTemplateId ?? null } : {}),
      },
    });
    return this.toDTO(updated);
  }

  async setGlobalLogo(file: UploadedFileLike | undefined): Promise<SettingsDTO> {
    const image = validateLogoUpload(file);
    const settings = await this.get();
    const relative = path.posix.join(STORAGE_DIRS.branding, `codario-logo-${Date.now()}.${image.ext}`);
    await this.storage.write(relative, image.buffer);
    const updated = await this.prisma.appSettings.update({ where: { id: SETTINGS_ID }, data: { globalLogoPath: relative } });
    await this.storage.remove(settings.globalLogoPath).catch(() => undefined);
    return this.toDTO(updated);
  }

  async removeGlobalLogo(): Promise<SettingsDTO> {
    const settings = await this.get();
    const updated = await this.prisma.appSettings.update({ where: { id: SETTINGS_ID }, data: { globalLogoPath: null } });
    await this.storage.remove(settings.globalLogoPath).catch(() => undefined);
    return this.toDTO(updated);
  }

  /** Logo oficial de Codario Labs: el subido en Settings tiene prioridad sobre CODARIO_LOGO_PATH. */
  async getGlobalLogo(): Promise<LogoAsset | null> {
    const settings = await this.get();
    if (settings.globalLogoPath) {
      try {
        const buffer = await this.storage.read(settings.globalLogoPath);
        const detected = detectImage(buffer);
        if (detected) return { buffer, mime: detected.mime };
      } catch (error) {
        this.logger.warn({ err: error }, 'stored global logo could not be read');
      }
    }
    return this.loadEnvLogo();
  }

  private async loadEnvLogo(): Promise<LogoAsset | null> {
    if (this.envLogoCache.loaded) return this.envLogoCache.asset;
    let asset: LogoAsset | null = null;
    if (this.defaults.envLogoPath) {
      try {
        const buffer = await readFile(this.defaults.envLogoPath);
        const detected = detectImage(buffer);
        if (!detected) throw new Error('unsupported image format');
        if (detected.ext === 'svg') assertSafeSvg(buffer);
        asset = { buffer: detected.ext === 'svg' ? sanitizeSvg(buffer) : buffer, mime: detected.mime };
      } catch (error) {
        this.logger.warn({ err: error, path: this.defaults.envLogoPath }, 'CODARIO_LOGO_PATH could not be loaded; using the text wordmark');
      }
    }
    this.envLogoCache = { loaded: true, asset };
    return asset;
  }
}
