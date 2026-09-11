import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestPost,
  insertTestTopic,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  createTestMembership,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'

// Requirement 1 of #8246: the generic POST entity-relations route enforces a standing
// per-(user, subject, relation) cap on manually added election-backed relations. Predicate/subject
// breadth and vouch-path exclusion are covered in the part-2 shard (max-lines split).
describe('entity-relations POST — manual tag-add cap (#8246)', () => {
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

  it('rejects the 4th topic-tag add for a free-tier user with 403 TAG_LIMIT_REACHED', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const postId = await insertTestPost({
        title: 'Tag cap post',
        slug: randomSlug('tag-cap-post'),
        createdById: freeUser.id,
        markdown: 'content',
      })
      const request = createRequest()
      await request.authenticateAs(freeUser)
      await tagCount(request, 'post', postId, 3, freeUser.id)

      const fourthTopicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById: freeUser.id,
      })
      const response = await request
        .post(`/api/v1/entity-relations/post/${postId}/category/topic`)
        .send({ objectId: fourthTopicId })
        .expect(403)
      expect(response.body.code).toBe(TAG_LIMIT_REACHED)
    } finally {
      restore()
    }
  })

  it('allows voting via PUT /:id/vote even when the voter is at their own tag-add cap', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const postId = await insertTestPost({
        title: 'Tag cap vote post',
        slug: randomSlug('tag-cap-vote-post'),
        createdById: freeUser.id,
        markdown: 'content',
      })
      const request = createRequest()
      await request.authenticateAs(freeUser)
      await tagCount(request, 'post', postId, 3, freeUser.id)

      // A different user adds one more tag -- freeUser never originated this row, so voting on
      // it must not be affected by freeUser's own per-post cap being exhausted.
      const otherUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const otherRequest = createRequest()
      await otherRequest.authenticateAs(otherUser)
      const othersTopicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById: otherUser.id,
      })
      const created = await otherRequest
        .post(`/api/v1/entity-relations/post/${postId}/category/topic`)
        .send({ objectId: othersTopicId })
        .expect(201)
      const relationId = created.body.relation.id

      await request
        .put(`/api/v1/entity-relations/${relationId}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)
    } finally {
      restore()
    }
  })

  it('gives plus and pro tiers their own higher limits', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, {
      free: 3,
      plus: 7,
      pro: 15,
    })
    try {
      const plusUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const plusPostId = await insertTestPost({
        title: 'Tag cap plus post',
        slug: randomSlug('tag-cap-plus-post'),
        createdById: plusUser.id,
        markdown: 'content',
      })
      const plusRequest = createRequest()
      await plusRequest.authenticateAs(plusUser)
      await tagCount(plusRequest, 'post', plusPostId, 7, plusUser.id)
      const overPlusTopicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById: plusUser.id,
      })
      await plusRequest
        .post(`/api/v1/entity-relations/post/${plusPostId}/category/topic`)
        .send({ objectId: overPlusTopicId })
        .expect(403)

      const proUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      await createTestMembership({ user_id: proUser.id, plan: 'pro' })
      const proPostId = await insertTestPost({
        title: 'Tag cap pro post',
        slug: randomSlug('tag-cap-pro-post'),
        createdById: proUser.id,
        markdown: 'content',
      })
      const proRequest = createRequest()
      await proRequest.authenticateAs(proUser)
      await tagCount(proRequest, 'post', proPostId, 15, proUser.id)
      const overProTopicId = await insertTestTopic({
        name: randomName('Tag cap topic'),
        slug: randomSlug('tag-cap-topic'),
        createdById: proUser.id,
      })
      await proRequest
        .post(`/api/v1/entity-relations/post/${proPostId}/category/topic`)
        .send({ objectId: overProTopicId })
        .expect(403)
    } finally {
      restore()
    }
  })
})
