/**
 * Hardening tests for processAutoDispatchJudgement: #6435 (comment removal),
 * Gap 2 (stale judgement guard), and Gap 3 (remove-path idempotency).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUserDirect,
  deleteTestPost,
  getTestModerationReportStatus,
  getTestPostDeletedAt,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
  safeUsername,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { moderationAiDispatchConfig } from '@services/moderation/ai-config'
import { unpublishPostAsAgent } from '@services/communities/publications/agent-moderate'
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
    createTestUserDirect({ username: `adh-${tag}-o-${s}` }),
    createTestUserDirect({ username: `adh-${tag}-r-${s}` }),
  ])
  const postId = await insertTestPost({
    createdById: postOwner!.id,
    slug: `adh-${tag}-${s}`,
    title: `adh ${tag}`,
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

async function makeTestCommunityFixture(tag: string, action: ModerationJudgementAction) {
  const s = randomUUID().slice(0, 8)
  const [owner, author, reporter] = await Promise.all([
    createTestUserDirect({ username: `adh-c-${tag}-o-${s}` }),
    createTestUserDirect({ username: `adh-c-${tag}-a-${s}` }),
    createTestUserDirect({ username: `adh-c-${tag}-r-${s}` }),
  ])
  const community = await insertTestCommunity({ createdById: owner!.id })
  await insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' })
  const postId = await insertTestPost({
    createdById: author!.id,
    slug: `adh-c-${tag}-${s}`,
    title: `adh-c-${tag}`,
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

/** Creates a real comment entity for testing comment-removal paths. */
async function makeTestCommentFixture(
  tag: string,
  action: ModerationJudgementAction,
  opts: { communityId?: string } = {},
) {
  const s = randomUUID().slice(0, 8)
  const [postOwner, reporter] = await Promise.all([
    createTestUserDirect({ username: `adh-cm-${tag}-o-${s}` }),
    createTestUserDirect({ username: `adh-cm-${tag}-r-${s}` }),
  ])
  const rootId = await insertTestPost({
    createdById: postOwner!.id,
    slug: `adh-cm-${tag}-root-${s}`,
    title: `adh-cm-${tag} root`,
    markdown: 'root',
    communityId: opts.communityId ?? null,
  })
  const commentId = await insertTestPost({
    createdById: postOwner!.id,
    slug: `adh-cm-${tag}-cmt-${s}`,
    title: `adh-cm-${tag} comment`,
    markdown: 'comment body',
    postType: 'comment',
    parentId: rootId,
    rootId,
    communityId: opts.communityId ?? null,
  })
  const reportId = await insertTestModerationReport({
    reporterUserId: reporter!.id,
    entityType: 'comment',
    entityId: commentId,
  })
  const judgementId = await insertTestReportJudgement({
    entityType: 'comment',
    entityId: commentId,
    triggeringReportId: reportId,
    recommendedAction: action,
  })
  return { commentId, reportId, judgementId, communityId: opts.communityId ?? null }
}

describe('processAutoDispatchJudgement — hardening', () => {
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

  // #6435: AI remove on a community comment soft-deletes it and resolves the report
  it('removes community comment (soft-delete) and resolves report actioned', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const community = await insertTestCommunity({
      createdById: (
        await createTestUserDirect({
          username: safeUsername('adh-cc-own'),
        })
      ).id,
    })
    const { commentId, reportId, judgementId } = await makeTestCommentFixture('cc-rm', 'remove', {
      communityId: community.id,
    })

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'comment',
        entity_id: commentId,
        community_id: community.id,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('actioned')
    expect(await getTestPostDeletedAt(commentId)).not.toBeNull()
  })

  // Clearance rejection does NOT hide a platform comment; soft-delete is the correct path
  it('removes platform comment (soft-delete) and resolves report actioned', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { commentId, reportId, judgementId } = await makeTestCommentFixture('pc-rm', 'remove')

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'comment',
        entity_id: commentId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('actioned')
    expect(await getTestPostDeletedAt(commentId)).not.toBeNull()
  })

  // Gap 3: retry after crash (comment already deleted) → report resolved 'actioned'
  it('resolves report actioned when comment already deleted (idempotent retry)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { commentId, reportId, judgementId } = await makeTestCommentFixture('idem-cmt', 'remove')
    await deleteTestPost(commentId)

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'comment',
        entity_id: commentId,
        community_id: null,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('actioned')
  })

  // Gap 3: retry after crash (community post already unpublished) → report resolved 'actioned'
  it('resolves report actioned when community post already unpublished (idempotent retry)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const { communityId, postId, reportId, judgementId } = await makeTestCommunityFixture(
      'idem-post',
      'remove',
    )
    await insertTestCommunityPostReview({ communityId, postId })
    await unpublishPostAsAgent(communityId, postId)

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementId,
        entity_type: 'post',
        entity_id: postId,
        community_id: communityId,
      }),
    )

    expect(await getTestModerationReportStatus(reportId)).toBe('actioned')
  })

  // Gap 2: stale judgement is skipped; content NOT removed; stale report left pending for staff.
  // Decision: newer judgement's dispatch handles the content — stale report is acceptable staff work.
  it('skips stale judgement and leaves stale report pending (Gap 2)', async () => {
    overrideDynamicConfigFieldsForTest(moderationAiDispatchConfig, {
      auto_dispatch_enabled: true,
      auto_dispatch_remove: true,
    })
    const {
      postId,
      reportId: reportAId,
      judgementId: judgementAId,
    } = await makeTestFixture('stale', 'remove')
    // Insert a second (newer) judgement → makes judgementAId stale
    const reportBId = await insertTestModerationReport({
      reporterUserId: (
        await createTestUserDirect({
          username: safeUsername('adh-stale-r2'),
        })
      ).id,
      entityType: 'post',
      entityId: postId,
    })
    const judgementBId = await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportBId,
      recommendedAction: 'no_action',
    })

    await processAutoDispatchJudgement(
      makeJob({
        judgement_id: judgementAId,
        entity_type: 'post',
        entity_id: postId,
        community_id: null,
      }),
    )

    // Stale judgement: content NOT removed, stale report stays pending for staff
    expect(await getTestModerationReportStatus(reportAId)).toBe('pending')
    expect(await getTestModerationReportStatus(reportBId)).toBe('pending')
    void judgementBId
  })
})
