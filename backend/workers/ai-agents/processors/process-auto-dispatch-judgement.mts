import type { Job } from 'glide-mq'
import type { AutoDispatchJudgementJobData } from '@queues/ai-agents/types'
import { moderationAiDispatchConfig } from '@services/moderation/ai-config'
import {
  getReportJudgementContextForEntity,
  getJudgementById,
  getLatestJudgementForEntity,
  markJudgementDispatched,
} from '@services/moderation-reports'
import { resolveModerationReport } from '@services/moderation-reports/resolve'
import { getModerationSystemUserId } from '@services/users/system-users'
import { createUserWarning } from '@services/user-warnings/create'
import { escalateModerationQueueItem } from '@services/moderation-threads/escalate'
import { unpublishPostAsAgent } from '@services/communities/publications/agent-moderate'
import { removeCommentAsAgent } from '@services/posts/agent-moderate'
import { updateClearanceStatus } from '@services/post-clearance/update-status'
import { getPostByAny } from '@services/posts/get'

// No 'suspend' case: automod cannot suspend users.
// ModerationJudgementAction has no 'suspend' variant, enforcing this structurally.

export async function processAutoDispatchJudgement(
  job: Job<AutoDispatchJudgementJobData>,
): Promise<void> {
  const { judgement_id, entity_type, entity_id, community_id } = job.data
  const config = moderationAiDispatchConfig.getFields()
  if (!config.auto_dispatch_enabled) return

  const judgement = await getJudgementById(judgement_id)
  if (!judgement) return
  // Gap 1: idempotency guard — job already completed on a prior attempt (glide-mq retry).
  if (judgement.dispatched_at) return

  // Gap 2: skip stale judgements that have been superseded by a newer one.
  // The stale judgement's own triggering report is left pending for staff — acceptable,
  // because the newer judgement handles the content via its own dispatch.
  const latest = await getLatestJudgementForEntity(judgement.entity_type, judgement.entity_id)
  if (latest && latest.id !== judgement.id) {
    await markJudgementDispatched(judgement_id)
    return
  }
  const currentContext = await getReportJudgementContextForEntity(
    judgement.entity_type,
    judgement.entity_id,
  )
  if (judgement.context_hash !== currentContext.contextHash) {
    await markJudgementDispatched(judgement_id)
    return
  }

  const { recommended_action, triggering_report_id } = judgement
  const systemUserId = await getModerationSystemUserId()

  switch (recommended_action) {
    case 'escalate':
      await dispatchEscalate(systemUserId, community_id, triggering_report_id)
      break
    case 'remove':
      if (config.auto_dispatch_remove)
        await dispatchRemove(
          entity_type,
          entity_id,
          community_id,
          systemUserId,
          triggering_report_id,
        )
      break
    case 'warn':
      if (config.auto_dispatch_warn)
        await dispatchWarn(entity_type, entity_id, community_id, systemUserId, triggering_report_id)
      break
    case 'no_action':
      if (config.auto_dispatch_no_action) await dispatchNoAction(systemUserId, triggering_report_id)
      break
    default:
      // v8 ignore next
      recommended_action satisfies never
  }

  // Gap 1: stamp dispatched_at so the reconciler skips this judgement on retry.
  // Placed after the switch so errors propagate without stamping (enabling retries).
  await markJudgementDispatched(judgement_id)
}

async function dispatchEscalate(
  systemUserId: string,
  communityId: string | null,
  reportId: string | null,
): Promise<void> {
  // Platform-level escalations: N2 critical_moderation_alert already notifies staff.
  if (!communityId || !reportId) return
  try {
    await escalateModerationQueueItem(systemUserId, { communityId, reportId })
  } catch (err) {
    // v8 ignore next 2 -- 404 path requires escalateModerationQueueItem to throw; no real-DB fixture
    if ((err as { status?: number }).status === 404) return
    // v8 ignore next -- non-404 errors (e.g. wrong-community 403) propagate; no simple test fixture
    throw err
  }
}

async function dispatchRemove(
  entityType: string,
  entityId: string,
  communityId: string | null,
  systemUserId: string,
  reportId: string | null,
): Promise<void> {
  if (entityType !== 'post' && entityType !== 'comment') return
  let result: 'removed' | 'already-removed' | 'not-applicable'
  if (entityType === 'comment') {
    // All comments (community and platform) are removed via soft-delete.
    // Clearance rejection does NOT hide comments — only deleted_at does.
    result = await removeCommentAsAgent(entityId)
  } else if (communityId) {
    // v8 ignore next -- unpublishPostAsAgent community path requires a real community_post_reviews row
    result = await unpublishPostAsAgent(communityId, entityId)
  } else {
    const post = await getPostByAny(entityId)
    if (post?.rejected_at) {
      result = 'already-removed'
    } else {
      await updateClearanceStatus(entityId, 'rejected', systemUserId)
      result = 'removed'
    }
  }
  // Gap 3: resolve on 'removed' OR 'already-removed' so a retry after a post-remove crash
  // still resolves the report (retry sees 'already-removed' but resolves correctly).
  if (result !== 'not-applicable') await resolveReportIfPending(systemUserId, reportId, 'actioned')
}

async function dispatchWarn(
  entityType: string,
  entityId: string,
  communityId: string | null,
  systemUserId: string,
  reportId: string | null,
): Promise<void> {
  const targetUserId = await getEntityAuthorId(entityType, entityId)
  if (!targetUserId) return
  await createUserWarning(
    systemUserId,
    {
      userId: targetUserId,
      reason: 'Content policy violation',
      publicMessage: null,
      communityId,
      reportId,
      resolveReport: false,
    },
    { returnExistingForReport: true },
  )
  await resolveReportIfPending(systemUserId, reportId, 'actioned')
}

async function dispatchNoAction(systemUserId: string, reportId: string | null): Promise<void> {
  await resolveReportIfPending(systemUserId, reportId, 'dismissed')
}

async function resolveReportIfPending(
  systemUserId: string,
  reportId: string | null,
  status: 'actioned' | 'dismissed',
): Promise<void> {
  if (!reportId) return
  try {
    await resolveModerationReport(reportId, { status, resolvedById: systemUserId })
  } catch (err) {
    if ((err as { status?: number }).status === 409) return
    // v8 ignore next -- non-409 DB errors propagate; no test fixture can trigger this without mocking
    throw err
  }
}

async function getEntityAuthorId(entityType: string, entityId: string): Promise<string | null> {
  if (entityType === 'user') return entityId
  if (entityType === 'post' || entityType === 'comment') {
    const post = await getPostByAny(entityId)
    return (post?.created_by_id as string | null | undefined) ?? null
  }
  return null
}
