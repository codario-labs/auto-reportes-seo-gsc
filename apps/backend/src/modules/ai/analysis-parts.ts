import { aiAnalysisSchema } from '@codario/shared';

/**
 * El esquema completo del análisis es demasiado grande para las salidas estructuradas de la API
 * ("The compiled grammar is too large"). Se divide en tres partes que compilan por separado;
 * juntas cubren exactamente todas las claves de `aiAnalysisSchema`.
 */
export const diagnosisSchema = aiAnalysisSchema.pick({
  executiveSummary: true,
  performanceAnalysis: true,
  dataLimitations: true,
});

export const findingsSchema = aiAnalysisSchema.pick({
  keywordAnalysis: true,
  pageAnalysis: true,
  ctrOpportunities: true,
});

export const actionsSchema = aiAnalysisSchema.pick({
  recommendations: true,
  opportunities: true,
  conclusions: true,
});

export interface AnalysisPart {
  name: 'diagnosis' | 'findings' | 'actions';
  schema: typeof diagnosisSchema | typeof findingsSchema | typeof actionsSchema;
  sections: string;
  focus: string;
}

export const DIAGNOSIS_PART: AnalysisPart = {
  name: 'diagnosis',
  schema: diagnosisSchema,
  sections: 'executiveSummary, performanceAnalysis y dataLimitations',
  focus:
    'Céntrate en el diagnóstico general del periodo: situación, resultados, cambios, problemas, oportunidades y la interpretación de clics, impresiones, CTR y posición. El detalle por keyword y página, y el plan de acción, se redactan en otras partes.',
};

export const FINDINGS_PART: AnalysisPart = {
  name: 'findings',
  schema: findingsSchema,
  sections: 'keywordAnalysis, pageAnalysis y ctrOpportunities',
  focus:
    'Céntrate en el análisis detallado de consultas y páginas (crecimiento, caídas, CTR bajo, posiciones 8–20, nuevas y perdidas) y en las oportunidades de CTR.',
};

export const ACTIONS_PART: AnalysisPart = {
  name: 'actions',
  schema: actionsSchema,
  sections: 'recommendations, opportunities y conclusions',
  focus:
    'Convierte el diagnóstico y los hallazgos en un plan de acción priorizado: recomendaciones concretas con evidencia numérica, oportunidades de crecimiento y conclusiones con hoja de ruta.',
};
