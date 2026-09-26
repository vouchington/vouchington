import { beforeAll, describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  getEntityRelation,
  getPostDataPointTopicIds,
  insertTestCard,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations'
import { manualTagLimitConfig } from '@services/tag-limits'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { updatePost } from '../update.mts'

describe('post explicit topic provenance', () => {
  let author: PrivateUser
  let topicA: string
  let topicB: string

  beforeAll(async () => {
    author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    topicA = await insertTestCard({ createdById: author.id })
    topicB = await insertTestCard({ createdById: author.id })
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

  async function makeDualProvenancePost(topicId: string) {
    return createPost(WEB_PROVENANCE, author, {
      post_type: 'data_point',
      title: `Dual topic provenance ${Date.now().toString(36)}`,
      data_point_vertical: 'credit_card',
      structured_data: makeStructuredData([topicId]),
      categories: [{ type: 'topic', topic_id: topicId }],
    })
  }

  it('keeps an explicit topic after structured provenance is removed', async () => {
    const post = await makeDualProvenancePost(topicA)

    const updated = await updatePost(author, post!, {
      data_point_vertical: 'credit_card',
      structured_data: makeStructuredData([topicB]),
    })

    expect(await getPostDataPointTopicIds(post!.id)).toEqual([topicB])
    expect(explicitTopicIds(updated!)).toContain(topicA)
    await expectTopicRelationToBePositive(post!.id, topicA)
  })

  it('keeps a structured topic after explicit provenance is removed', async () => {
    const post = await makeDualProvenancePost(topicA)

    const updated = await updatePost(author, post!, { categories: [] })

    expect(await getPostDataPointTopicIds(post!.id)).toEqual([topicA])
    expect(explicitTopicIds(updated!)).not.toContain(topicA)
    await expectTopicRelationToBePositive(post!.id, topicA)
  })

  it('counts an adopted pre-existing topic relationship toward the combined tag cap', async () => {
    const tagger = await createTestUser()
    const post = await createPost(WEB_PROVENANCE, author, {
      title: `Adopted category standing ${Date.now().toString(36)}`,
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    await upsertEntityRelation(tagger!, relation, { id: post!.id }, [{ id: topicA }], {
      vote: true,
    })
    const restore = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, { free: 2 })
    try {
      await expect(
        updatePost(author, post!, {
          categories: [
            { type: 'topic', topic_id: topicA },
            { type: 'topic', topic_id: topicB },
            { type: 'hashtag', hashtag: 'combined-cap' },
          ],
        }),
      ).rejects.toMatchObject({ code: TAG_LIMIT_REACHED, status: 403 })
    } finally {
      restore()
    }
  })

  it("replaces the author's category vote when an administrator edits the post", async () => {
    const administrator = await createTestUser({ administrator: true })
    const post = await createPost(WEB_PROVENANCE, author, {
      title: `Administrator category replacement ${Date.now().toString(36)}`,
      categories: [{ type: 'topic', topic_id: topicA }],
    })

    await updatePost(administrator!, post!, {
      categories: [{ type: 'topic', topic_id: topicB }],
    })

    await expectTopicRelationScore(post!.id, topicA, 0)
    await expectTopicRelationToBePositive(post!.id, topicB)
  })
})

function explicitTopicIds(post: NonNullable<Awaited<ReturnType<typeof getPostByAny>>>): string[] {
  return post.post_explicit_categories!.flatMap(category =>
    category.type === 'topic' ? [category.topic_id] : [],
  )
}

async function expectTopicRelationToBePositive(postId: string, topicId: string): Promise<void> {
  const [relation] = (await getEntityRelation(
    'relation__post__category__topic',
    postId,
    topicId,
  )) as Array<{ votes_score_net: number }>
  expect(relation!.votes_score_net).toBeGreaterThan(0)
}

async function expectTopicRelationScore(
  postId: string,
  topicId: string,
  expectedScore: number,
): Promise<void> {
  const [relation] = (await getEntityRelation(
    'relation__post__category__topic',
    postId,
    topicId,
  )) as Array<{ votes_score_net: number }>
  expect(relation!.votes_score_net).toBe(expectedScore)
}
