import { moderationAiDispatchConfig } from '@services/moderation/ai-config'
import { getUndispatchedJudgements } from '@services/moderation-reports'
import { enqueueAutoDispatchJudgement } from '@queues/ai-agents/enqueues/auto-dispatch-judgement'

/**
 * Reconciler for orphaned auto-dispatch judgements.
 *
 * If the process crashes between insertReportJudgement and enqueueAutoDispatchJudgement in
 * process-report-judgement.mts, the judgement row is durable but the auto-dispatch job is never
 * enqueued — leaving the triggering report stuck pending. This reconciler re-enqueues those
 * judgements within a 2–30 minute window so the crash window is always recovered.
 *
 * Edge cases by design:
 * - Disabled feature: returns early; nothing is stamped or actioned while OFF.
 * - Flag first enabled: historical judgements are >30 min old and excluded — no retroactive backlog.
 * - 2-min lower bound: avoids racing the in-flight original job.
 * - rerun_by_id IS NOT NULL: staff re-runs are intentionally excluded.
 * - enqueueAutoDispatchJudgement deduplicates by judgement_id (mode:'simple') — safe to call twice.
 */
export async function processReconcileAutoDispatchJudgements(): Promise<void> {
  const config = moderationAiDispatchConfig.getFields()
  if (!config.auto_dispatch_enabled) return

  const rows = await getUndispatchedJudgements()
  await Promise.all(rows.map(row => enqueueAutoDispatchJudgement(row)))
}
