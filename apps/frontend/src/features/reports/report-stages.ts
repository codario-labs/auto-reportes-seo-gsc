import type { ReportDTO, ReportStage } from '@codario/shared';

export type StageState = 'pending' | 'active' | 'done' | 'failed' | 'cancelled';

export function stagesFor(includeAi: boolean): ReportStage[] {
  return [
    'FETCHING_DATA',
    'PROCESSING_METRICS',
    'COMPARING_PERIODS',
    ...(includeAi ? (['GENERATING_INSIGHTS'] as const) : []),
    'RENDERING_PDF',
  ];
}

export function stageState(report: ReportDTO, stage: ReportStage): StageState {
  if (report.status === 'COMPLETED') return 'done';
  const stages = stagesFor(report.includeAi);
  const index = stages.indexOf(stage);
  const currentIndex = stages.indexOf(report.stage);
  if (report.stageTimings[stage] !== undefined && index !== currentIndex) return 'done';
  if (report.status === 'QUEUED') return 'pending';
  if (currentIndex === -1) return 'pending';
  if (index < currentIndex) return 'done';
  if (index > currentIndex) return 'pending';
  if (report.status === 'RUNNING') return 'active';
  return report.status === 'FAILED' ? 'failed' : 'cancelled';
}
