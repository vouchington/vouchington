import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { getEntityRelation } from '@voucha/test-helpers/entities/entity-relations'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { POST_CONTENT_EDIT_WINDOW_EXPIRED } from '@modules/on-error/error-codes'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { updatePost } from '../update.mts'
import { getTopicByAny } from '@services/topics/get'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'

describe('post category topic lifecycle validation', () => {
  it('rejects a deleted topic when creating a post category', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Deleted category ${suffix}`,
      slug: `deleted-category-${suffix}`,
      createdById: user!.id,
    })
    await softDeleteTopic(topicId, user!.id)

    await expect(
      createPost(user!, {
        title: `Deleted category post ${suffix}`,
        categories: [{ type: 'topic', topic_id: topicId }],
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a deleted topic when updating post categories', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createPost(user!, { title: `Category update ${suffix}` })
    const topicId = await insertTestTopic({
      name: `Deleted update category ${suffix}`,
      slug: `deleted-update-category-${suffix}`,
      createdById: user!.id,
    })
    await softDeleteTopic(topicId, user!.id)

    await expect(
      updatePost(user!, post!, {
        categories: [{ type: 'topic', topic_id: topicId }],
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects category-only edits after the content-edit window expires', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const postId = await insertTestPost({
      id: getMinUUIDv7ForDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
      title: `Expired category edit ${suffix}`,
      markdown: `Expired category edit ${suffix}`,
      createdById: user!.id,
      slug: `expired-category-edit-${suffix}`,
    })
    const post = await getPostByAny(postId)

    await expect(
      updatePost(user!, post!, { categories: [{ type: 'hashtag', hashtag: `expired-${suffix}` }] }),
    ).rejects.toMatchObject({
      code: POST_CONTENT_EDIT_WINDOW_EXPIRED,
      status: 403,
    })
  })

  it('allows a title edit after its retained topic category is deleted', async () => {
    const author = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Retained deleted topic ${suffix}`,
      slug: `retained-deleted-topic-${suffix}`,
      createdById: administrator!.id,
    })
    const post = await createPost(author!, {
      title: `Retained deleted category ${suffix}`,
      categories: [{ type: 'topic', topic_id: topicId }],
    })
    await softDeleteTopic(topicId, administrator!.id)

    const updated = await updatePost(author!, post!, {
      title: `Retained deleted category updated ${suffix}`,
    })

    expect(updated!.title).toBe(`Retained deleted category updated ${suffix}`)
  })

  it('allows a markdown edit after its retained topic category is merged', async () => {
    const author = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const sourceTopicId = await insertTestTopic({
      name: `Retained merged source ${suffix}`,
      slug: `retained-merged-source-${suffix}`,
      createdById: administrator!.id,
    })
    const destinationTopicId = await insertTestTopic({
      name: `Retained merged destination ${suffix}`,
      slug: `retained-merged-destination-${suffix}`,
      createdById: administrator!.id,
    })
    const post = await createPost(author!, {
      title: `Retained merged category ${suffix}`,
      categories: [{ type: 'topic', topic_id: sourceTopicId }],
    })
    const [sourceTopic, destinationTopic] = await Promise.all([
      getTopicByAny(sourceTopicId),
      getTopicByAny(destinationTopicId),
    ])
    await mergeTopicAliases(administrator!, sourceTopic!, destinationTopic!)

    const updated = await updatePost(author!, post!, {
      markdown: `Retained merged category updated ${suffix}`,
    })

    expect(updated!.markdown).toBe(`Retained merged category updated ${suffix}`)
  })

  it('returns create mutations with finalized implicit hashtag votes', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createPost(user!, {
      title: `Hashtag vote visibility ${suffix}`,
      markdown: `#After.Commit_${suffix}`,
    })

    expect(post!.post_hashtags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `after-commit-${suffix}`,
          display_token: `#After.Commit_${suffix}`,
        }),
      ]),
    )
  })

  it('returns update mutations with finalized implicit hashtag votes', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createPost(user!, { title: `Hashtag update visibility ${suffix}` })

    const updated = await updatePost(user!, post!, { markdown: `#Updated.Hashtag_${suffix}` })

    expect(updated!.post_hashtags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `updated-hashtag-${suffix}`,
          display_token: `#Updated.Hashtag_${suffix}`,
        }),
      ]),
    )
  })

  it('retracts only the post author’s replaced explicit topic votes', async () => {
    const author = await createTestUser()
    const tagger = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const [sharedTopicId, removedTopicId, replacementTopicId] = await Promise.all([
      insertTestTopic({
        name: `Shared category ${suffix}`,
        slug: `shared-category-${suffix}`,
        createdById: author!.id,
      }),
      insertTestTopic({
        name: `Removed category ${suffix}`,
        slug: `removed-category-${suffix}`,
        createdById: author!.id,
      }),
      insertTestTopic({
        name: `Replacement category ${suffix}`,
        slug: `replacement-category-${suffix}`,
        createdById: author!.id,
      }),
    ])
    const post = await createPost(author!, {
      title: `Category replacement ${suffix}`,
      categories: [
        { type: 'topic', topic_id: sharedTopicId },
        { type: 'topic', topic_id: removedTopicId },
      ],
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    const [taggerRelation] = await upsertEntityRelation(
      tagger!,
      relation,
      { id: post!.id },
      [{ id: sharedTopicId }],
      { vote: true },
    )

    await updatePost(author!, post!, {
      categories: [{ type: 'topic', topic_id: replacementTopicId }],
    })

    const [sharedRelation, removedRelation, replacementRelation] = await Promise.all([
      getEntityRelation(relation.table_name, post!.id, sharedTopicId),
      getEntityRelation(relation.table_name, post!.id, removedTopicId),
      getEntityRelation(relation.table_name, post!.id, replacementTopicId),
    ])

    expect(sharedRelation[0]).toMatchObject({
      created_by_id: author!.id,
      deleted_at: null,
    })
    expect(relationshipVoteScore(sharedRelation[0])).toBeGreaterThan(0)
    expect(removedRelation[0]).toMatchObject({ deleted_at: null })
    expect(relationshipVoteScore(removedRelation[0])).toBe(0)
    expect(replacementRelation[0]).toMatchObject({
      created_by_id: author!.id,
      deleted_at: null,
    })
    expect(relationshipVoteScore(replacementRelation[0])).toBeGreaterThan(0)
    await expect(getEntityRelationElectionVote(author!.id, taggerRelation!.id!)).resolves.toBeNull()
    await expect(
      getEntityRelationElectionVote(tagger!.id, taggerRelation!.id!),
    ).resolves.toMatchObject({ choice: 'confirm' })
  })

  it("replaces explicit categories when an administrator updates another user's post", async () => {
    const author = await createTestUser()
    const tagger = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const [authorTopicId, adoptedTopicId, taggerTopicId, administratorTopicId] = await Promise.all(
      [
        ['Author', author!.id],
        ['Adopted', tagger!.id],
        ['Tagger', tagger!.id],
        ['Administrator', administrator!.id],
      ].map(async ([name, createdById]) =>
        insertTestTopic({
          name: `${name} explicit category ${suffix}`,
          slug: `${name.toLowerCase()}-explicit-category-${suffix}`,
          createdById,
        }),
      ),
    )
    const post = await createPost(author!, {
      title: `Explicit category provenance ${suffix}`,
      categories: [{ type: 'topic', topic_id: authorTopicId }],
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })

    await upsertEntityRelation(tagger!, relation, { id: post!.id }, [{ id: adoptedTopicId }], {
      vote: true,
    })
    await upsertEntityRelation(tagger!, relation, { id: post!.id }, [{ id: taggerTopicId }], {
      vote: true,
    })
    await updatePost(author!, post!, {
      categories: [
        { type: 'topic', topic_id: authorTopicId },
        { type: 'topic', topic_id: adoptedTopicId },
      ],
    })
    await updatePost(administrator!, post!, {
      categories: [{ type: 'topic', topic_id: administratorTopicId }],
    })

    const explicitTopicIds = (await getPostByAny(post!.id))!.post_explicit_categories!.flatMap(
      category => (category.type === 'topic' ? [category.topic_id] : []),
    )

    expect(explicitTopicIds).toEqual([administratorTopicId])
    expect(explicitTopicIds).not.toContain(authorTopicId)
    expect(explicitTopicIds).not.toContain(adoptedTopicId)
    expect(explicitTopicIds).not.toContain(taggerTopicId)
  })
})

function relationshipVoteScore(row: unknown): number {
  const score = (row as { votes_score_net?: unknown } | undefined)?.votes_score_net
  const numericScore = Number(score)
  if (!Number.isFinite(numericScore)) throw new Error('Expected entity relation vote score')
  return numericScore
}
