import multer from 'multer';
import { Errors } from './errors';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type ImageExtension = 'png' | 'jpg' | 'webp' | 'svg';

export interface DetectedImage {
  ext: ImageExtension;
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
}

/** Marca de orden de bytes UTF-8 (U+FEFF). */
const BOM = String.fromCharCode(0xfeff);

const ALLOWED_DECLARED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']);

/** Subida en memoria con límites estrictos; el contenido se valida por firma (magic bytes). */
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 5, parts: 6 },
}).single('file');

/** Detecta el tipo real del archivo a partir de su contenido. */
export function detectImage(buffer: Buffer): DetectedImage | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  const text = buffer.subarray(0, 1024).toString('utf8');
  const head = (text.startsWith(BOM) ? text.slice(1) : text).trimStart();
  const withoutProlog = head.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/^(<!--[\s\S]*?-->\s*)+/, '');
  if (/^<svg[\s>]/i.test(withoutProlog)) {
    return { ext: 'svg', mime: 'image/svg+xml' };
  }
  return null;
}

const SVG_FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/<script[\s>]/i, 'scripts'],
  [/\son[a-z]+\s*=/i, 'event handlers'],
  [/javascript\s*:/i, 'javascript: URLs'],
  [/<foreignObject[\s>]/i, 'foreignObject elements'],
  [/<(iframe|embed|object|audio|video)[\s>]/i, 'embedded content'],
  [/<!(DOCTYPE|ENTITY)/i, 'DTD / entity declarations'],
  [/(href|src)\s*=\s*["']\s*(https?:|\/\/|file:)/i, 'external references'],
  [/url\(\s*["']?\s*(https?:|\/\/|file:)/i, 'external CSS references'],
  [/@import/i, 'CSS imports'],
];

/** Rechaza SVG con contenido activo o referencias externas (XSS / SSRF al renderizar el PDF). */
export function assertSafeSvg(buffer: Buffer): void {
  const text = buffer.toString('utf8');
  for (const [pattern, label] of SVG_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      throw Errors.unsupportedMedia(`SVG logos cannot contain ${label}.`);
    }
  }
}

export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

/** Valida tamaño, tipo declarado y tipo real de un logo subido. */
export function validateLogoUpload(file: UploadedFileLike | undefined): DetectedImage {
  if (!file) {
    throw Errors.validation([{ path: 'file', message: 'Attach an image file in the "file" field.' }], 'No file uploaded.');
  }
  if (file.size > MAX_LOGO_BYTES || file.buffer.length > MAX_LOGO_BYTES) {
    throw Errors.fileTooLarge(MAX_LOGO_BYTES);
  }
  if (!ALLOWED_DECLARED_MIME.has(file.mimetype.toLowerCase())) {
    throw Errors.unsupportedMedia('Only PNG, JPEG, WebP or SVG images are allowed.');
  }
  const detected = detectImage(file.buffer);
  if (!detected) {
    throw Errors.unsupportedMedia('The file content is not a valid PNG, JPEG, WebP or SVG image.');
  }
  const declared = file.mimetype.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.mimetype.toLowerCase();
  if (declared !== detected.mime) {
    throw Errors.unsupportedMedia('The file type does not match its content.');
  }
  if (detected.ext === 'svg') assertSafeSvg(file.buffer);
  return detected;
}

export function mimeFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
