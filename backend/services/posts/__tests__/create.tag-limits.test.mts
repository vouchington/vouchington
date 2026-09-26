import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestCard,
  createRandomString,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'

// Requirement 1 of #8246: creating a data_point post with more topic_ids than the creator's tier
// limit must reject pre-transaction with TAG_LIMIT_REACHED (403) and commit no post row -- unlike
// the pre-#8246 behavior where post-commit-side-effects.mts silently dropped over-limit topics
// after the post had already been created.
describe('createPost — manual tag-add cap (#8246)', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  function makeStructuredData(topicIds: string[]) {
    return {
      vertical: 'credit_card',
      schema_version: 1,
      currency: 'usd',
      topic_ids: topicIds,
      result: 'approved',
      credit_score_range: '740-799',
    }
  }

  it('creates the post when topic_ids is within the tier limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const topicIds = await Promise.all(
        [1, 2, 3].map(() => insertTestCard({ createdById: creator.id })),
      )
      const post = await createPost(WEB_PROVENANCE, creator, {
        post_type: 'data_point',
        title: `Tag cap create within limit ${createRandomString(8)}`,
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData(topicIds),
      })

      expect(post).toBeDefined()
      expect((post!.structured_data as { topic_ids: string[] }).topic_ids).toEqual(topicIds)
    } finally {
      restore()
    }
  })

  it('rejects with TAG_LIMIT_REACHED (403) and creates no post row when over the tier limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const topicIds = await Promise.all(
        [1, 2, 3, 4].map(() => insertTestCard({ createdById: creator.id })),
      )
      const slug = `tag-cap-create-over-limit-${createRandomString(8)}`

      await expect(
        createPost(WEB_PROVENANCE, creator, {
          post_type: 'data_point',
          title: 'Tag cap create over limit',
          slug,
          data_point_vertical: 'credit_card',
          structured_data: makeStructuredData(topicIds),
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })

      // The pre-transaction rejection must leave no post row committed under this slug.
      expect(await getPostByAny(slug)).toBeNull()
    } finally {
      restore()
    }
  })

  it('allows a plus-tier creator past the free limit via the real membershipPlan parameter', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3, plus: 7 })
    try {
      const topicIds = await Promise.all(
        [1, 2, 3, 4, 5].map(() => insertTestCard({ createdById: creator.id })),
      )
      const post = await createPost(
        WEB_PROVENANCE,
        creator,
        {
          post_type: 'data_point',
          title: `Tag cap create plus tier ${createRandomString(8)}`,
          data_point_vertical: 'credit_card',
          structured_data: makeStructuredData(topicIds),
        },
        'plus',
      )

      expect(post).toBeDefined()
      expect((post!.structured_data as { topic_ids: string[] }).topic_ids).toHaveLength(5)
    } finally {
      restore()
    }
  })

  it('rejects data-point creation when structured and authored categories exceed the combined limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const topicIds = await Promise.all(
        [1, 2].map(() => insertTestCard({ createdById: creator.id })),
      )
      const slug = `tag-cap-create-combined-${createRandomString(8)}`
      const suffix = createRandomString(8)

      await expect(
        createPost(WEB_PROVENANCE, creator, {
          post_type: 'data_point',
          title: `Tag cap combined ${suffix}`,
          markdown: `#markdown-${suffix}`,
          slug,
          data_point_vertical: 'credit_card',
          structured_data: makeStructuredData([topicIds[0]!]),
          categories: [
            { type: 'topic', topic_id: topicIds[1]! },
            { type: 'hashtag', hashtag: `explicit-${suffix}` },
          ],
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })

      expect(await getPostByAny(slug)).toBeNull()
    } finally {
      restore()
    }
  })

  it('does not double-count a structured topic repeated as an explicit topic category', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const topicIds = await Promise.all(
        [1, 2].map(() => insertTestCard({ createdById: creator.id })),
      )
      const post = await createPost(WEB_PROVENANCE, creator, {
        post_type: 'data_point',
        title: `Tag cap deduped topic #title-${createRandomString(8)}`,
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData(topicIds),
        categories: [{ type: 'topic', topic_id: topicIds[1]! }],
      })

      expect(post).toBeDefined()
    } finally {
      restore()
    }
  })
})
