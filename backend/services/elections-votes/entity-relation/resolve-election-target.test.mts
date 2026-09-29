import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import { resolveEntityRelationElectionTargetById } from './resolve-election-target.mts'

describe('resolveEntityRelationElectionTargetById', () => {
  it('names the one election table that holds a unique id', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 1,
      topicRelated: 2,
      viewerVotes: { postCategory: 1, topicRelated: 1 },
    })

    await expect(
      resolveEntityRelationElectionTargetById(fixture.uniqueTopicRelatedId),
    ).resolves.toEqual({
      entityRelationId: fixture.uniqueTopicRelatedId,
      relationTable: 'relation__topic__related__post',
    })
  })

  it('returns null for an id that no election table holds', async () => {
    await expect(resolveEntityRelationElectionTargetById(randomUUID())).resolves.toBeNull()
  })

  it('rejects an id shared by two election tables instead of choosing one', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 1,
      topicRelated: 2,
      viewerVotes: { postCategory: 1, topicRelated: 1 },
    })

    await expect(resolveEntityRelationElectionTargetById(fixture.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('rejects a malformed id', async () => {
    await expect(resolveEntityRelationElectionTargetById('not-a-uuid')).rejects.toMatchObject({
      status: 422,
    })
  })
})
