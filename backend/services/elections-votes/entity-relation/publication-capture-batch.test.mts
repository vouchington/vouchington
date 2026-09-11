import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getTestPostPublicationDirtyWorkForScope,
  insertEntityRelation,
  insertTestUrlDirect,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { createEntityRelationElectionTarget } from './target.mts'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from './vote-stats-batch.mts'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'

describe('post topic election batch publication capture', () => {
  it('captures vote-score transitions across public eligibility', async () => {
    const voter = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    await insertEntityRelation(relation.table_name, post.id, topic.id)
    const [row] = (await getEntityRelation(relation.table_name, post.id, topic.id)) as Array<{
      id: string
    }>
    const target = createEntityRelationElectionTarget(row!.id, relation.table_name)

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(entered).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(entered!.id)).resolves.toEqual([topic.id])

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })

  it('captures related URL vote-score transitions as post work', async () => {
    const voter = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const url = await insertTestUrlDirect(
      voter.id,
      `https://publication-url-batch-${randomUUID().slice(0, 8)}.example.com`,
    )
    if (!url) throw new Error('Expected test URL')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await insertEntityRelation(relation.table_name, post.id, url.id)
    const [row] = (await getEntityRelation(relation.table_name, post.id, url.id)) as Array<{
      id: string
    }>
    const target = createEntityRelationElectionTarget(row!.id, relation.table_name)

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(entered).toBeDefined()
    await expect(listTestPostPublicationImpactPostIds(entered!.id)).resolves.toEqual([post.id])
    await expect(listTestPostPublicationImpactTopicIds(entered!.id)).resolves.toEqual([])

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })
})
