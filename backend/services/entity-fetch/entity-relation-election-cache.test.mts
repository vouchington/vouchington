import { describe, expect, it } from 'vitest'
import {
  createSameIdElectionRelations,
  setSameIdElectionScore,
} from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { invalidate } from '@services/entity-cache/invalidate'
import { getEntityRelationElectionByTargetCachedBatch } from './get.mts'

async function createFixture() {
  const fixture = await createSameIdElectionRelations({
    postCategory: 3,
    topicRelated: 7,
    viewerVotes: { postCategory: 1, topicRelated: -1 },
  })
  return {
    fixture,
    postCategory: createEntityRelationElectionTarget(fixture.id, 'relation__post__category__topic'),
    topicRelated: createEntityRelationElectionTarget(fixture.id, 'relation__topic__related__post'),
  }
}

async function readScores(
  ...targets: Parameters<typeof getEntityRelationElectionByTargetCachedBatch>[0]
) {
  const elections = await getEntityRelationElectionByTargetCachedBatch(targets)
  return elections.map(election => election?.votes_score_net)
}

describe('entity relation election cache identity', () => {
  it('caches a miss in one relation table without hiding the same id in another', async () => {
    const { fixture } = await createFixture()
    const wrongTable = createEntityRelationElectionTarget(
      fixture.uniqueTopicRelatedId,
      'relation__post__category__topic',
    )
    const rightTable = createEntityRelationElectionTarget(
      fixture.uniqueTopicRelatedId,
      'relation__topic__related__post',
    )

    await expect(getEntityRelationElectionByTargetCachedBatch([wrongTable])).resolves.toEqual([
      null,
    ])
    const [election] = await getEntityRelationElectionByTargetCachedBatch([rightTable])

    expect(election).toMatchObject({ id: fixture.uniqueTopicRelatedId })
  })

  it('serves each relation table its own cached election for a shared UUID', async () => {
    const { fixture, postCategory, topicRelated } = await createFixture()

    await expect(readScores(postCategory, topicRelated)).resolves.toEqual([3, 7])
    await setSameIdElectionScore(fixture, 'postCategory', 30)
    await setSameIdElectionScore(fixture, 'topicRelated', 70)

    await expect(readScores(topicRelated, postCategory)).resolves.toEqual([7, 3])
  })

  it('invalidates only the relation table named by the target', async () => {
    const { fixture, postCategory, topicRelated } = await createFixture()
    await readScores(postCategory, topicRelated)
    await setSameIdElectionScore(fixture, 'postCategory', 30)
    await setSameIdElectionScore(fixture, 'topicRelated', 70)

    await invalidate.entity_relation_elections(postCategory)
    await expect(readScores(postCategory, topicRelated)).resolves.toEqual([30, 7])

    await invalidate.entity_relation_elections(topicRelated)
    await expect(readScores(postCategory, topicRelated)).resolves.toEqual([30, 70])
  })
})
