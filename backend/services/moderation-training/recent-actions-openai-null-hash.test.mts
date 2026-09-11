import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  getTestPostClearanceState,
  insertTestCommunity,
  insertTestPost,
  setPostOpenAIModerationFlaggedOnly,
  setPostSpamDetectionResults,
} from '@voucha/test-helpers'
import { recordAutomodActionFeedback } from './automod-feedback.mts'
import { searchRecentAutomodActions } from './recent-actions.mts'

describe('recent automod actions OpenAI source keys', () => {
  it('skips OpenAI automod rows without an input hash', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-openai-null-input-${random}`,
    })
    const postId = await insertTestPost({
      title: `OpenAI null input candidate ${random}`,
      slug: `openai-null-input-candidate-${random}`,
      createdById: owner.id,
      markdown: `OpenAI null input candidate ${random}.`,
      communityId: community.id,
      postType: 'discussion',
      clearanceStatus: 'rejected',
    })
    await setPostOpenAIModerationFlaggedOnly(postId, true)

    const actions = await searchRecentAutomodActions(community.id, {
      sourceType: 'openai_omni',
      limit: 5,
    })

    expect(actions.actions.map(item => item.post_id)).not.toContain(postId)
    expect(actions.actions.every(item => item.source_key !== null)).toBe(true)
  })

  it('keeps legacy OpenAI null-hash flags active when reviewing another source', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-openai-null-active-${random}`,
    })
    const postId = await insertTestPost({
      title: `OpenAI null active candidate ${random}`,
      slug: `openai-null-active-candidate-${random}`,
      createdById: owner.id,
      markdown: `OpenAI null active candidate ${random}.`,
      communityId: community.id,
      postType: 'discussion',
      clearanceStatus: 'rejected',
    })
    await setPostOpenAIModerationFlaggedOnly(postId, true)
    await setPostSpamDetectionResults(postId, [{ signal: 'spam', score: 0.9, flagged: true }])
    const spamSourceKey = (
      await searchRecentAutomodActions(community.id, { sourceType: 'spam_detection' })
    ).actions.find(item => item.post_id === postId)?.source_key
    expect(spamSourceKey).toBeTruthy()

    const feedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: spamSourceKey!,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
    })

    expect(feedback).toMatchObject({ applied_action: false })
    expect(await getTestPostClearanceState(postId)).toMatchObject({
      approved_at: null,
      rejected_at: expect.any(Date),
    })
  })
})
