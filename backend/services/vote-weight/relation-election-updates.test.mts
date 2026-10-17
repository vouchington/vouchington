import { createTestUser, softDeleteUser } from '@voucha/test-helpers/entities/users'
import { toEntityRelationElectionTable } from '@services/elections-votes/entity-relation/target'
import { describe, expect, it } from 'vitest'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import { insertTestEntityRelationVote } from '@voucha/test-helpers/entities/entity-relation-votes'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { readEntityRelationUserVotePage } from '@services/elections-votes/entity-relation/read-user-vote-page'
import { enqueueElectionUpdatePageForUser } from './enqueue-election-updates.mts'
import type { UserElectionFanOutCursor } from '@queues/vote-aggregation/enqueues/types-vote-weight'
import { findUsersForElectionVoteReplay } from './relation-election-updates.mts'

describe('relation election fanout', () => {
  it('persists the next event cursor and safely replays a page without writing ballots', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 3,
      topicRelated: 7,
      viewerVotes: { postCategory: 1, topicRelated: -1 },
    })
    await insertTestEntityRelationVote({
      relationTable: fixture.topicRelated.relationTable,
      relationId: fixture.uniqueTopicRelatedId,
      subjectId: fixture.topicRelated.subjectId,
      userId: fixture.viewer.id,
      score: 1,
    })
    const before = await readEntityRelationUserVotePage(
      fixture.viewer.id,
      fixture.topicRelated.relationTable,
      { limit: 3 },
    )
    let cursor: UserElectionFanOutCursor | null = null
    const targets: Array<{ electionId: string; relationTable: string }> = []
    let pages = 0
    do {
      const page = await enqueueElectionUpdatePageForUser(fixture.viewer.id, cursor, 1)
      expect(page.jobIds.length).toBeLessThanOrEqual(1)
      const jobs = await Promise.all(page.jobIds.map(id => voteAggregation.getJob(id)))
      for (const job of jobs) {
        expect(job?.name).toBe('vote-aggregation.processUpdateElectionVoteStats')
        targets.push(job!.data as { electionId: string; relationTable: string })
      }
      // A retry of the exact cursor re-enqueues the same absolute tally, not another ballot.
      await enqueueElectionUpdatePageForUser(fixture.viewer.id, cursor, 1)
      cursor = page.nextCursor
      expect(++pages).toBeLessThan(10)
    } while (cursor)
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          electionId: fixture.id,
          relationTable: toEntityRelationElectionTable(fixture.topicRelated.relationTable),
        }),
        expect.objectContaining({
          electionId: fixture.id,
          relationTable: toEntityRelationElectionTable(fixture.postCategory.relationTable),
        }),
        expect.objectContaining({ electionId: fixture.uniqueTopicRelatedId }),
      ]),
    )
    expect(targets).toHaveLength(3)
    await expect(
      readEntityRelationUserVotePage(fixture.viewer.id, fixture.topicRelated.relationTable, {
        limit: 3,
      }),
    ).resolves.toEqual(before)
  })

  it('continues past a deleted-only page to its active fixture without expanding the read', async () => {
    const ids = (await Promise.all([createTestUser(), createTestUser(), createTestUser()]))
      .map(user => user.id)
      .toSorted()
    await softDeleteUser(ids[1]!)
    const deletedPage = await findUsersForElectionVoteReplay(ids[0]!, 1)
    expect(deletedPage).toEqual({ userIds: [], nextCursor: ids[1] })
    const activePage = await findUsersForElectionVoteReplay(deletedPage.nextCursor, 1)
    expect(activePage).toEqual({ userIds: [ids[2]], nextCursor: ids[2] })
  })
})
