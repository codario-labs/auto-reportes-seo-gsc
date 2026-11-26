import {
  detectPropertyType,
  propertyDisplayName,
  type GooglePropertyDTO,
  type PropertyVerificationDTO,
} from '@codario/shared';
import type { GoogleProperty, PrismaClient } from '@prisma/client';
import { Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { GscApiError, type SearchConsoleClient } from '../gsc/gsc.client';
import type { GoogleConnectionService } from './connection.service';

/** Niveles de permiso de GSC que permiten leer datos de rendimiento. */
const READABLE_PERMISSIONS = new Set(['siteOwner', 'siteFullUser', 'siteRestrictedUser']);

export function isReadablePermission(permissionLevel: string): boolean {
  return READABLE_PERMISSIONS.has(permissionLevel);
}

type PropertyWithCount = GoogleProperty & { _count?: { markets: number } };

export function toPropertyDTO(property: PropertyWithCount): GooglePropertyDTO {
  return {
    id: property.id,
    siteUrl: property.siteUrl,
    displayName: propertyDisplayName(property.siteUrl),
    propertyType: property.propertyType,
    permissionLevel: property.permissionLevel,
    isAccessible: property.isAccessible,
    lastSyncedAt: property.lastSyncedAt.toISOString(),
    lastVerifiedAt: property.lastVerifiedAt?.toISOString() ?? null,
    marketsCount: property._count?.markets ?? 0,
  };
}

export class GooglePropertiesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly connections: GoogleConnectionService,
    private readonly createClient: () => SearchConsoleClient,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<GooglePropertyDTO[]> {
    const connection = await this.connections.getConnection();
    if (!connection) return [];
    const properties = await this.prisma.googleProperty.findMany({
      where: { connectionId: connection.id },
      include: { _count: { select: { markets: true } } },
      orderBy: [{ propertyType: 'asc' }, { siteUrl: 'asc' }],
    });
    return properties.map(toPropertyDTO);
  }

  /** Lee las propiedades de Search Console, las guarda y re-vincula los markets por siteUrl. */
  async sync(): Promise<GooglePropertyDTO[]> {
    const connection = await this.connections.getConnection();
    if (!connection) throw Errors.googleNotConnected();
    let sites;
    try {
      sites = await this.createClient().listSites();
    } catch (error) {
      throw this.mapGscError(error, 'Could not list Search Console properties.');
    }
    const now = new Date();
    const siteUrls = sites.map((s) => s.siteUrl);

    await this.prisma.$transaction(async (tx) => {
      for (const site of sites) {
        await tx.googleProperty.upsert({
          where: { connectionId_siteUrl: { connectionId: connection.id, siteUrl: site.siteUrl } },
          create: {
            connectionId: connection.id,
            siteUrl: site.siteUrl,
            propertyType: detectPropertyType(site.siteUrl),
            permissionLevel: site.permissionLevel,
            isAccessible: isReadablePermission(site.permissionLevel),
            lastSyncedAt: now,
          },
          update: {
            permissionLevel: site.permissionLevel,
            isAccessible: isReadablePermission(site.permissionLevel),
            lastSyncedAt: now,
          },
        });
      }
      // Propiedades que ya no aparecen en la cuenta: se eliminan (los markets conservan gscSiteUrl).
      await tx.googleProperty.deleteMany({ where: { connectionId: connection.id, siteUrl: { notIn: siteUrls } } });
    });
    await this.relinkMarkets(connection.id);
    this.logger.info({ count: sites.length }, 'search console properties synced');
    return this.list();
  }

  /** Asocia cada market con la propiedad sincronizada que coincide con su gscSiteUrl. */
  async relinkMarkets(connectionId?: string): Promise<void> {
    const connection = connectionId ? { id: connectionId } : await this.connections.getConnection();
    if (!connection) return;
    const properties = await this.prisma.googleProperty.findMany({
      where: { connectionId: connection.id },
      select: { id: true, siteUrl: true },
    });
    for (const property of properties) {
      await this.prisma.market.updateMany({
        where: { gscSiteUrl: property.siteUrl, OR: [{ googlePropertyId: null }, { googlePropertyId: { not: property.id } }] },
        data: { googlePropertyId: property.id },
      });
    }
  }

  async findBySiteUrl(siteUrl: string): Promise<GoogleProperty | null> {
    const connection = await this.connections.getConnection();
    if (!connection) return null;
    return this.prisma.googleProperty.findUnique({
      where: { connectionId_siteUrl: { connectionId: connection.id, siteUrl } },
    });
  }

  /** Comprueba en vivo que la cuenta conectada puede leer la propiedad. */
  async verify(siteUrl: string): Promise<PropertyVerificationDTO> {
    const connection = await this.connections.getConnection();
    if (!connection) throw Errors.googleNotConnected();
    try {
      const site = await this.createClient().getSite(siteUrl);
      const accessible = isReadablePermission(site.permissionLevel);
      await this.prisma.googleProperty.updateMany({
        where: { connectionId: connection.id, siteUrl },
        data: { permissionLevel: site.permissionLevel, isAccessible: accessible, lastVerifiedAt: new Date() },
      });
      return {
        siteUrl,
        accessible,
        permissionLevel: site.permissionLevel,
        message: accessible
          ? `Accessible with ${site.permissionLevel} permission.`
          : 'The account is listed for this property but is not verified (siteUnverifiedUser).',
      };
    } catch (error) {
      if (error instanceof GscApiError && (error.status === 403 || error.status === 404)) {
        await this.prisma.googleProperty.updateMany({
          where: { connectionId: connection.id, siteUrl },
          data: { isAccessible: false, lastVerifiedAt: new Date() },
        });
        return {
          siteUrl,
          accessible: false,
          permissionLevel: null,
          message: 'The connected Google account does not have access to this property.',
        };
      }
      throw this.mapGscError(error, 'Could not verify the property.');
    }
  }

  private mapGscError(error: unknown, fallback: string): Error {
    if (error instanceof GscApiError) {
      this.logger.warn({ status: error.status, reason: error.reason }, 'search console api error');
      if (error.status === 401) return Errors.googleNotConnected('Google rejected the stored credentials. Reconnect your account.');
      if (error.status === 403 && error.reason === 'insufficientPermissions') {
        return Errors.googleNotConnected('The Google account did not grant Search Console access. Reconnect and accept the permission.');
      }
      return Errors.gscApi(`${fallback} ${error.message}`, { status: error.status, reason: error.reason });
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
