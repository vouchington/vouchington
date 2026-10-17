import { toEntityRelationElectionTable } from '@services/elections-votes/entity-relation/target'
import { describe, expect, it } from 'vitest'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import {
  getEntityRelationElectionVote,
  getEntityRelationElectionVotesByElectionId,
  getEntityRelationElectionVotesByUser,
} from './votes-get.mts'

describe('concrete relation vote readers', () => {
  it('isolates shared UUIDs by known family and rejects ambiguous bare IDs', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 3,
      topicRelated: 7,
      viewerVotes: { postCategory: 1, topicRelated: -1 },
    })
    await expect(
      getEntityRelationElectionVotesByUser(
        fixture.viewer.id,
        toEntityRelationElectionTable(fixture.postCategory.relationTable),
        [fixture.id],
      ),
    ).resolves.toMatchObject([{ choice: 'confirm' }])
    await expect(
      getEntityRelationElectionVotesByUser(
        fixture.viewer.id,
        toEntityRelationElectionTable(fixture.topicRelated.relationTable),
        [fixture.id],
      ),
    ).resolves.toMatchObject([{ choice: 'dispute' }])
    await expect(
      getEntityRelationElectionVote(fixture.viewer.id, fixture.id),
    ).rejects.toMatchObject({ statusCode: 409 })
    await expect(
      getEntityRelationElectionVotesByElectionId(fixture.id, { limit: 2 }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await expect(
      getEntityRelationElectionVote(fixture.viewer.id, fixture.uniqueTopicRelatedId),
    ).resolves.toBeNull()
  })
})
