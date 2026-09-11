import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getEntityRelationVoteStorageRows,
  getTestEntityRelationVoteState,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getEntityRelationElectionByIdCachedBatch } from '../entity-fetch/get.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import {
  insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction,
  writeEntityRelations,
} from './write-relations.mts'

describe('writeEntityRelations transaction', () => {
  it('publishes changed election stats only after the caller transaction commits', async () => {
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator })
    const topic = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    const [createdRelation] = await writeEntityRelations(
      relation,
      creator,
      [{ subject: { id: post.id }, object: { id: topic.id } }],
      { vote: false },
    )
    const relationId = createdRelation!.id!

    const [cachedBefore] = await getEntityRelationElectionByIdCachedBatch([relationId])
    expect(cachedBefore?.votes_score_net).toBe(0)

    await using query = await beginTransaction()
    await writeEntityRelations(
      relation,
      creator,
      [{ subject: { id: post.id }, object: { id: topic.id } }],
      { query },
    )

    const [cachedBeforeCommit] = await getEntityRelationElectionByIdCachedBatch([relationId])
    expect(cachedBeforeCommit?.votes_score_net).toBe(0)

    await query.commit()

    const [cachedAfterCommit] = await getEntityRelationElectionByIdCachedBatch([relationId])
    expect(cachedAfterCommit?.votes_score_net).toBeGreaterThan(0)
  })

  it('persists the creator vote and aggregate score in the caller transaction', async () => {
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator })
    const topic = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })

    await using query = await beginTransaction()

    const relations = await writeEntityRelations(
      relation,
      creator,
      [{ subject: { id: post.id }, object: { id: topic.id } }],
      { query },
    )
    const voteState = await getTestEntityRelationVoteState(relation.table_name, relations[0]!.id!, {
      query,
    })

    expect(voteState?.votes_score_net).toBeGreaterThan(0)
    expect(voteState?.user_id).toBe(creator.id)
    expect(voteState?.score).toBe(1)
    await query.commit()
    const [writtenRelation] = relations

    expect(writtenRelation?.id).toBeDefined()
    const persisted = (await getEntityRelation(relation.table_name, post.id, topic.id)) as Array<{
      votes_score_net: number
    }>
    expect(persisted[0]?.votes_score_net).toBeGreaterThan(0)
    await expect(getEntityRelationVoteStorageRows([writtenRelation!.id!])).resolves.toHaveLength(1)
  })

  it('rolls back the relation and its creator vote together', async () => {
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator })
    const topic = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    const written = { relationId: undefined as string | undefined }
    await expect(
      rollbackCategoryRelationWrite(creator, post, topic, relation, written),
    ).rejects.toThrow('rollback relation transaction')

    expect(await getEntityRelation(relation.table_name, post.id, topic.id)).toEqual([])
    await expect(getEntityRelationVoteStorageRows([written.relationId!])).resolves.toEqual([])
  })

  it('keeps a prevalidated related-URL insert inside the caller transaction', async () => {
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator })
    const url = await insertTestUrlDirect(
      creator.id,
      `https://atomic-write-${post.id}.example.test`,
    )
    if (!url) throw new Error('Expected test URL')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })

    await expect(rollbackRelatedUrlRelationWrite(creator, post.id, url.id)).rejects.toThrow(
      'rollback caller-owned relation write',
    )

    await expect(getEntityRelation(relation.table_name, post.id, url.id)).resolves.toEqual([])
  })
})

async function rollbackCategoryRelationWrite(
  creator: Awaited<ReturnType<typeof createTestUser>>,
  post: Awaited<ReturnType<typeof createTestPost>>,
  topic: Awaited<ReturnType<typeof createTestTopic>>,
  relation: ReturnType<typeof getEntityRelationMetadataOrThrow>,
  written: { relationId?: string },
): Promise<void> {
  await using query = await beginTransaction()
  const [writtenRelation] = await writeEntityRelations(
    relation,
    creator,
    [{ subject: { id: post.id }, object: { id: topic.id } }],
    { query },
  )
  written.relationId = writtenRelation!.id
  throw new Error('rollback relation transaction')
}

async function rollbackRelatedUrlRelationWrite(
  creator: Awaited<ReturnType<typeof createTestUser>>,
  postId: string,
  urlId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const written = await insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(
    query,
    creator,
    postId,
    [urlId],
  )
  expect(written).toHaveLength(1)
  expect(written[0]?.newly_active).toBe(true)
  throw new Error('rollback caller-owned relation write')
}
