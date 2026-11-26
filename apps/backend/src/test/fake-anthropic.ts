/**
 * Cliente de Anthropic simulado EXCLUSIVO PARA TESTS: devuelve mensajes con la forma real de la API.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiAnalysis } from '@codario/shared';

export interface FakeAnthropicCall {
  params: Record<string, unknown>;
}

export function fakeMessage(text: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 4200, output_tokens: 3100, iterations: null },
    ...overrides,
  };
}

export function createFakeAnthropic(responses: Array<ReturnType<typeof fakeMessage> | Error>): {
  client: Anthropic;
  calls: FakeAnthropicCall[];
} {
  const calls: FakeAnthropicCall[] = [];
  let index = 0;
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push({ params });
          const response = responses[Math.min(index, responses.length - 1)];
          index += 1;
          return {
            finalMessage: async () => {
              if (response instanceof Error) throw response;
              return response;
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

/** Análisis de ejemplo que respeta el esquema (referencias a claves del dataset simulado). */
export function sampleAnalysis(overrides: Partial<AiAnalysis> = {}): AiAnalysis {
  return {
    executiveSummary: {
      headline: 'Los clics crecieron frente al periodo anterior',
      overallStatus: 'positive',
      overview: 'El sitio mantuvo una tendencia positiva en clics e impresiones.',
      keyResults: ['Crecimiento de clics'],
      relevantChanges: ['Mejora en consultas de marca'],
      detectedIssues: ['CTR bajo en "posicionamiento web"'],
      opportunities: ['Consultas en posiciones 8–20'],
    },
    performanceAnalysis: {
      clicks: 'Los clics aumentaron.',
      impressions: 'Las impresiones aumentaron.',
      ctr: 'El CTR se mantuvo estable.',
      position: 'La posición media mejoró ligeramente.',
      synthesis: 'Mayor visibilidad con CTR estable.',
    },
    keywordAnalysis: {
      summary: 'Las consultas principales concentran la mayor parte del tráfico.',
      findings: [
        {
          title: 'CTR bajo',
          detail: 'La consulta tiene muchas impresiones y pocos clics.',
          kind: 'fact',
          relatedQueries: ['posicionamiento web', 'consulta inventada que no existe'],
          relatedPages: [],
        },
      ],
    },
    pageAnalysis: {
      summary: 'La home concentra el tráfico.',
      findings: [
        {
          title: 'Home dominante',
          detail: 'La home recibe la mayoría de clics.',
          kind: 'hypothesis',
          relatedQueries: [],
          relatedPages: ['https://codariolabs.com/'],
        },
      ],
    },
    ctrOpportunities: {
      summary: 'Hay margen de mejora en CTR.',
      items: [
        { target: 'posicionamiento web', targetType: 'query', observation: 'CTR inferior a la referencia.', suggestedActions: ['Revisar el title'] },
        { target: 'https://inventada.com/x', targetType: 'page', observation: 'No existe', suggestedActions: [] },
      ],
    },
    recommendations: [
      {
        priority: 'high',
        title: 'Optimizar snippet de "posicionamiento web"',
        problem: 'CTR bajo',
        evidence: 'Impresiones altas con pocos clics',
        potentialImpact: 'Más clics',
        action: 'Reescribir title y meta description',
        justification: 'Posición competitiva',
        relatedQueries: ['posicionamiento web'],
        relatedPages: [],
      },
    ],
    opportunities: [{ title: 'Striking distance', description: 'Consultas cerca de la primera página', evidence: 'Posición 8–20', relatedQueries: [], relatedPages: [] }],
    conclusions: { summary: 'Rendimiento positivo.', roadmap: [{ horizon: 'immediate', action: 'Optimizar snippets' }] },
    dataLimitations: ['Consultas anonimizadas'],
    ...overrides,
  };
}
