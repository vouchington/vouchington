import { getReportJudgementContextsForEntitiesBatch } from '@services/moderation-reports/judgement-context'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { REPORT_CONTEXT_REPORTS_PER_ENTITY } from '../seed-data/moderation-report-context-counts.mts'
import { loadReportContextEntities } from '../seed-data/moderation-report-contexts.mts'

const REPORT_INDEXES = [
  'idx_moderation_reports__pending_post_id_id',
  'idx_moderation_reports__pending_reported_user_id_id',
  'idx_moderation_reports__pending_hostname_id_id',
  'idx_moderation_reports__pending_rss_feed_item_id_id',
] as const

// Pending reports on posts, users, hostnames, and feed items share one statement. Each entity
// kind probes its pending ordered index. Resolved branches may use another index when they
// match nothing. Every entity carries more reports than the judgement cap.
export async function runModerationReportContextScenarios(): Promise<void> {
  registerScenarioContract('report-judgement-contexts-batch', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: REPORT_INDEXES,
        queryContains: 'getReportJudgementContextsForEntitiesBatch',
      },
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 792 },
    ],
  })
  const entities = await loadReportContextEntities()
  await runAndCapture(
    'report-judgement-contexts-batch',
    async () => {
      const contexts = await getReportJudgementContextsForEntitiesBatch(entities)
      for (const entity of entities) {
        const context = contexts.get(`${entity.entityType}:${entity.entityId}`)
        if (context?.reportCount !== REPORT_CONTEXT_REPORTS_PER_ENTITY)
          throw new Error('Every seeded entity must report its full pending report count')
      }
    },
    undefined,
    'getReportJudgementContextsForEntitiesBatch',
  )
}
