# Branding global de Codario Labs

El logo oficial de Codario Labs **no se incluye en el repositorio** (no se inventa ni se redistribuye).
Hay dos formas de incorporarlo; aparecerá en la portada y en el pie de página de **todos** los PDFs:

1. **Desde el panel** (recomendado): *Settings → Codario Labs logo → Upload*. Se guarda en el volumen persistente y tiene prioridad.
2. **Desde archivo**: copia el archivo oficial en esta carpeta (p. ej. `branding/codario-logo.svg`) y define en `.env`:

   ```env
   # Con Docker Compose, ./branding se monta en /app/branding (solo lectura)
   CODARIO_LOGO_PATH=/app/branding/codario-logo.svg
   # Ejecutando el backend fuera de Docker:
   # CODARIO_LOGO_PATH=../../branding/codario-logo.svg
   ```

Formatos admitidos: SVG (sin scripts ni referencias externas), PNG, JPEG o WebP, hasta 2 MB.
Si no hay logo configurado, los reportes muestran el nombre "Codario Labs" como marca tipográfica.
