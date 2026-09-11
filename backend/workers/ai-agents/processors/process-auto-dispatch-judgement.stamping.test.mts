/**
 * Gap 1 tests: dispatched_at stamping ensures the reconciler skips already-processed judgements.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUserDirect,
  getTestJudgementDispatchedAt,
  getTestModerationReportStatus,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { moderationAiDispatchConfig } from '@services/moderation/ai-config'
import { markJudgementDispatched } from '@services/moderation-reports'
import { updateClearanceStatus } from '@services/post-clearance/update-status'
import { getModerationSystemUserId } from '@services/users/system-users'
import type { ModerationJudgementAction } from '@ts-shared/utils/moderation-policy-data'
import type { AutoDispatchJudgementJobData } from '@queues/ai-agents/types'
import type { Job } from 'glide-mq'
import { processAutoDispatchJudgement } from './process-auto-dispatch-judgement.mts'

function makeJob(data: AutoDispatchJudgementJobData): Job<AutoDispatchJudgementJobData> {
  return { data } as Job<AutoDispatchJudgementJobData>
}

async function makeTestFixture(tag: string, recommendedAction: ModerationJudgementAction) {
  const s = randomUUID().slice(0, 8)
  const [postOwner, reporter] = await Promise.all([
    createTestUserDirect({ username: `ads-${tag}-o-${s}` }),
    createTestUserDirect({ username: `ads-${tag}-r-${s}` }),
  ])
  const postId = await insertTestPost({
    createdById: postOwner!.id,
    slug: `ads-${tag}-${s}`,
    title: `ads ${tag}`,
    markdown: 'x',
  })
  const reportId = await insertTestModerationReport({
    reporterUserId: reporter!.id,
    entityType: 'post',
    entityId: postId,
  })
  const judgementId = await insertTestReportJudgement({
    entityType: 'post',
    entityId: postId,
    triggeringReportId: reportId,
    recommendedAction,
  })
  return { postId, reportId, judgementId }
}

describe('processAutoDispatchJudgement — dispatched_at stamping (Gap 1)', () => {
  beforeEach(async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: false,
      auto_dispatch_remove: false,
      auto_dispatch_warn: false,
      auto_dispatch_no_action: false,
    })
  })
  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationAiDispatchConfig])
  })

  it('stamps dispatched_at after successful dispatch', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_no_action: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('stamp', 'no_action')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('dismissed')
    expect(await getTestJudgementDispatchedAt(judgementId)).not.toBeNull()
  })

  it('stamps dispatched_at when auto_dispatch_enabled but sub-flag is false', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: false,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('stamp-skip', 'remove')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
    expect(await getTestJudgementDispatchedAt(judgementId)).not.toBeNull()
  })

  it('does NOT stamp dispatched_at when auto_dispatch_enabled is false', async () => {
    const { postId, judgementId } = await makeTestFixture('no-stamp', 'no_action')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestJudgementDispatchedAt(judgementId)).toBeNull()
  })

  it('stamps dispatched_at on the stale judgement that is skipped (Gap 1 + Gap 2)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_no_action: true,
    })
    const {
      postId,
      reportId,
      judgementId: staleId,
    } = await makeTestFixture('stamp-stale', 'no_action')
    const newerJudgementId = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'no_action',
    })

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: staleId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestJudgementDispatchedAt(staleId)).not.toBeNull()
    void newerJudgementId
  })

  it('skips all side effects when judgement already dispatched (glide-mq retry guard)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_no_action: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('retry-guard', 'no_action')
    await markJudgementDispatched(judgementId)

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    // dispatched_at was already set; processor returned early without resolving the report
    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
  })

  it('leaves report pending for non-post/comment remove (unsupported type deferred to staff)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('not-app-rm', 'remove')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'url_hostname',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
    expect(await getTestJudgementDispatchedAt(judgementId)).not.toBeNull()
  })

  it('leaves report pending when warn target author unresolvable (deferred to staff)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_warn: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('warn-no-author', 'warn')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'url_hostname',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
    expect(await getTestJudgementDispatchedAt(judgementId)).not.toBeNull()
  })

  it('resolves report actioned when platform post already rejected (idempotent retry)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('idem-plat', 'remove')
    const systemUserId = await getModerationSystemUserId()
    await updateClearanceStatus(postId, 'rejected', systemUserId)

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('actioned')
  })
})
