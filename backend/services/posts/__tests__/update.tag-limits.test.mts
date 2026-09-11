import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestCard,
  createRandomString,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { getPostByAny } from '../get.mts'

// Requirement 1 of #8246: editing a data_point post's topic_ids is capped, but only for NET-NEW
// topics -- re-saving the same set (or removing topics) must never trip the cap even when the
// creator is already at their limit for this post.
describe('updatePost — manual tag-add cap (#8246)', () => {
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

  async function makeDataPointPostAtFreeLimit() {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const topicIds = await Promise.all(
        [1, 2, 3].map(() => insertTestCard({ createdById: creator.id })),
      )
      const post = await createPost(creator, {
        post_type: 'data_point',
        title: `Tag cap update setup ${createRandomString(8)}`,
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData(topicIds),
      })
      return { post: post!, topicIds }
    } finally {
      restore()
    }
  }

  it('does not trip the cap when re-submitting the exact same topic_ids while at the limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const { post, topicIds } = await makeDataPointPostAtFreeLimit()

      const updated = await updatePost(creator, post, {
        data_point_vertical: 'credit_card',
        structured_data: { ...makeStructuredData(topicIds), result: 'denied' },
      })

      expect((updated!.structured_data as { topic_ids: string[] }).topic_ids).toEqual(topicIds)
    } finally {
      restore()
    }
  })

  it('rejects with TAG_LIMIT_REACHED (403) when adding a net-new topic past the limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const { post, topicIds } = await makeDataPointPostAtFreeLimit()
      const extraTopicId = await insertTestCard({ createdById: creator.id })

      await expect(
        updatePost(creator, post, {
          data_point_vertical: 'credit_card',
          structured_data: makeStructuredData([...topicIds, extraTopicId]),
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })

      // The rejected update must leave the post's topic_ids unchanged.
      const unchanged = await getPostByAny(post.id)
      expect((unchanged!.structured_data as { topic_ids: string[] }).topic_ids).toEqual(topicIds)
    } finally {
      restore()
    }
  })

  it('does not trip the cap when swapping a topic while at the limit (total count unchanged)', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const { post, topicIds } = await makeDataPointPostAtFreeLimit()
      const swappedInTopicId = await insertTestCard({ createdById: creator.id })

      const updated = await updatePost(creator, post, {
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicIds[1]!, topicIds[2]!, swappedInTopicId]),
      })

      expect((updated!.structured_data as { topic_ids: string[] }).topic_ids).toEqual([
        topicIds[1],
        topicIds[2],
        swappedInTopicId,
      ])
    } finally {
      restore()
    }
  })

  it('does not trip the cap when removing topics (net-new is zero)', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const { post, topicIds } = await makeDataPointPostAtFreeLimit()

      const updated = await updatePost(creator, post, {
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicIds[0]!]),
      })

      expect((updated!.structured_data as { topic_ids: string[] }).topic_ids).toEqual([topicIds[0]])
    } finally {
      restore()
    }
  })

  it('allows adding a net-new topic when it fits within the remaining budget', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const [topicA, topicB] = await Promise.all([
        insertTestCard({ createdById: creator.id }),
        insertTestCard({ createdById: creator.id }),
      ])
      const post = await createPost(creator, {
        post_type: 'data_point',
        title: `Tag cap update within budget ${createRandomString(8)}`,
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicA!]),
      })

      const updated = await updatePost(creator, post!, {
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicA!, topicB!]),
      })

      expect((updated!.structured_data as { topic_ids: string[] }).topic_ids).toEqual([
        topicA,
        topicB,
      ])
    } finally {
      restore()
    }
  })

  it('caps the deduplicated final union of data-point, category, and hashtag topics', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const suffix = createRandomString(8).toLowerCase()
      const [topicA, topicB, topicC] = await Promise.all(
        [1, 2, 3].map(() => insertTestCard({ createdById: creator.id })),
      )
      const post = await createPost(creator, {
        post_type: 'data_point',
        title: `Combined category cap ${suffix}`,
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicA!, topicB!]),
      })

      await expect(
        updatePost(creator, post!, {
          categories: [
            { type: 'topic', topic_id: topicA! },
            { type: 'topic', topic_id: topicC! },
            { type: 'hashtag', hashtag: `combined-${suffix}` },
          ],
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })

  it('does not re-charge retained categories after the allowance is downgraded', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const retainedTopicId = await insertTestCard({ createdById: creator.id })
    const initialRestore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    let post: Awaited<ReturnType<typeof createPost>>
    try {
      post = await createPost(creator, {
        post_type: 'discussion',
        title: `Retained hashtag cap ${suffix}`,
        categories: [
          { type: 'topic', topic_id: retainedTopicId },
          ...[1, 2].map(index => ({
            type: 'hashtag' as const,
            hashtag: `retained-${index}-${suffix}`,
          })),
        ],
      })
    } finally {
      initialRestore()
    }

    const downgradedRestore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 1 })
    try {
      const updated = await updatePost(creator, post!, {
        title: `Retained hashtag cap edited ${suffix}`,
      })

      expect(updated!.title).toBe(`Retained hashtag cap edited ${suffix}`)
    } finally {
      downgradedRestore()
    }
  })

  it('rejects repeated edits that grow the final standing category count past the allowance', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const suffix = createRandomString(8).toLowerCase()
      const post = await createPost(creator, {
        post_type: 'discussion',
        title: `Standing hashtag cap ${suffix} #first-${suffix}`,
      })

      const atLimit = await updatePost(creator, post!, {
        title: `Standing hashtag cap ${suffix} #first-${suffix} #second-${suffix} #third-${suffix}`,
      })
      await expect(
        updatePost(creator, atLimit!, {
          title: `${atLimit!.title} #fourth-${suffix}`,
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })
    } finally {
      restore()
    }
  })

  it('revalidates standing hashtags from the locked current post for stale callers', async () => {
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 3 })
    try {
      const suffix = createRandomString(8).toLowerCase()
      const stalePost = await createPost(creator, {
        post_type: 'discussion',
        title: `Locked hashtag cap #first-${suffix}`,
        markdown: 'Original markdown',
      })
      await updatePost(creator, stalePost!, {
        title: `Locked hashtag cap #first-${suffix} #second-${suffix} #third-${suffix}`,
      })

      await expect(
        updatePost(creator, stalePost!, {
          markdown: `Stale caller #fourth-${suffix}`,
        }),
      ).rejects.toMatchObject({ status: 403, code: TAG_LIMIT_REACHED })

      const unchanged = await getPostByAny(stalePost!.id)
      expect(unchanged!.markdown).toBe('Original markdown')
    } finally {
      restore()
    }
  })
})
