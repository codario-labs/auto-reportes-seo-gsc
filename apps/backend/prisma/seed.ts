/**
 * Seed idempotente: configuración global, plantilla predeterminada premium y branding inicial de Codario Labs.
 * Se ejecuta en cada despliegue (servicio "migrate") sin sobrescribir cambios del usuario.
 */
import { DEFAULT_TEMPLATE_CONFIG } from '@codario/shared';
import { PrismaClient } from '@prisma/client';
import { configToColumns, SYSTEM_TEMPLATE_NAME } from '../src/modules/templates/templates.service';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const timezone = process.env.APP_TIMEZONE?.trim() || 'America/Bogota';

    let template = await prisma.template.findFirst({ where: { isSystem: true } });
    if (!template) {
      const hasDefault = (await prisma.template.count({ where: { isDefault: true } })) > 0;
      template = await prisma.template.create({
        data: {
          name: SYSTEM_TEMPLATE_NAME,
          description: 'Plantilla editorial predeterminada de Codario Labs: portada con branding, KPIs, gráficos y plan de acción.',
          isSystem: true,
          isDefault: !hasDefault,
          ...configToColumns(DEFAULT_TEMPLATE_CONFIG),
        },
      });
      console.warn(`[seed] Created system template "${template.name}"`);
    }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      await prisma.appSettings.create({
        data: { id: 1, companyName: 'Codario Labs', timezone, defaultTemplateId: template.id },
      });
      console.warn('[seed] Created global settings (Codario Labs branding)');
    } else if (!settings.defaultTemplateId) {
      await prisma.appSettings.update({ where: { id: 1 }, data: { defaultTemplateId: template.id } });
    }
    console.warn('[seed] Done');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
