import type { Job } from 'glide-mq'
import type { ReportJudgementJobData } from '@queues/ai-agents/types'
import { enqueueAutoDispatchJudgement } from '@queues/ai-agents/enqueues/auto-dispatch-judgement'
import { runReportJudgementAgent } from '@agents/report-judgement'
import type { ModerationReportEntityType } from '@services/moderation-reports'
import onError from '@modules/on-error'

export async function processReportJudgement(job: Job<ReportJudgementJobData>): Promise<unknown> {
  const { entity_type, entity_id, triggering_report_id, rerun_by_id } = job.data
  const result = await runReportJudgementAgent({
    entityType: entity_type as ModerationReportEntityType,
    entityId: entity_id,
    triggeringReportId: triggering_report_id,
    rerunById: rerun_by_id ?? null,
  })

  if (!result) return { success: true }

  /* v8 ignore start -- only reachable when the AI agent returns a real judgement (requires OpenAI credentials) */
  const { judgement, communityId } = result
  const reportId = judgement.triggering_report_id ?? triggering_report_id
  // N2: alert staff on escalate recommendations
  if (judgement.recommended_action === 'escalate' && reportId) {
    void Promise.resolve(
      import('@services/notifications/create-critical-moderation-alert-notification').then(m =>
        m.createCriticalModerationAlertNotification(reportId),
      ),
    ).catch(onError)
  }

  // R4: auto-dispatch only for automated runs; staff re-runs (rerun_by_id set) skip it
  if (!rerun_by_id) {
    await enqueueAutoDispatchJudgement({
      judgement_id: judgement.id,
      entity_type,
      entity_id,
      community_id: communityId,
    })
  }

  return { success: true }
  /* v8 ignore stop */
}
