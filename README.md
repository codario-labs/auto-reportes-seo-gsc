# Codario Labs — SEO Report Generator

Aplicación web privada (single-user) para generar **reportes SEO profesionales en PDF** a partir de datos reales de **Google Search Console**, con análisis estratégico generado por **Anthropic (Claude)**.

Flujo principal: **Seleccionar market → Seleccionar periodo → Generate report → Descargar PDF.**

- Conexión OAuth 2.0 con Google (PKCE + `state` de un solo uso, tokens cifrados AES-256-GCM, renovación automática).
- Markets (sitios) con identidad visual propia, propiedad de GSC asociada y plantilla asignada.
- Plantillas de reporte configurables (colores, tipografías, portada, secciones, gráficos, encabezado y pie) con vista previa en vivo.
- 11 periodos predefinidos + personalizado, con comparación automática frente al periodo equivalente anterior.
- Visualización interactiva de métricas (Recharts) inspirada en la legibilidad de Search Console.
- Análisis SEO con IA en español: hechos vs. hipótesis, recomendaciones priorizadas, sin cifras ni keywords inventadas.
- PDF editorial (Chromium/Playwright) con branding de Codario Labs en todas las páginas, gráficos vectoriales y paginación.
- Historial persistente de reportes (PostgreSQL + volumen Docker).

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Inicio rápido con Docker](#inicio-rápido-con-docker)
4. [Configurar Google Cloud y Search Console](#configurar-google-cloud-y-search-console)
5. [Configurar Anthropic](#configurar-anthropic)
6. [Variables de entorno](#variables-de-entorno)
7. [Uso de la aplicación](#uso-de-la-aplicación)
8. [Cómo se genera un reporte](#cómo-se-genera-un-reporte)
9. [Seguridad](#seguridad)
10. [Desarrollo local sin Docker](#desarrollo-local-sin-docker)
11. [Tests y calidad](#tests-y-calidad)
12. [Operación con Docker](#operación-con-docker)
13. [Troubleshooting](#troubleshooting)
14. [Limitaciones conocidas](#limitaciones-conocidas)

---

## Arquitectura

```
                    Navegador (panel privado)
                              │  http://localhost:8080
                 ┌────────────▼─────────────┐
                 │  frontend (nginx)        │  SPA React + Vite, cabeceras de seguridad/CSP
                 │  /api/* → backend:4000   │  mismo origen: cookies SameSite, sin CORS
                 └────────────┬─────────────┘
                 ┌────────────▼─────────────┐
                 │  backend (Express + TS)  │──► Google OAuth 2.0 / Search Console API
                 │  · API REST + Zod        │──► Anthropic Messages API (streaming, JSON Schema)
                 │  · cola de reportes      │
                 │  · Chromium (Playwright) │──► PDF (pdf-lib para fusión y metadatos)
                 └──────┬─────────────┬─────┘
                        │             │
             ┌──────────▼───┐   ┌─────▼──────────────┐
             │ postgres:17  │   │ volumen storage    │  PDFs, logos, branding
             │ (volumen)    │   │ /data/storage      │
             └──────────────┘   └────────────────────┘
```

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, componentes estilo shadcn/ui (Radix), Lucide, Recharts 3, React Router 7, TanStack Query 5 |
| Backend | Node.js 24, Express 5, TypeScript, Prisma 6, PostgreSQL 17, Zod 4, Pino |
| Integraciones | Google OAuth 2.0 + Search Console API v3 (`fetch`), Anthropic SDK oficial (`@anthropic-ai/sdk`) |
| PDF | Playwright (Chromium headless) + plantillas HTML/CSS + gráficos SVG generados en servidor + pdf-lib |
| Infraestructura | Docker, Docker Compose, nginx (no root), volúmenes persistentes |

Decisiones clave:

- **Monorepo con npm workspaces**: `packages/shared` contiene los tipos, esquemas Zod, lógica de periodos y formato numérico que usan **ambos** lados (una sola fuente de verdad para validaciones y contrato de la API — ver [`docs/API.md`](docs/API.md)).
- **Trabajos asíncronos**: la generación (1–3 min con IA) corre en una cola en proceso con concurrencia configurable. El estado durable vive en la base de datos (`status` + `stage` por reporte); el frontend consulta `/status` cada 1,5 s y muestra las **etapas reales**. Al reiniciar, los reportes en cola se reanudan y los interrumpidos se marcan como fallidos para reintentarlos.
- **Gráficos del PDF en SVG generado en el servidor**: vectoriales, sin JavaScript (el PDF se renderiza con JS desactivado y sin red).
- **Solo datos finales de GSC** (`dataState: "final"`) y nunca fechas sin datos consolidados.

## Estructura del proyecto

```
.
├── apps/
│   ├── backend/
│   │   ├── prisma/              schema.prisma, migraciones, seed idempotente
│   │   └── src/
│   │       ├── config/          variables de entorno validadas con Zod
│   │       ├── lib/             logger, errores, cifrado, almacenamiento, subidas, validación
│   │       ├── middleware/      acceso privado, verificación de Origin, rate limit, errores
│   │       ├── modules/
│   │       │   ├── access/      sesión firmada del panel (sin usuarios)
│   │       │   ├── google/      OAuth 2.0, conexión cifrada, propiedades GSC
│   │       │   ├── gsc/         cliente Search Console (reintentos, paginación), frescura de datos
│   │       │   ├── analytics/   transformación de datos, comparación de periodos, oportunidades
│   │       │   ├── ai/          AnthropicService, payload compacto, prompts, verificación de anclaje
│   │       │   ├── pdf/         plantilla editorial, gráficos SVG, fuentes, renderizador Chromium
│   │       │   ├── reports/     servicio, cola, pipeline por etapas, rendimiento en vivo
│   │       │   ├── markets/ templates/ settings/
│   │       ├── routes/          controladores REST
│   │       ├── app.ts           composición de Express
│   │       ├── container.ts     inyección de dependencias
│   │       └── server.ts        arranque y apagado ordenado
│   └── frontend/
│       └── src/
│           ├── components/      ui/ (shadcn-style), app/, layout/
│           ├── features/        overview, markets, performance, reports, templates, integrations, settings
│           └── lib/             cliente API, formato, query client
├── packages/shared/src/          fechas, periodos, métricas, esquemas Zod, DTOs de la API
├── docker/                       Dockerfiles y configuración de nginx
├── branding/                     espacio para el logo oficial de Codario Labs (no versionado)
├── docs/API.md                   contrato de la API REST
├── docker-compose.yml
└── .env.example
```

## Inicio rápido con Docker

Requisitos: Docker Desktop (o Docker Engine) con Compose v2.

```bash
# 1. Configuración
cp .env.example .env

# 2. Genera los secretos locales y pégalos en .env
node -e "console.log('APP_ACCESS_KEY=' + require('crypto').randomBytes(18).toString('base64url'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('POSTGRES_PASSWORD=' + require('crypto').randomBytes(18).toString('hex'))"

# 3. (Opcional ahora, necesario para datos reales) credenciales de Google y Anthropic en .env

# 4. Levanta todo
docker compose up -d --build

# 5. Logs
docker compose logs -f
```

Abre **http://localhost:8080** e introduce tu `APP_ACCESS_KEY` en la pantalla *Unlock workspace*.

Servicios:

| Servicio | Descripción | Puerto |
|---|---|---|
| `frontend` | nginx con la SPA y proxy `/api` | `8080` (host) |
| `backend` | API, cola de reportes y Chromium | interno `4000` |
| `postgres` | PostgreSQL 17 con volumen `postgres_data` | `127.0.0.1:5434` (solo local) |
| `migrate` | Aplica `prisma migrate deploy` + seed y termina | — |

> El seed crea la configuración global, la plantilla de sistema **Codario Premium** y el branding inicial (nombre "Codario Labs"). El logo oficial no se incluye: súbelo en *Settings* o consulta [`branding/README.md`](branding/README.md).

## Configurar Google Cloud y Search Console

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea (o elige) un proyecto.
2. **Habilita la API**: *APIs & Services → Library →* "Google Search Console API" → **Enable**.
3. **Pantalla de consentimiento OAuth** (*APIs & Services → OAuth consent screen* / *Google Auth Platform*):
   - **Tipo de usuario**: *Internal* si la cuenta de Search Console pertenece a tu Google Workspace (recomendado: sin verificación y sin caducidad de 7 días). Si no, *External*.
   - Nombre de la app, correo de soporte y dominio.
   - **Scopes**: `.../auth/webmasters.readonly`, `openid`, `email` (la app solo solicita lectura).
   - Con *External* en estado **Testing**, añade tu cuenta como *test user*. Ten en cuenta que en *Testing* Google caduca los refresh tokens a los 7 días: tendrías que reconectar semanalmente. Para uso continuado, publica la app (*In production*).
4. **Credenciales**: *APIs & Services → Credentials → Create credentials → OAuth client ID*:
   - Tipo: **Web application**.
   - **Authorized redirect URIs**: exactamente el valor de `GOOGLE_OAUTH_REDIRECT_URI`, por defecto
     `http://localhost:8080/api/integrations/google/callback` (si sirves la app en otro dominio, usa `https://tu-dominio/api/integrations/google/callback`).
5. Copia **Client ID** y **Client secret** a `.env`:
   ```env
   GOOGLE_OAUTH_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxx
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/integrations/google/callback
   ```
6. `docker compose up -d` (recrea el backend con la nueva configuración).
7. En el panel: **Integrations → Connect Google account**. Acepta el permiso de Search Console. Las propiedades (de dominio `sc-domain:` y de prefijo de URL) se sincronizan automáticamente; usa *Refresh properties* cuando añadas nuevas.

La cuenta conectada debe tener acceso (*Owner*, *Full* o *Restricted user*) a las propiedades. Una sola cuenta de Google sirve para todos los markets.

## Configurar Anthropic

1. Crea una API key en [console.anthropic.com](https://console.anthropic.com/) (*Settings → API keys*).
2. En `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-opus-5-5     # modelo por defecto
   ANTHROPIC_EFFORT=high               # low | medium | high | xhigh | max
   ANTHROPIC_ENABLE_FALLBACK=true      # reintento en servidor con modelo alternativo si el principal declina
   ```
3. `docker compose up -d`. *Integrations* mostrará Anthropic como configurado.

La clave solo existe en el backend; nunca se envía al navegador. Cada análisis envía un dataset compacto (tablas columnares con las consultas/páginas relevantes, no millones de filas) en **tres peticiones** (diagnóstico, hallazgos y plan de acción), porque el esquema completo supera el tamaño máximo de las salidas estructuradas de la API. Medido con un reporte real con `claude-opus-5-5` ($4 / $20 por millón de tokens de entrada/salida) y `ANTHROPIC_EFFORT=high`: ~28 k tokens de entrada y ~20 k de salida (incluido el razonamiento), del orden de **0,50 USD por reporte** y ~2 minutos. Con `ANTHROPIC_EFFORT=medium` el coste y el tiempo bajan. El consumo real (tokens, modelo que respondió, duración) se guarda en cada reporte (*Report → Generation*). Puedes generar reportes sin IA desactivando *Include AI analysis*.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example).

| Variable | Obligatoria | Descripción |
|---|---|---|
| `APP_URL` | sí | URL pública del panel (redirecciones OAuth, CORS). Por defecto `http://localhost:8080` |
| `FRONTEND_PORT` | no | Puerto del host para nginx (8080) |
| `CORS_ORIGINS` | no | Orígenes permitidos para peticiones mutantes, separados por comas |
| `APP_TIMEZONE` | no | Zona horaria IANA inicial (editable en Settings) |
| `APP_ACCESS_KEY` | **sí** | Clave para desbloquear el panel (≥ 12 caracteres) |
| `SESSION_SECRET` | **sí** | Firma de la cookie de sesión (≥ 32 caracteres) |
| `SESSION_TTL_HOURS` | no | Duración de la sesión (12 h) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | **sí** (password) | Base de datos (password alfanumérico) |
| `POSTGRES_HOST_PORT` | no | Puerto local de PostgreSQL (5434, solo 127.0.0.1) |
| `DATABASE_URL` | solo fuera de Docker | Conexión Prisma para desarrollo local |
| `TOKEN_ENCRYPTION_KEY` | **sí** | 32 bytes en base64 para cifrar tokens OAuth |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | para GSC | Credenciales OAuth del cliente web |
| `GOOGLE_OAUTH_REDIRECT_URI` | para GSC | Debe coincidir con la registrada en Google Cloud |
| `GSC_MAX_ROWS_PER_DIMENSION` | no | Filas máximas de consultas/páginas por periodo (5000; paginación de 25 000) |
| `ANTHROPIC_API_KEY` | para IA | API key de Anthropic |
| `ANTHROPIC_MODEL` | no | `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | no | `high` |
| `ANTHROPIC_MAX_OUTPUT_TOKENS` | no | 64000 |
| `ANTHROPIC_TIMEOUT_MS` / `ANTHROPIC_MAX_RETRIES` | no | 600000 / 3 |
| `ANTHROPIC_ENABLE_FALLBACK` | no | `true` |
| `STORAGE_DIR` | no | Directorio persistente (en Docker: `/data/storage`, volumen `report_storage`) |
| `CODARIO_LOGO_PATH` | no | Ruta al logo oficial (p. ej. `/app/branding/codario-logo.svg`) |
| `REPORT_WORKER_CONCURRENCY` | no | Reportes en paralelo (1) |
| `REPORT_JOB_TIMEOUT_MS` | no | Tiempo máximo por reporte (15 min) |
| `LOG_LEVEL` | no | `info` |

## Uso de la aplicación

| Sección | Para qué sirve |
|---|---|
| **Overview** | Compositor *Market → Period → Template → Generate report*, estado de integraciones y reportes recientes |
| **Markets** | Crear/editar/eliminar sitios: dominio, propiedad GSC (verificable), logo, colores, plantilla. En el detalle: rendimiento en vivo (gráfico interactivo de clics, impresiones, CTR y posición; top queries/pages/countries/devices; queries y páginas en crecimiento y caída) e historial |
| **Reports** | Historial con filtros por market, estado y fechas; progreso real, cancelar, reintentar, descargar, ver detalle (KPIs, análisis IA, datos) y eliminar |
| **Templates** | Crear, editar, duplicar, eliminar, marcar como predeterminada, restaurar valores por defecto y previsualizar en vivo |
| **Integrations** | Conectar/desconectar Google, propiedades (refrescar/verificar), estado de Anthropic, PDF y base de datos |
| **Settings** | Nombre de la empresa, zona horaria, periodo por defecto, retraso de datos, plantilla por defecto y **logo global de Codario Labs** |

### Periodos y comparación

| Preset | Periodo | Comparación |
|---|---|---|
| Últimos 7 / 14 / 28 / 30 días | hasta el último día con datos finales | mismos días inmediatamente anteriores |
| Últimos 3 / 6 / 12 meses | meses naturales hasta el último día disponible | periodo anterior de igual duración (12 meses: comparación parcial, GSC solo guarda 16 meses) |
| Semana anterior | lunes–domingo | semana previa (mismos días si la semana aún no tiene datos finales) |
| Mes anterior | mes natural completo | mes previo completo (o mismos días si aún no hay datos finales) |
| Mes actual | día 1 → último día disponible | mismos días del mes anterior |
| Personalizado | rango elegido (recortado al último día disponible) | rango inmediatamente anterior de igual duración |

El "último día disponible" se obtiene de la propia API (`metadata.first_incomplete_date`); si no está disponible, se usa el retraso configurado (3 días). En la posición media, **bajar es mejorar**: las variaciones se colorean por sentido, no por signo.

## Cómo se genera un reporte

Etapas reales (visibles en el panel con su duración):

1. **Fetching Search Console data** — totales, serie diaria y dimensiones `query`, `page`, `country`, `device`, `searchAppearance` para el periodo y la comparación (solo datos finales, paginación y reintentos con backoff ante 429/5xx).
2. **Processing metrics** — totales, deltas y series completas (un día sin filas = 0 impresiones; CTR y posición quedan vacíos, nunca inventados).
3. **Comparing periods** — unión por clave, *movers*, nuevas/perdidas, CTR bajo frente al CTR medio **del propio sitio** por rango de posición, posiciones 8–20; incidencias de calidad (tráfico anonimizado, filas truncadas, secciones con error vs. vacías).
4. **Generating AI insights** — `AnthropicService` envía el dataset reducido, exige salida JSON con esquema (salidas estructuradas), valida con Zod (1 reintento si no cumple), y **elimina cualquier consulta o URL que no exista en el dataset** (los avisos quedan registrados).
5. **Rendering PDF** — portada a sangre (sin encabezado/pie) + cuerpo con encabezado, pie, numeración y branding; Chromium sin JavaScript ni red; fusión y metadatos con pdf-lib.

Estructura del PDF (las secciones se pueden activar/desactivar por plantilla; las vacías se omiten o se indica que no hay datos): Portada · Resumen ejecutivo · Rendimiento general · Keywords · Páginas · Dispositivos y países · Apariencia en búsqueda (si hay datos) · Análisis SEO con IA · Plan de acción · Notas sobre los datos.

El branding de Codario Labs (logo o marca tipográfica) aparece **siempre** en la portada y en el pie de cada página; no es configurable desde las plantillas.

## Seguridad

- **Sin registro ni login de usuarios**: el panel se desbloquea con `APP_ACCESS_KEY` (comparación en tiempo constante, 10 intentos / 15 min). Se emite una cookie `HttpOnly`, `SameSite=Lax` (y `Secure` con HTTPS) firmada con HMAC-SHA256 y con caducidad. Todas las rutas de la API salvo `health`, `access` y el callback OAuth exigen esa sesión.
- **CSRF**: cookie `SameSite` + verificación de `Origin`/`Referer` en todas las peticiones mutantes. En OAuth: `state` aleatorio de un solo uso (guardado como hash, 10 min), vinculado a la sesión del panel que inició el flujo, y **PKCE (S256)**.
- **Tokens OAuth cifrados en reposo** (AES-256-GCM con IV aleatorio). Nunca se registran en logs (redacción en Pino).
- **Validación estricta** de entradas con Zod (cuerpos, parámetros, query); Prisma evita SQL injection.
- **Subidas**: límite de 2 MB, tipo verificado por firma binaria (no solo por MIME), SVG sin scripts/eventos/referencias externas/DTD; se sirven con `nosniff` y CSP `sandbox`; nombres generados por el servidor (sin path traversal).
- **HTML del PDF**: todo contenido (incluido el de la IA y las consultas de GSC) se escapa; Chromium renderiza sin JavaScript y con la red bloqueada.
- Helmet, CORS restringido, rate limiting general y específico (desbloqueo, OAuth, generación, subidas), errores internos nunca expuestos (`INTERNAL_ERROR` + `requestId`), nginx con CSP y cabeceras de seguridad, contenedores sin root, PostgreSQL publicado solo en `127.0.0.1`.

> Para exponer la app fuera de tu máquina, sírvela detrás de HTTPS (proxy inverso con TLS), cambia `APP_URL`, `CORS_ORIGINS` y la redirect URI de Google al dominio HTTPS.

## Desarrollo local sin Docker

Requisitos: Node.js ≥ 22.12 (probado con 24), npm ≥ 10, Docker solo para PostgreSQL.

```bash
npm install                                  # instala workspaces y genera el cliente Prisma
docker compose up -d postgres                # PostgreSQL en 127.0.0.1:5434
npm run db:deploy                            # aplica migraciones (usa DATABASE_URL de .env)
npm run db:seed                              # configuración y plantilla inicial
npx playwright install chromium              # navegador para generar PDFs (una vez)
npm run dev:backend                          # API en http://localhost:4000 (recarga en caliente)
npm run dev:frontend                         # panel en http://localhost:5173 (proxy /api → 4000)
```

Para Google en local con Vite, registra también `http://localhost:5173/api/integrations/google/callback` como redirect URI y úsala en `GOOGLE_OAUTH_REDIRECT_URI` (con `APP_URL=http://localhost:5173`).

## Tests y calidad

```bash
npm run typecheck      # TypeScript estricto en los tres paquetes
npm run lint           # ESLint (0 warnings)
npm test               # shared + backend + frontend
npm run build          # build de backend y frontend
npm run verify         # todo lo anterior
docker compose build   # imágenes de producción
```

- **shared**: periodos y comparaciones (todos los presets, meses cortos, semanas parciales, retención de 16 meses), deltas con sentido correcto de la posición, formato, esquemas.
- **backend**: cifrado, sesiones, subidas y SVG, entorno; cliente GSC (paginación, reintentos 429/5xx, refresh en 401, errores); transformación de datos y oportunidades; payload, prompts, anclaje y validación de la IA (respuestas inválidas, rechazos, truncado, errores del SDK); HTML/SVG/PDF real con Chromium; cola de trabajos; y un test de integración de extremo a extremo contra PostgreSQL real (BD aislada `*_test` creada y migrada automáticamente) que cubre acceso, CSRF, OAuth completo, propiedades, markets, plantillas, generación de reportes con PDF real, deduplicación, cancelación, reintento, filtros, descarga y borrado.
- **frontend**: navegación, pantalla de acceso, formulario de markets, selector de periodos, progreso de generación (en curso/completado/fallido), estados de carga y error, sentido de las variaciones.

Las integraciones externas se simulan **solo en los tests** (`apps/backend/src/test/fake-*.ts`); en producción siempre se usan las APIs reales.

## Operación con Docker

```bash
docker compose up -d --build        # construir y arrancar
docker compose logs -f              # todos los logs (JSON estructurado en el backend)
docker compose logs -f backend      # solo backend
docker compose ps                   # estado y healthchecks
docker compose restart backend      # tras cambiar .env
docker compose down                 # parar (los datos se conservan)
docker compose down -v              # ⚠ parar y BORRAR volúmenes (base de datos y PDFs)
```

Persistencia: `postgres_data` (base de datos) y `report_storage` (PDFs, logos). Copia de seguridad:

```bash
docker compose exec postgres pg_dump -U codario seo_reports > backup.sql
docker run --rm -v codario-seo-reports_report_storage:/data -v "$PWD":/backup alpine tar czf /backup/storage.tgz -C /data .
```

Las migraciones se aplican de forma controlada en el servicio `migrate` (`prisma migrate deploy`, nunca `migrate dev` ni `reset`) antes de arrancar el backend.

## Troubleshooting

| Síntoma | Causa / solución |
|---|---|
| `Invalid environment configuration` al arrancar | Falta o es inválida una variable obligatoria; el mensaje indica cuál. Revisa `.env`. |
| `Bind for 0.0.0.0:8080 failed: port is already allocated` | Cambia `FRONTEND_PORT` (y `APP_URL`, `CORS_ORIGINS`, redirect URI) o libera el puerto. |
| PostgreSQL: puerto 5434 ocupado | Cambia `POSTGRES_HOST_PORT`. |
| *Google OAuth is not configured* | Faltan `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`. Ver [Configurar Google Cloud](#configurar-google-cloud-y-search-console). |
| Google: `redirect_uri_mismatch` | La URI registrada en Google Cloud debe ser idéntica a `GOOGLE_OAUTH_REDIRECT_URI` (protocolo, puerto, ruta). |
| Callback con `reason=session_mismatch` | El flujo se inició en otra sesión/navegador o la sesión caducó. Desbloquea el panel y conecta desde el mismo navegador. |
| *Google access was revoked or expired* | El refresh token fue revocado (o caducó: apps *External* en *Testing* caducan a los 7 días). Reconecta en *Integrations*; para evitarlo, publica la app o usa tipo *Internal*. |
| `GSC_PROPERTY_INACCESSIBLE` | La cuenta conectada no tiene acceso a esa propiedad: añádela en Search Console (*Settings → Users and permissions*) o elige otra propiedad. Usa *Verify access*. |
| `PERIOD_UNAVAILABLE` | El periodo aún no tiene datos finales (p. ej. "Mes actual" los primeros días) o es anterior a 16 meses. |
| Reporte "sin datos" | GSC no registró impresiones en el periodo (no es un error de conexión). La sección de notas lo indica. |
| `AI_AUTH_FAILED` / `AI_MODEL_NOT_FOUND` | API key inválida o modelo no disponible para tu cuenta: revisa `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`. |
| `AI_OUTPUT_TRUNCATED` | Sube `ANTHROPIC_MAX_OUTPUT_TOKENS` o baja `ANTHROPIC_EFFORT`. |
| PDF engine *unavailable* (desarrollo local) | Ejecuta `npx playwright install chromium`. En Docker ya está incluido. |
| `INTERRUPTED` en un reporte | El backend se reinició durante la generación. Usa *Retry*. |
| Logs | `docker compose logs -f backend`. Cada error de la API incluye un `requestId` que aparece en los logs. |

## Limitaciones conocidas

- La app es single-user por diseño (una cuenta de Google conectada; conectar otra reemplaza la anterior).
- La cola de reportes vive en el proceso del backend (adecuada para uso privado); para escalar horizontalmente habría que moverla a una cola externa.
- Search Console anonimiza parte de las consultas y conserva 16 meses: el reporte lo indica cuando afecta a los datos.
- El análisis IA no conoce el contenido de las páginas (titles, meta descriptions): sus sugerencias de snippet se presentan como hipótesis a validar.
