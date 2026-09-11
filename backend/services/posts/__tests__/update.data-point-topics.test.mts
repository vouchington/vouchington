import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestCard,
  getPostDataPointTopicIds,
  getEntityRelation,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { getPostByAny } from '../get.mts'
import { randomUUID } from 'node:crypto'

describe('update.data-point-topics', () => {
  let creator: PrivateUser
  let topicA: string
  let topicB: string

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    topicA = await insertTestCard({ createdById: creator.id })
    topicB = await insertTestCard({ createdById: creator.id })
  })

  function makeDataPointPost(suffix: string, topicId: string) {
    return createPost(creator, {
      post_type: 'data_point',
      title: `Data point topics test ${suffix}`,
      data_point_vertical: 'credit_card',
      structured_data: {
        vertical: 'credit_card',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [topicId],
        result: 'approved',
        credit_score_range: '740-799',
      },
    })
  }

  function makeCreditCardStructuredData(topicIds: string[]) {
    return {
      vertical: 'credit_card',
      schema_version: 1,
      currency: 'usd',
      topic_ids: topicIds,
      result: 'approved',
      credit_score_range: '740-799',
    }
  }

  describe('updatePost — post_data_point_topics sync', () => {
    it('replaces topic rows when structured_data.topic_ids changes', async () => {
      const suffix = Date.now().toString(36)
      const post = await makeDataPointPost(suffix, topicA)

      const updated = await updatePost(creator, post, {
        data_point_vertical: 'credit_card',
        structured_data: { ...makeCreditCardStructuredData([topicB]), result: 'denied' },
      })

      expect((updated!.structured_data as { topic_ids: string[] }).topic_ids).toEqual([topicB])
      const topicIds = await getPostDataPointTopicIds(post.id)
      expect(topicIds).toEqual([topicB])
    })

    it('stores multiple topics with correct order_index', async () => {
      const suffix = `${Date.now().toString(36)}-multi`
      const post = await makeDataPointPost(suffix, topicA)

      await updatePost(creator, post, {
        data_point_vertical: 'credit_card',
        structured_data: makeCreditCardStructuredData([topicB, topicA]),
      })

      const topicIds = await getPostDataPointTopicIds(post.id)
      expect(topicIds).toEqual([topicB, topicA])
    })

    it('retains structured-data topic support when categories alone change', async () => {
      const suffix = `${Date.now().toString(36)}-category`
      const post = await makeDataPointPost(suffix, topicA)

      await updatePost(creator, post, {
        categories: [{ type: 'topic', topic_id: topicB }],
      })

      const [structuredTopicRelation] = (await getEntityRelation(
        'relation__post__category__topic',
        post.id,
        topicA,
      )) as Array<{ votes_score_net: number }>
      expect(structuredTopicRelation!.votes_score_net).toBeGreaterThan(0)
    })

    // Pre-flight validation (getTopicByAny + assert) runs before the transaction, so an
    // unknown topic_id is rejected as 422 before any SQL is written. This test verifies
    // neither store is mutated when validation fails.
    //
    // The FK rollback path guards against a
    // race where a topic is deleted after validation passes but before the INSERT runs.
    // That path is not exercised here because it would require mocking getTopicByAny to
    // return a valid topic while the underlying row is absent — see a .mock.test.mts if
    // coverage of that edge case is needed.
    it('pre-validation 422 leaves both stores unchanged', async () => {
      const suffix = `${Date.now().toString(36)}-atom`
      const post = await makeDataPointPost(suffix, topicA)

      const fakeTopicId = randomUUID()
      await expect(
        updatePost(creator, post, {
          data_point_vertical: 'credit_card',
          structured_data: makeCreditCardStructuredData([fakeTopicId]),
        }),
      ).rejects.toMatchObject({ status: 422 })

      // Both stores must still reflect the original topicA
      const unchanged = await getPostByAny(post.id)
      expect((unchanged!.structured_data as { topic_ids: string[] }).topic_ids).toEqual([topicA])
      const topicIds = await getPostDataPointTopicIds(post.id)
      expect(topicIds).toEqual([topicA])
    })

    it('does not touch post_data_point_topics for non-data_point posts', async () => {
      const suffix = `${Date.now().toString(36)}-nondp`
      const post = await createPost(creator, {
        title: `Non data point ${suffix}`,
        markdown: 'hello',
      })

      await updatePost(creator, post, { title: `Non data point updated ${suffix}` })

      const topicIds = await getPostDataPointTopicIds(post.id)
      expect(topicIds).toHaveLength(0)
    })
  })
})
