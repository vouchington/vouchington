import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  ELECTION_LANES,
  type ElectionJobData,
  type ElectionLane,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { processElection } from './elections.mts'

function electionJob(lane: ElectionLane): Job<ElectionJobData> {
  const data =
    lane === 'entity_relation'
      ? {
          electionId: randomUUID(),
          orderingKey: lane,
          relationTable: 'relation__post__category__topic',
        }
      : { electionId: randomUUID(), orderingKey: lane }
  return { data, opts: {} } as Job<ElectionJobData>
}

describe('processElection', () => {
  it.each(ELECTION_LANES)('recomputes an election of the %s lane', async lane => {
    await expect(processElection(electionJob(lane))).resolves.toBeUndefined()
  })
})
