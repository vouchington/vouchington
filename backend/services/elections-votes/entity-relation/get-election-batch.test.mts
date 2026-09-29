import { randomUUID } from 'node:crypto'
import { it, expect, describe } from 'vitest'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import { getEntityRelationElectionsByTargetBatch } from './get-election-batch.mts'
import { createEntityRelationElectionTarget } from './target.mts'

const postCategoryTable = 'relation__post__category__topic'
const topicRelatedTable = 'relation__topic__related__post'

describe('get-election-batch', () => {
  it('returns empty array for empty input', async () => {
    await expect(getEntityRelationElectionsByTargetBatch([])).resolves.toEqual([])
  })

  it('returns null for non-existent elections while preserving order', async () => {
    const results = await getEntityRelationElectionsByTargetBatch([
      createEntityRelationElectionTarget(randomUUID(), postCategoryTable),
      createEntityRelationElectionTarget(randomUUID(), topicRelatedTable),
    ])

    expect(results).toEqual([null, null])
  })

  it('throws for invalid IDs', async () => {
    await expect(
      getEntityRelationElectionsByTargetBatch([
        createEntityRelationElectionTarget('invalid-id', postCategoryTable),
      ]),
    ).rejects.toThrow('Invalid entity relation ID')
  })

  it('rejects a relation table that is not an election family', async () => {
    await expect(
      getEntityRelationElectionsByTargetBatch([
        { entityRelationId: randomUUID(), relationTable: 'users' },
      ]),
    ).rejects.toThrow('entityRelationTable')
  })

  it('returns each family its own election when two tables share a UUID', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 3,
      topicRelated: 7,
      viewerVotes: { postCategory: 1, topicRelated: -1 },
    })
    const postCategory = createEntityRelationElectionTarget(fixture.id, postCategoryTable)
    const topicRelated = createEntityRelationElectionTarget(fixture.id, topicRelatedTable)

    const results = await getEntityRelationElectionsByTargetBatch([
      topicRelated,
      postCategory,
      topicRelated,
    ])

    expect(results.map(result => result?.votes_score_net)).toEqual([7, 3, 7])
    expect(results.every(result => result?.id === fixture.id)).toBe(true)
  })

  it('does not resolve a UUID through a table that does not hold it', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 3,
      topicRelated: 7,
      viewerVotes: { postCategory: 1, topicRelated: 1 },
    })

    const results = await getEntityRelationElectionsByTargetBatch([
      createEntityRelationElectionTarget(fixture.uniqueTopicRelatedId, postCategoryTable),
      createEntityRelationElectionTarget(fixture.uniqueTopicRelatedId, topicRelatedTable),
    ])

    expect(results[0]).toBeNull()
    expect(results[1]).toMatchObject({ id: fixture.uniqueTopicRelatedId })
  })
})
