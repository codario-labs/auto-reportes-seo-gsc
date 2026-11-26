import type { AiAnalysis } from '@codario/shared';

/**
 * Verificación de anclaje: elimina referencias a consultas/URLs que no existen en el dataset
 * enviado a la IA, y registra cada eliminación como aviso.
 */
export function enforceGrounding(
  analysis: AiAnalysis,
  known: { queries: Set<string>; pages: Set<string> },
): { analysis: AiAnalysis; warnings: string[] } {
  const warnings: string[] = [];
  const normalize = (v: string) => v.trim();
  const queryLookup = new Map([...known.queries].map((q) => [normalize(q).toLowerCase(), q]));
  const pageLookup = new Map([...known.pages].map((p) => [normalize(p), p]));

  const filterQueries = (values: string[], where: string) =>
    values.flatMap((value) => {
      const match = queryLookup.get(normalize(value).toLowerCase());
      if (match) return [match];
      warnings.push(`Removed unknown query "${value}" from ${where}`);
      return [];
    });
  const filterPages = (values: string[], where: string) =>
    values.flatMap((value) => {
      const match = pageLookup.get(normalize(value));
      if (match) return [match];
      warnings.push(`Removed unknown page "${value}" from ${where}`);
      return [];
    });

  const fixFinding = <T extends { relatedQueries: string[]; relatedPages: string[] }>(item: T, where: string): T => ({
    ...item,
    relatedQueries: filterQueries(item.relatedQueries, where),
    relatedPages: filterPages(item.relatedPages, where),
  });

  const ctrItems = analysis.ctrOpportunities.items.flatMap((item) => {
    if (item.targetType === 'query') {
      const match = queryLookup.get(normalize(item.target).toLowerCase());
      if (match) return [{ ...item, target: match }];
    } else {
      const match = pageLookup.get(normalize(item.target));
      if (match) return [{ ...item, target: match }];
    }
    warnings.push(`Removed CTR opportunity for unknown ${item.targetType} "${item.target}"`);
    return [];
  });

  return {
    warnings,
    analysis: {
      ...analysis,
      keywordAnalysis: {
        ...analysis.keywordAnalysis,
        findings: analysis.keywordAnalysis.findings.map((f) => fixFinding(f, 'keyword findings')),
      },
      pageAnalysis: {
        ...analysis.pageAnalysis,
        findings: analysis.pageAnalysis.findings.map((f) => fixFinding(f, 'page findings')),
      },
      ctrOpportunities: { ...analysis.ctrOpportunities, items: ctrItems },
      recommendations: analysis.recommendations.map((r) => fixFinding(r, 'recommendations')),
      opportunities: analysis.opportunities.map((o) => fixFinding(o, 'opportunities')),
    },
  };
}
