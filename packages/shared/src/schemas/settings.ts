import { z } from 'zod';
import { isValidTimeZone } from '../dates';
import { PERIOD_PRESETS } from '../periods';

export const settingsUpdateSchema = z.object({
  companyName: z.string().trim().min(2).max(80).optional(),
  timezone: z
    .string()
    .trim()
    .refine((tz) => isValidTimeZone(tz), 'Unknown IANA time zone (e.g. America/Bogota)')
    .optional(),
  defaultPeriodPreset: z.enum(PERIOD_PRESETS).exclude(['CUSTOM']).optional(),
  dataDelayDays: z.number().int().min(1).max(7).optional(),
  defaultTemplateId: z.string().trim().max(64).nullish(),
});
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>;

export const accessUnlockSchema = z.object({
  accessKey: z.string().min(1, 'Access key is required').max(512),
});
export type AccessUnlockInput = z.infer<typeof accessUnlockSchema>;

export const verifyPropertySchema = z.object({
  siteUrl: z.string().trim().min(1).max(2048),
});

export const COMMON_TIMEZONES = [
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Caracas',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
] as const;
