import { describe, it, expect, beforeAll } from 'vitest'
import { penalizeReferralLinkInPost } from './apply-referral-link-penalty.mts'
import {
  createSystemUser,
  createTestUserDirect,
  insertTestPost,
  getTestPenaltiesByPostId,
  safeUsername,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('penalizeReferralLinkInPost', () => {
  let userId: string
  let moderationSystemUserId: string

  beforeAll(async () => {
    const [user, moderationSystemUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('pen-ref') }),
      createSystemUser(MODERATION_SYSTEM_USERNAME),
    ])
    userId = user!.id
    moderationSystemUserId = moderationSystemUser.id
  })

  it('inserts penalty with correct reason and multiplier', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Penalty test ${suffix}`,
      slug: `penalty-test-${suffix}`,
      createdById: userId,
      markdown: 'test content',
    })

    await penalizeReferralLinkInPost(userId, postId)

    const rows = await getTestPenaltiesByPostId(postId, userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.reason).toBe('referral_link_in_post')
    expect(rows[0]!.penalty_multiplier).toBe(0.2)
    expect(rows[0]!.created_by_id).toBe(moderationSystemUserId)
  })

  it('idempotent for same post — no duplicate penalty', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Idempotent penalty ${suffix}`,
      slug: `idempotent-penalty-${suffix}`,
      createdById: userId,
      markdown: 'test content',
    })

    await penalizeReferralLinkInPost(userId, postId)
    await penalizeReferralLinkInPost(userId, postId)

    const rows = await getTestPenaltiesByPostId(postId, userId)
    expect(rows).toHaveLength(1)
  })

  it('stacks penalties for different posts', async () => {
    const suffix1 = randomSuffix()
    const suffix2 = randomSuffix()
    const postId1 = await insertTestPost({
      title: `Stack penalty 1 ${suffix1}`,
      slug: `stack-penalty-1-${suffix1}`,
      createdById: userId,
      markdown: 'test content 1',
    })
    const postId2 = await insertTestPost({
      title: `Stack penalty 2 ${suffix2}`,
      slug: `stack-penalty-2-${suffix2}`,
      createdById: userId,
      markdown: 'test content 2',
    })

    await penalizeReferralLinkInPost(userId, postId1)
    await penalizeReferralLinkInPost(userId, postId2)

    const [rows1, rows2] = await Promise.all([
      getTestPenaltiesByPostId(postId1, userId),
      getTestPenaltiesByPostId(postId2, userId),
    ])
    expect(rows1).toHaveLength(1)
    expect(rows2).toHaveLength(1)
  })
})
