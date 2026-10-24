import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  setTestPostClearanceStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import {
  requestAutotaggerRun,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { sweepableAutotaggerPostIds } from '@voucha/test-helpers/data-stores/psql/classifier-runs/request-retirement'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { recordAutomodActionFeedback } from './automod-feedback.mts'

describe('automod reinstatement classifier requests', () => {
  it('revives a same-content request retired while the post was rejected', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `classifier-feedback-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const postId = await insertTestPost({
      title: `Flagged ${random}`,
      slug: `classifier-feedback-${random}`,
      createdById: owner.id,
      markdown: `Flagged ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(postId, 'rejected')
    const inputSha256 = Buffer.alloc(32, 1)
    await updatePostModerationData(
      postId,
      inputSha256,
      [{ flagged: true, categories: { spam: true } }],
      true,
    )
    await requestAutotaggerRun({
      subject: { postId, rssFeedItemId: null },
      inputSha256,
    })
    expect(await sweepableAutotaggerPostIds()).not.toContain(postId)
    expect(
      (await getClassifierRunRequestFacts(postId, TAGGING_CLASSIFIER_SLUG))[0]?.stale_at,
    ).not.toBeNull()

    const feedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: `openai_omni:${postId}:${inputSha256.toString('hex')}`,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
    })

    expect(feedback).toMatchObject({ applied_action: true })
    expect(
      (await getClassifierRunRequestFacts(postId, TAGGING_CLASSIFIER_SLUG))[0]?.stale_at,
    ).toBeNull()
  })
})
