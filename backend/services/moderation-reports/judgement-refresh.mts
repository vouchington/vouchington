import type { ModerationReportEntityType } from './config.mts'
import {
  getReportJudgementContextForEntity,
  type ReportJudgementContext,
} from './judgement-context.mts'
import { getLatestJudgementForEntity } from './judgements.mts'

export async function shouldRefreshReportJudgementForEntity(
  entityType: ModerationReportEntityType,
  entityId: string,
): Promise<{ refresh: boolean; context: ReportJudgementContext }> {
  const [latest, context] = await Promise.all([
    getLatestJudgementForEntity(entityType, entityId),
    getReportJudgementContextForEntity(entityType, entityId),
  ])
  if (context.reportCount === 0) return { refresh: false, context }
  if (!latest) return { refresh: true, context }
  if (!latest.context_hash) return { refresh: true, context }
  if (latest.context_report_count !== context.reportCount) return { refresh: true, context }
  if ((latest.context_max_reason_rank ?? 0) < context.maxReasonRank) {
    return { refresh: true, context }
  }
  if (latest.context_note_hash !== context.noteHash) return { refresh: true, context }
  return { refresh: false, context }
}
