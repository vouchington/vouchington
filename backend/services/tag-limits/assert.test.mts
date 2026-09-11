import { describe, it, expect, beforeAll } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestPost,
  insertTestTopic,
  insertScoredPostTopicCategoryRelation,
  softDeleteScoredPostTopicCategoryRelation,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { assertWithinTagAddLimit } from './assert.mts'
import { manualTagLimitConfig } from './config.mts'

const postTopicRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  objectType: 'topic',
  predicate: 'category',
})

function slug() {
  return `tag-limits-${createRandomString(8)}`
}

async function makePost(createdById: string): Promise<string> {
  return insertTestPost({
    title: 'Tag limit test post',
    slug: slug(),
    createdById,
    markdown: 'content',
  })
}

async function makeTopic(createdById: string): Promise<string> {
  return insertTestTopic({
    name: `Tag limit topic ${createRandomString(8)}`,
    slug: slug(),
    createdById,
  })
}

describe('assertWithinTagAddLimit', () => {
  let freeUser: PrivateUser
  let justJoinedUser: PrivateUser
  let adminUser: PrivateUser

  beforeAll(async () => {
    // Older than the contribution-gate account-age window so getContributionLimitTier resolves
    // to 'free' (not 'just_joined') when membershipPlan is null.
    freeUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    // A freshly created account falls inside the account-age window -> 'just_joined' tier.
    justJoinedUser = await createTestUser()
    adminUser = await createTestUser({ administrator: true })
  })

  it('allows the add when used + incoming exactly equals the tier limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const postId = await makePost(freeUser.id)
      const topicIds = await Promise.all([1, 2].map(() => makeTopic(freeUser.id)))
      await insertScoredPostTopicCategoryRelation(postId, topicIds[0]!, freeUser.id)
      await insertScoredPostTopicCategoryRelation(postId, topicIds[1]!, freeUser.id)

      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, postId, 1),
      ).resolves.toBeUndefined()
    } finally {
      restore()
    }
  })

  it('rejects with TAG_LIMIT_REACHED (403) when used + incoming exceeds the tier limit by one', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const postId = await makePost(freeUser.id)
      const topicIds = await Promise.all([1, 2, 3].map(() => makeTopic(freeUser.id)))
      for (const topicId of topicIds) {
        await insertScoredPostTopicCategoryRelation(postId, topicId, freeUser.id)
      }

      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, postId, 1),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })

  it('scopes the limit per tier: plus and pro allow higher counts than free', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, {
      free: 3,
      plus: 7,
      pro: 15,
    })
    try {
      const postId = await makePost(freeUser.id)
      const topicIds = await Promise.all(Array.from({ length: 6 }, () => makeTopic(freeUser.id)))
      for (const topicId of topicIds) {
        await insertScoredPostTopicCategoryRelation(postId, topicId, freeUser.id)
      }

      // 6 used already exceeds the free limit (3) but is within plus (7) and pro (15).
      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, postId, 1),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
      await expect(
        assertWithinTagAddLimit(freeUser, 'plus', postTopicRelation, postId, 1),
      ).resolves.toBeUndefined()
      await expect(
        assertWithinTagAddLimit(freeUser, 'pro', postTopicRelation, postId, 9),
      ).resolves.toBeUndefined()
      await expect(
        assertWithinTagAddLimit(freeUser, 'pro', postTopicRelation, postId, 10),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })

  it('gives just_joined its own configurable limit distinct from free', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, {
      just_joined: 2,
      free: 5,
    })
    try {
      const postId = await makePost(justJoinedUser.id)
      const topicIds = await Promise.all([1, 2].map(() => makeTopic(justJoinedUser.id)))
      for (const topicId of topicIds) {
        await insertScoredPostTopicCategoryRelation(postId, topicId, justJoinedUser.id)
      }

      // Used (2) already meets just_joined's own limit (2), not free's higher limit (5) --
      // proves the tier isn't silently falling back to the free config value.
      await expect(
        assertWithinTagAddLimit(justJoinedUser, null, postTopicRelation, postId, 1),
      ).rejects.toMatchObject({
        status: 403,
        code: TAG_LIMIT_REACHED,
        message: expect.stringContaining('(2)'),
      })
    } finally {
      restore()
    }
  })

  it('allows admin users unlimited adds regardless of existing usage', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const postId = await makePost(adminUser.id)
      const topicIds = await Promise.all(Array.from({ length: 5 }, () => makeTopic(adminUser.id)))
      for (const topicId of topicIds) {
        await insertScoredPostTopicCategoryRelation(postId, topicId, adminUser.id)
      }

      await expect(
        assertWithinTagAddLimit(adminUser, null, postTopicRelation, postId, 50),
      ).resolves.toBeUndefined()
    } finally {
      restore()
    }
  })

  it('excludes relations originated by a different user from the count', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const postId = await makePost(freeUser.id)
      const otherUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const [ownTopicId, otherTopicId] = await Promise.all([
        makeTopic(freeUser.id),
        makeTopic(otherUser.id),
      ])
      // Someone else's tag on the same post must not count against freeUser's own cap.
      await insertScoredPostTopicCategoryRelation(postId, otherTopicId!, otherUser.id)

      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, postId, 1),
      ).resolves.toBeUndefined()

      // Once freeUser has personally added their own tag, they are at the limit (1).
      await insertScoredPostTopicCategoryRelation(postId, ownTopicId!, freeUser.id)
      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, postId, 1),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })

  it('excludes soft-deleted relations from the count', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 2 })
    try {
      const postId = await makePost(freeUser.id)
      const topicIds = await Promise.all([1, 2].map(() => makeTopic(freeUser.id)))
      await insertScoredPostTopicCategoryRelation(postId, topicIds[0]!, freeUser.id)
      await insertScoredPostTopicCategoryRelation(postId, topicIds[1]!, freeUser.id)
      await softDeleteScoredPostTopicCategoryRelation(postId, topicIds[1]!, freeUser.id)

      // Only 1 non-deleted relation remains, so 1 more fits within the limit of 2.
      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, postId, 1),
      ).resolves.toBeUndefined()
    } finally {
      restore()
    }
  })

  it('treats a null subjectId as zero existing usage and only checks the incoming count', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      // Seed unrelated existing usage on a different real post for the same user/relation --
      // a null subjectId must not be influenced by it (the count query is skipped entirely).
      const otherPostId = await makePost(freeUser.id)
      const topicIds = await Promise.all(Array.from({ length: 5 }, () => makeTopic(freeUser.id)))
      for (const topicId of topicIds) {
        await insertScoredPostTopicCategoryRelation(otherPostId, topicId, freeUser.id)
      }

      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, null, 3),
      ).resolves.toBeUndefined()
      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, null, 4),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })

  it('rejects for a nonexistent subject with zero relations once incoming alone exceeds the limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const neverInsertedPostId = crypto.randomUUID()
      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, neverInsertedPostId, 3),
      ).resolves.toBeUndefined()
      await expect(
        assertWithinTagAddLimit(freeUser, null, postTopicRelation, neverInsertedPostId, 4),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })
})
