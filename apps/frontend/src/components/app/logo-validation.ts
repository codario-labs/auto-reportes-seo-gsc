export const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Validación en cliente (el servidor vuelve a validar MIME real y tamaño). */
export function validateLogoFile(file: File): string | null {
  if (!LOGO_ACCEPTED_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or SVG file.';
  if (file.size > LOGO_MAX_BYTES) return 'The logo must be 2 MB or smaller.';
  return null;
}
