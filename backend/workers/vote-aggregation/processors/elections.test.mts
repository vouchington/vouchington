import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import type {
  ElectionJobData,
  ElectionLane,
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

const electionLanesByName = {
  topic: true,
  hostname: true,
  agent_moderation: true,
  post: true,
  entity_relation: true,
  rss_feed_item: true,
  user_vouch: true,
} as const satisfies Record<ElectionLane, true>
const electionLanes = Object.keys(electionLanesByName) as ElectionLane[]

describe('processElection', () => {
  it.each(electionLanes)('recomputes an election of the %s lane', async lane => {
    await expect(processElection(electionJob(lane))).resolves.toBeUndefined()
  })
})
