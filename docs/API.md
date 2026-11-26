# API REST — Codario Labs SEO Report Generator

Base: `/api` (el frontend la consume en el mismo origen; nginx o el proxy de Vite la reenvían al backend).
Todos los DTOs están tipados en `packages/shared/src/api.ts`. Las validaciones de entrada son los esquemas Zod de `packages/shared/src/schemas/*`.

## Convenciones

- JSON en request y response (`Content-Type: application/json`), salvo subidas (`multipart/form-data`, campo `file`) y descargas.
- Errores: `{ "error": { "code": string, "message": string, "details"?: unknown, "requestId"?: string } }`.
  - `400 VALIDATION_ERROR` — `details` = lista `{ path: string, message: string }[]`.
  - `401 ACCESS_REQUIRED` — falta la sesión de acceso al panel (ver abajo). El frontend debe mostrar la pantalla de acceso.
  - `403 ORIGIN_NOT_ALLOWED` — petición mutante desde un origen no permitido.
  - `404 NOT_FOUND`, `409 CONFLICT`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `429 RATE_LIMITED`.
  - `412 GOOGLE_NOT_CONNECTED` (no hay cuenta de Google conectada o el token fue revocado), `409 MARKET_PROPERTY_MISSING` (el market no tiene propiedad GSC asignada), `424 GSC_PROPERTY_INACCESSIBLE` (la cuenta conectada no tiene acceso a la propiedad), `422 PERIOD_UNAVAILABLE` (el periodo no tiene datos finales todavía / fuera de los 16 meses), `502 GSC_API_ERROR`, `503 INTEGRATION_NOT_CONFIGURED` (faltan variables de entorno de Google o Anthropic).
  - `500 INTERNAL_ERROR` — nunca expone detalles internos.
- Fechas-hora: ISO 8601. Fechas de calendario: `YYYY-MM-DD`.

## Acceso privado (sin login/registro)

La app es single-user. No hay usuarios: el panel se desbloquea con la clave `APP_ACCESS_KEY` definida en el entorno.
El backend emite una cookie de sesión firmada (`HttpOnly`, `SameSite=Lax`) con caducidad.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Público. `{ status: "ok", database: boolean }` |
| GET | `/api/access/status` | Público. `AccessStatusDTO` |
| POST | `/api/access/unlock` | Público (rate limit estricto). Body `{ accessKey }` → `AccessStatusDTO` + cookie |
| POST | `/api/access/lock` | Cierra la sesión del panel |

Todas las demás rutas requieren la cookie; las mutaciones además validan la cabecera `Origin`.

## Overview

| GET | `/api/overview` | `OverviewDTO` |

## Settings

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/settings` | `SettingsDTO` |
| PUT | `/api/settings` | Body `SettingsUpdateInput` → `SettingsDTO` |
| POST | `/api/settings/logo` | multipart `file` (PNG/JPEG/WebP/SVG, máx. 2 MB) → `SettingsDTO` (logo global de Codario Labs) |
| DELETE | `/api/settings/logo` | Elimina el logo subido → `SettingsDTO` |

## Integraciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/integrations/status` | `IntegrationsStatusDTO` |
| POST | `/api/integrations/google/connect` | → `GoogleConnectResponse` (`authorizationUrl`); el frontend navega a esa URL |
| GET | `/api/integrations/google/callback` | Callback OAuth (lo llama Google). Redirige a `APP_URL/integrations?google=connected` o `?google=error&reason=...` |
| POST | `/api/integrations/google/disconnect` | Revoca y elimina la conexión → `IntegrationsStatusDTO` |
| GET | `/api/integrations/google/properties` | `GooglePropertyDTO[]` (lista sincronizada) |
| POST | `/api/integrations/google/properties/sync` | Vuelve a leer las propiedades de GSC → `GooglePropertyDTO[]` |
| POST | `/api/integrations/google/properties/verify` | Body `{ siteUrl }` → `PropertyVerificationDTO` |

## Plantillas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/templates` | `TemplateDTO[]` |
| POST | `/api/templates` | Body `TemplateInput` → `TemplateDTO` (201) |
| GET | `/api/templates/:id` | `TemplateDTO` |
| PUT | `/api/templates/:id` | Body `TemplateUpdateInput` → `TemplateDTO` |
| DELETE | `/api/templates/:id` | 204. La plantilla de sistema no se puede eliminar (409) |
| POST | `/api/templates/:id/duplicate` | → `TemplateDTO` (201) |
| POST | `/api/templates/:id/reset` | Restaura la configuración predeterminada → `TemplateDTO` |
| POST | `/api/templates/preview` | Body `TemplatePreviewInput` → `text/html` (vista previa del PDF; usar en `<iframe srcdoc>` con `sandbox`) |

## Markets

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/markets` | `MarketDTO[]` |
| POST | `/api/markets` | Body `MarketInput` → `MarketDTO` (201) |
| GET | `/api/markets/:id` | `MarketDTO` |
| PUT | `/api/markets/:id` | Body `MarketUpdateInput` → `MarketDTO` |
| DELETE | `/api/markets/:id` | 204 (elimina también sus reportes y PDFs) |
| POST | `/api/markets/:id/logo` | multipart `file` → `MarketDTO` |
| DELETE | `/api/markets/:id/logo` | → `MarketDTO` |
| GET | `/api/markets/:id/freshness` | `FreshnessDTO` (último día con datos finales en GSC) |
| GET | `/api/markets/:id/performance?preset=&startDate=&endDate=&refresh=` | `PerformanceDTO` (datos reales de GSC, caché 10 min) |

## Reportes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/reports?marketId=&status=&from=&to=&page=&pageSize=` | `Paginated<ReportDTO>` |
| POST | `/api/reports` | Body `GenerateReportInput` → 202 `GenerateReportResponse`. Si ya hay uno idéntico en curso, lo devuelve (`deduplicated: true`) |
| GET | `/api/reports/:id` | `ReportDetailDTO` |
| GET | `/api/reports/:id/status` | `ReportDTO` (ligero, para polling cada ~1,5 s mientras `status` ∈ QUEUED/RUNNING) |
| GET | `/api/reports/:id/download` | PDF (`Content-Disposition: attachment`) |
| POST | `/api/reports/:id/cancel` | → `ReportDTO` |
| POST | `/api/reports/:id/retry` | Crea un nuevo reporte con los mismos parámetros → 202 `GenerateReportResponse` |
| DELETE | `/api/reports/:id` | 204 (borra también el PDF) |

### Etapas reales de generación (`stage`)

`QUEUED → FETCHING_DATA → PROCESSING_METRICS → COMPARING_PERIODS → GENERATING_INSIGHTS → RENDERING_PDF → COMPLETED`.
`GENERATING_INSIGHTS` se omite si `includeAi = false`. `stageTimings` contiene la duración real (ms) de cada etapa terminada.

## Archivos

| GET | `/api/files/logos/:fileName` | Sirve logos subidos (con CSP `sandbox`, `nosniff`) |
| GET | `/api/files/branding/logo` | Logo global de Codario Labs (subido o `CODARIO_LOGO_PATH`) |
