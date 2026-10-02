import { beforeAll, describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getEntityRelation,
  insertTestCard,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'

describe('update category vote order', () => {
  let owner: PrivateUser
  let topicA: string
  let topicB: string
  let topicC: string

  beforeAll(async () => {
    owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    ;[topicA, topicB, topicC] = await Promise.all(
      [1, 2, 3].map(() => insertTestCard({ createdById: owner.id })),
    )
  })

  it('leaves scores matching the latest sequential data-point edit', async () => {
    const post = await createPost(owner, WEB_PROVENANCE, {
      post_type: 'data_point',
      title: `Category score order ${Date.now().toString(36)}`,
      data_point_vertical: 'credit_card',
      structured_data: makeStructuredData([topicA]),
    })

    await updatePost(owner, post!, {
      data_point_vertical: 'credit_card',
      structured_data: makeStructuredData([topicB]),
    })
    await updatePost(owner, post!, {
      data_point_vertical: 'credit_card',
      structured_data: makeStructuredData([topicC]),
    })

    await expectTopicRelationScore(post!.id, topicA, 0)
    await expectTopicRelationScore(post!.id, topicB, 0)
    await expectTopicRelationScore(post!.id, topicC, 1)
  })

  it('serializes reciprocal admin edits with sorted editor and owner fences', async () => {
    const firstAdmin = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const secondAdmin = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const topics = await Promise.all(
      [firstAdmin, secondAdmin, owner].map(user => insertTestCard({ createdById: user.id })),
    )
    const [firstPost, secondPost] = await Promise.all([
      createPost(firstAdmin, WEB_PROVENANCE, {
        title: `First reciprocal post ${Date.now().toString(36)}`,
        categories: [{ type: 'topic', topic_id: topics[0]! }],
      }),
      createPost(secondAdmin, WEB_PROVENANCE, {
        title: `Second reciprocal post ${Date.now().toString(36)}`,
        categories: [{ type: 'topic', topic_id: topics[1]! }],
      }),
    ])

    const updated = await Promise.all([
      updatePost(firstAdmin, secondPost!, {
        categories: [{ type: 'topic', topic_id: topics[2]! }],
      }),
      updatePost(secondAdmin, firstPost!, {
        categories: [{ type: 'topic', topic_id: topics[2]! }],
      }),
    ])

    expect(updated.map(post => post?.id).toSorted()).toEqual(
      [firstPost!.id, secondPost!.id].toSorted(),
    )
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

async function awaitTopicRelationScore(postId: string, topicId: string): Promise<number> {
  const [relation] = (await getEntityRelation(
    'relation__post__category__topic',
    postId,
    topicId,
  )) as Array<{ votes_score_net: number }>
  return relation?.votes_score_net ?? 0
}

async function expectTopicRelationScore(
  postId: string,
  topicId: string,
  expectedScore: number,
): Promise<void> {
  expect(await awaitTopicRelationScore(postId, topicId)).toBe(expectedScore)
}
