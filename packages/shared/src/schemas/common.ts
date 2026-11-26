import { z } from 'zod';
import { isIsoDate } from '../dates';

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #1F2937')
  .transform((v) => v.toUpperCase());

export const isoDateSchema = z.string().refine((v) => isIsoDate(v), 'Use a valid date (YYYY-MM-DD)');

export const idSchema = z.string().trim().min(1).max(64);

export const idParamsSchema = z.object({ id: idSchema });

/** Acepta "codariolabs.com", "https://www.codariolabs.com/blog" y normaliza a hostname. */
export const domainSchema = z
  .string()
  .trim()
  .min(1, 'Domain is required')
  .max(253)
  .transform((value) => {
    let v = value.toLowerCase();
    v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    v = v.split(/[/?#]/)[0] ?? '';
    v = v.replace(/:\d+$/, '');
    return v.replace(/\.$/, '');
  })
  .refine(
    (v) => /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(v),
    'Enter a valid domain, e.g. example.com',
  );

/** URL de propiedad de Search Console: "sc-domain:example.com" o "https://www.example.com/". */
export const gscSiteUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    if (v.startsWith('sc-domain:')) return /^sc-domain:[a-z0-9.-]+$/i.test(v);
    try {
      const url = new URL(v);
      return (url.protocol === 'https:' || url.protocol === 'http:') && v.endsWith('/');
    } catch {
      return false;
    }
  }, 'Invalid Search Console property URL');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
