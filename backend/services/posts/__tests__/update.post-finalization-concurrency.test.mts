import { beforeAll, describe, expect, it } from 'vitest'
import {
  acquireTestPostFinalizationLock,
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getEntityRelation,
  insertTestCard,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { updatePost } from '../update.mts'
import { POST_FINALIZATION_LOCK_NAMESPACE } from '../update/post-finalization-lock.mts'

describe('updatePost post-finalization concurrency', () => {
  let creator: PrivateUser
  let topicA: string
  let topicB: string
  let topicC: string

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    ;[topicA, topicB, topicC] = await Promise.all(
      [1, 2, 3].map(() => insertTestCard({ createdById: creator.id })),
    )
  })

  it('finalizes concurrent data-point updates from the latest persisted topic provenance', async () => {
    const post = await createPost(WEB_PROVENANCE, creator, {
      post_type: 'data_point',
      title: `Post finalization concurrency ${Date.now().toString(36)}`,
      data_point_vertical: 'credit_card',
      structured_data: makeStructuredData([topicA]),
    })
    const lock = await acquireTestPostFinalizationLock(POST_FINALIZATION_LOCK_NAMESPACE, post!.id)
    try {
      const firstUpdate = updatePost(creator, post!, {
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicB]),
      })
      await expect.poll(() => getTopicIds(post!.id)).toEqual([topicB])

      const secondUpdate = updatePost(creator, post!, {
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([topicC]),
      })
      await expect.poll(() => getTopicIds(post!.id)).toEqual([topicC])

      await lock.release()
      await Promise.all([firstUpdate, secondUpdate])
    } finally {
      await lock.release()
    }

    await expectTopicRelationNotPositive(post!.id, topicA)
    await expectTopicRelationNotPositive(post!.id, topicB)
    await expectTopicRelationPositive(post!.id, topicC)
  })
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

async function getTopicIds(postId: string): Promise<string[]> {
  const post = (await getPostByAny(postId))!
  return (post.structured_data as { topic_ids: string[] }).topic_ids
}

async function getTopicRelationScore(postId: string, topicId: string): Promise<number> {
  const [relation] = (await getEntityRelation(
    'relation__post__category__topic',
    postId,
    topicId,
  )) as Array<{ votes_score_net: number }>
  return relation?.votes_score_net ?? 0
}

async function expectTopicRelationNotPositive(postId: string, topicId: string): Promise<void> {
  expect(await getTopicRelationScore(postId, topicId)).toBeLessThanOrEqual(0)
}

async function expectTopicRelationPositive(postId: string, topicId: string): Promise<void> {
  expect(await getTopicRelationScore(postId, topicId)).toBeGreaterThan(0)
}
