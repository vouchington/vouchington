import type { ModerationReportEntityType } from './config.mts'
import {
  getLatestJudgementsForEntitiesBatch,
  type ModerationJudgementAction,
} from './judgements.mts'
import { getReportJudgementContextsForEntitiesBatch } from './judgement-context.mts'

/** Judgement summary for staff/moderator-tier viewers (the only tier that receives it). */
export interface FullJudgementSummary {
  recommended_action: ModerationJudgementAction
  public_response: string
  internal_response: string
  is_stale: boolean
  judged_report_count: number | null
  current_report_count: number
}

/** Attach `judgement` to each report-like object that has entity_type and entity_id. */
export async function attachJudgements<
  T extends { entity_type: ModerationReportEntityType; entity_id: string },
>(items: T[]): Promise<Array<T & { judgement: FullJudgementSummary | null }>> {
  if (items.length === 0) return []

  const seen = new Set<string>()
  const entities: Array<{ entityType: ModerationReportEntityType; entityId: string }> = []
  for (const item of items) {
    const key = `${item.entity_type}:${item.entity_id}`
    if (!seen.has(key)) {
      seen.add(key)
      entities.push({ entityType: item.entity_type, entityId: item.entity_id })
    }
  }

  const [judgementsMap, contextsMap] = await Promise.all([
    getLatestJudgementsForEntitiesBatch(entities),
    getReportJudgementContextsForEntitiesBatch(entities),
  ])
  return items.map(item => {
    const key = `${item.entity_type}:${item.entity_id}`
    const raw = judgementsMap.get(key)
    const context = contextsMap.get(key)
    const judgement: FullJudgementSummary | null = raw
      ? {
          recommended_action: raw.recommended_action,
          public_response: raw.public_response,
          internal_response: raw.internal_response,
          is_stale: raw.context_hash !== context?.contextHash,
          judged_report_count: raw.context_report_count,
          current_report_count: context?.reportCount ?? 0,
        }
      : null
    return { ...item, judgement }
  })
}
