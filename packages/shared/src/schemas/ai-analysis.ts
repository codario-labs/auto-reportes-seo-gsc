import { z } from 'zod';

/**
 * Esquema de la respuesta estructurada del análisis SEO generado por Anthropic.
 * Se usa como formato de salida (JSON Schema) y se valida de nuevo con Zod al recibirla.
 * Evita restricciones no soportadas por las salidas estructuradas (min/max, patrones).
 */

export const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const PRIORITY_LABELS: Record<PriorityLevel, { en: string; es: string }> = {
  critical: { en: 'Critical', es: 'Crítica' },
  high: { en: 'High', es: 'Alta' },
  medium: { en: 'Medium', es: 'Media' },
  low: { en: 'Low', es: 'Baja' },
};

export const OVERALL_STATUSES = ['positive', 'stable', 'mixed', 'negative', 'insufficient_data'] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

export const OVERALL_STATUS_LABELS: Record<OverallStatus, { en: string; es: string }> = {
  positive: { en: 'Positive', es: 'Positivo' },
  stable: { en: 'Stable', es: 'Estable' },
  mixed: { en: 'Mixed', es: 'Mixto' },
  negative: { en: 'Negative', es: 'Negativo' },
  insufficient_data: { en: 'Insufficient data', es: 'Datos insuficientes' },
};

export const ROADMAP_HORIZONS = ['immediate', 'short_term', 'medium_term'] as const;
export const ROADMAP_HORIZON_LABELS: Record<(typeof ROADMAP_HORIZONS)[number], { en: string; es: string }> = {
  immediate: { en: 'Immediate (0–2 weeks)', es: 'Inmediato (0–2 semanas)' },
  short_term: { en: 'Short term (2–6 weeks)', es: 'Corto plazo (2–6 semanas)' },
  medium_term: { en: 'Medium term (1–3 months)', es: 'Medio plazo (1–3 meses)' },
};

const findingSchema = z.object({
  title: z.string().describe('Título breve del hallazgo'),
  detail: z.string().describe('Explicación con cifras tomadas literalmente de los datos'),
  kind: z
    .enum(['fact', 'hypothesis'])
    .describe('fact = observado directamente en los datos; hypothesis = posible causa no verificable con los datos'),
  relatedQueries: z.array(z.string()).describe('Consultas exactas del dataset relacionadas (puede estar vacío)'),
  relatedPages: z.array(z.string()).describe('URLs exactas del dataset relacionadas (puede estar vacío)'),
});

export const aiAnalysisSchema = z.object({
  executiveSummary: z.object({
    headline: z.string().describe('Titular de una frase sobre el rendimiento del periodo'),
    overallStatus: z.enum(OVERALL_STATUSES),
    overview: z.string().describe('Situación general en 1-2 párrafos'),
    keyResults: z.array(z.string()),
    relevantChanges: z.array(z.string()),
    detectedIssues: z.array(z.string()),
    opportunities: z.array(z.string()),
  }),
  performanceAnalysis: z.object({
    clicks: z.string(),
    impressions: z.string(),
    ctr: z.string(),
    position: z.string(),
    synthesis: z.string().describe('Interpretación conjunta y causas respaldadas por los datos'),
  }),
  keywordAnalysis: z.object({
    summary: z.string(),
    findings: z.array(findingSchema),
  }),
  pageAnalysis: z.object({
    summary: z.string(),
    findings: z.array(findingSchema),
  }),
  ctrOpportunities: z.object({
    summary: z.string(),
    items: z.array(
      z.object({
        target: z.string().describe('Consulta o URL exacta tal como aparece en el dataset'),
        targetType: z.enum(['query', 'page']),
        observation: z.string().describe('Por qué es una oportunidad, con cifras del dataset'),
        suggestedActions: z
          .array(z.string())
          .describe('Mejoras posibles en title, meta description, intención o contenido, formuladas como hipótesis'),
      }),
    ),
  }),
  recommendations: z.array(
    z.object({
      priority: z.enum(PRIORITY_LEVELS),
      title: z.string(),
      problem: z.string().describe('Problema detectado'),
      evidence: z.string().describe('Evidencia numérica tomada del dataset'),
      potentialImpact: z.string(),
      action: z.string().describe('Acción concreta recomendada'),
      justification: z.string(),
      relatedQueries: z.array(z.string()),
      relatedPages: z.array(z.string()),
    }),
  ),
  opportunities: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      evidence: z.string(),
      relatedQueries: z.array(z.string()),
      relatedPages: z.array(z.string()),
    }),
  ),
  conclusions: z.object({
    summary: z.string(),
    roadmap: z.array(
      z.object({
        horizon: z.enum(ROADMAP_HORIZONS),
        action: z.string(),
      }),
    ),
  }),
  dataLimitations: z.array(z.string()).describe('Limitaciones de los datos que condicionan el análisis'),
});

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
export type AiFinding = z.infer<typeof findingSchema>;
export type AiRecommendation = AiAnalysis['recommendations'][number];
export type AiCtrOpportunity = AiAnalysis['ctrOpportunities']['items'][number];

export interface AiAnalysisMeta {
  model: string;
  /** Modelo que realmente respondió (puede diferir si se activó un fallback). */
  servedBy: string;
  fallbackUsed: boolean;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  attempts: number;
  /** Referencias a consultas/páginas que no existen en el dataset y fueron eliminadas. */
  groundingWarnings: string[];
  generatedAt: string;
}
