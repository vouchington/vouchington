import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  insertTestTopic,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import type { PrivateUser } from '@services/users/types'

// Requirement 1 of #8246 (continued from entity-relations.tag-limits.test.mts, max-lines split):
// subject/predicate breadth of the manual tag-add cap, and the paths it must NOT cover.
describe('entity-relations POST — manual tag-add cap breadth (#8246)', () => {
  let freeUser: PrivateUser

  function randomSlug(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  function randomName(base: string): string {
    return `${base} ${crypto.randomUUID().slice(0, 8)}`
  }

  beforeAll(async () => {
    freeUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  async function tagCount(
    request: ReturnType<typeof createRequest>,
    subjectType: string,
    subjectId: string,
    count: number,
    createdById: string,
  ): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      const topicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById,
      })
      await request
        .post(`/api/v1/entity-relations/${subjectType}/${subjectId}/category/topic`)
        .send({ objectId: topicId })
        .expect(201)
    }
  }

  it('caps a topic-subject category relation the same way', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const subjectTopic = await createTestTopic({ user: freeUser })
      const request = createRequest()
      await request.authenticateAs(freeUser)
      await tagCount(request, 'topic', subjectTopic.id, 3, freeUser.id)

      const fourthTopicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById: freeUser.id,
      })
      const response = await request
        .post(`/api/v1/entity-relations/topic/${subjectTopic.id}/category/topic`)
        .send({ objectId: fourthTopicId })
        .expect(403)
      expect(response.body.code).toBe(TAG_LIMIT_REACHED)
    } finally {
      restore()
    }
  })

  it('caps an rss_feed_item-subject category relation the same way', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const feedTopic = await createTestTopic({ user: freeUser })
      const feedId = await createTestRssFeedWithTiming(feedTopic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      const request = createRequest()
      await request.authenticateAs(freeUser)
      await tagCount(request, 'rss_feed_item', item.id, 3, freeUser.id)

      const fourthTopicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById: freeUser.id,
      })
      const response = await request
        .post(`/api/v1/entity-relations/rss_feed_item/${item.id}/category/topic`)
        .send({ objectId: fourthTopicId })
        .expect(403)
      expect(response.body.code).toBe(TAG_LIMIT_REACHED)
    } finally {
      restore()
    }
  })

  it('caps a non-category election predicate too (topic -> related -> topic)', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const subjectTopic = await createTestTopic({ user: freeUser })
      const request = createRequest()
      await request.authenticateAs(freeUser)

      const firstRelatedTopic = await insertTestTopic({
        name: randomName('Tag cap related topic'),
        slug: randomSlug('tag-cap-related-topic'),
        createdById: freeUser.id,
      })
      await request
        .post(`/api/v1/entity-relations/topic/${subjectTopic.id}/related/topic`)
        .send({ objectId: firstRelatedTopic })
        .expect(201)

      const secondRelatedTopic = await insertTestTopic({
        name: randomName('Tag cap related topic'),
        slug: randomSlug('tag-cap-related-topic'),
        createdById: freeUser.id,
      })
      const response = await request
        .post(`/api/v1/entity-relations/topic/${subjectTopic.id}/related/topic`)
        .send({ objectId: secondRelatedTopic })
        .expect(403)
      expect(response.body.code).toBe(TAG_LIMIT_REACHED)
    } finally {
      restore()
    }
  })

  it('does not cap a non-election predicate (post -> mentioned -> post)', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const postId = await insertTestPost({
        title: 'Tag cap mentioned post',
        slug: randomSlug('tag-cap-mentioned-post'),
        createdById: freeUser.id,
        markdown: 'content',
      })
      const request = createRequest()
      await request.authenticateAs(freeUser)

      // free limit is 1, but "mentioned" has election: false -- adding several must all succeed.
      for (let i = 0; i < 3; i += 1) {
        const mentionedPostId = await insertTestPost({
          title: `Mentioned post ${i}`,
          slug: randomSlug('tag-cap-mentioned-target'),
          createdById: freeUser.id,
          markdown: 'content',
        })
        await request
          .post(`/api/v1/entity-relations/post/${postId}/mentioned/post`)
          .send({ objectId: mentionedPostId })
          .expect(201)
      }
    } finally {
      restore()
    }
  })

  it('does not cap the user-subject vouch path (user -> category -> topic)', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const target = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const userTagTopics = await getUserTagTopics()
      expect(userTagTopics.length).toBeGreaterThanOrEqual(2)
      const request = createRequest()
      await request.authenticateAs(voter)

      // free limit is 1, but the user-subject vouch path is gated by the separate contribution
      // quota above this branch in the route, not by the manual tag-add cap -- both curated
      // user tags must be addable to the same target despite the low override.
      for (const tag of userTagTopics.slice(0, 2)) {
        await request
          .post(`/api/v1/entity-relations/user/${target.id}/category/topic`)
          .send({ objectId: tag.id })
          .expect(201)
      }
    } finally {
      restore()
    }
  })
})
