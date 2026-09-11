import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUserDirect,
  getTestJudgementDispatchedAt,
  getTestModerationReportEscalatedAt,
  getTestModerationReportStatus,
  getTestPostClearanceState,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
  safeUsername,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { moderationAiDispatchConfig } from '@services/moderation/ai-config'
import type { ModerationJudgementAction } from '@ts-shared/utils/moderation-policy-data'
import type { AutoDispatchJudgementJobData } from '@queues/ai-agents/types'
import type { Job } from 'glide-mq'
import { processAutoDispatchJudgement } from './process-auto-dispatch-judgement.mts'

function makeJob(data: AutoDispatchJudgementJobData): Job<AutoDispatchJudgementJobData> {
  return { data } as Job<AutoDispatchJudgementJobData>
}

async function makeTestFixture(tag: string, recommendedAction: ModerationJudgementAction) {
  const suffix = randomUUID().slice(0, 8)
  const [postOwner, reporter] = await Promise.all([
    createTestUserDirect({ username: `adj-${tag}-owner-${suffix}` }),
    createTestUserDirect({ username: `adj-${tag}-rptr-${suffix}` }),
  ])
  const postId = await insertTestPost({
    createdById: postOwner!.id,
    slug: `adj-${tag}-${suffix}`,
    title: `Auto-dispatch ${tag} test`,
    markdown: 'Body',
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

async function makeTestCommunityFixture(tag: string, action: ModerationJudgementAction) {
  const s = randomUUID().slice(0, 8)
  const [owner, author, reporter] = await Promise.all([
    createTestUserDirect({ username: `adj-c-${tag}-o-${s}` }),
    createTestUserDirect({ username: `adj-c-${tag}-a-${s}` }),
    createTestUserDirect({ username: `adj-c-${tag}-r-${s}` }),
  ])
  const community = await insertTestCommunity({ createdById: owner!.id })
  await insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' })
  const postId = await insertTestPost({
    createdById: author!.id,
    slug: `adj-c-${tag}-${s}`,
    title: `adj-c-${tag}`,
    markdown: 'x',
    communityId: community.id,
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
    recommendedAction: action,
  })
  return { communityId: community.id, postId, reportId, judgementId }
}

describe('processAutoDispatchJudgement', () => {
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

  it('skips when auto_dispatch_enabled is false (default)', async () => {
    await expect(
      processAutoDispatchJudgement(
        makeJob({
          judgement_id: randomUUID(),
          entity_type: 'post',
          entity_id: randomUUID(),
          community_id: null,
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it('skips when judgement is not found', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, { auto_dispatch_enabled: true })

    await expect(
      processAutoDispatchJudgement(
        makeJob({
          judgement_id: randomUUID(),
          entity_type: 'post',
          entity_id: randomUUID(),
          community_id: null,
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it('resolves report dismissed for no_action when auto_dispatch_no_action is true', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_no_action: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('no-act', 'no_action')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('dismissed')
  })

  it('skips no_action resolution when auto_dispatch_no_action is false', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, { auto_dispatch_enabled: true })
    const { postId, reportId, judgementId } = await makeTestFixture('no-act-skip', 'no_action')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
  })

  it('resolves report actioned and creates warning for warn when auto_dispatch_warn is true', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_warn: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('warn', 'warn')

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

  it('resolves report actioned and removes post (platform) when auto_dispatch_remove is true', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('remove', 'remove')

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

  it('skips outdated judgement when current report context hash differs', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('outdated-context', 'remove')
    const reporter = await createTestUserDirect({ username: safeUsername('adj-outdated-r2') })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
    const postClearance = await getTestPostClearanceState(postId)
    if (!postClearance) throw new Error('Expected post clearance state')
    expect(postClearance.approved_at).not.toBeNull()
    expect(postClearance.rejected_at).toBeNull()
    expect(await getTestJudgementDispatchedAt(judgementId)).not.toBeNull()
  })

  it('escalate without community_id is a no-op (platform escalations handled by N2 alert)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, { auto_dispatch_enabled: true })
    const { postId, reportId, judgementId } = await makeTestFixture('escalate', 'escalate')

    await expect(
      processAutoDispatchJudgement(
        makeJob({
          judgement_id: judgementId,
          entity_type: 'post',
          entity_id: postId,
          community_id: null,
        }),
      ),
    ).resolves.toBeUndefined()

    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
  })

  it('warn with non-post entity_type returns early when no author (url_hostname path)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_warn: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('no-author', 'warn')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'url_hostname',
        entity_id: postId,
        community_id: null,
      }),
    )
    expect(await getTestModerationReportStatus(reportId)).toBe('pending')
  })

  it('is idempotent — double-dispatch on already-resolved report does not throw', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_no_action: true,
    })
    const { postId, reportId, judgementId } = await makeTestFixture('idem', 'no_action')
    const job = makeJob({
      judgement_id: judgementId,
      entity_type: 'post',
      entity_id: postId,
      community_id: null,
    })

    await processAutoDispatchJudgement(job)
    await expect(processAutoDispatchJudgement(job)).resolves.toBeUndefined()

    expect(await getTestModerationReportStatus(reportId)).toBe('dismissed')
  })

  it('escalates community report to mod thread when communityId and reportId are provided', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, { auto_dispatch_enabled: true })
    const { communityId, postId, reportId, judgementId } = await makeTestCommunityFixture(
      'esc',
      'escalate',
    )
    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: communityId,
      }),
    )
    expect(await getTestModerationReportEscalatedAt(reportId)).not.toBeNull()
  })
})
