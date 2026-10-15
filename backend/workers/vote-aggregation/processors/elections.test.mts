import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  ELECTION_LANE_ORDERING,
  ELECTION_LANES,
  type ElectionJobData,
  type ElectionLane,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { processElection } from './elections.mts'

function electionJob(lane: ElectionLane, orderingLane: ElectionLane = lane): Job<ElectionJobData> {
  const data =
    lane === 'entity_relation'
      ? {
          electionId: randomUUID(),
          orderingKey: lane,
          relationTable: 'relation__post__category__topic',
        }
      : { electionId: randomUUID(), orderingKey: lane }
  return { data, opts: { ordering: ELECTION_LANE_ORDERING[orderingLane] } } as Job<ElectionJobData>
}

describe('processElection', () => {
  it.each(ELECTION_LANES)('recomputes an election of the %s lane', async lane => {
    await expect(processElection(electionJob(lane))).resolves.toBeUndefined()
  })

  it('rejects a job ordered under another lane than its payload names', async () => {
    await expect(processElection(electionJob('post', 'topic'))).rejects.toThrow(
      'Election job ordering mismatch: post',
    )
  })
})
