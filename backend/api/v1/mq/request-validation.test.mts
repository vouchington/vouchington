import { describe } from 'vitest'
import { registerStaffRequestContractTests } from '../../../test-helpers/staff-request-contract-matrix.mts'

const MQ = '/api/v1/mq'

// The path schemas are plain strings, so an unknown queue, backfill or job stays the route's 404.
// Ordering: the role gate answers first, then the path contract, then the registry lookup, so no
// queue is paused, resumed, retried or run for an unknown name.
describe('mq path contracts', () => {
  registerStaffRequestContractTests(
    [
      ['pause unknown queue', 'post', `${MQ}/queues/no-such-queue/pause`],
      ['resume unknown queue', 'post', `${MQ}/queues/no-such-queue/resume`],
      ['retry-failed unknown queue', 'post', `${MQ}/queues/no-such-queue/retry-failed`],
      ['backfill run unknown id', 'post', `${MQ}/backfills/no-such-backfill/runs`],
      ['scheduled job run unknown id', 'post', `${MQ}/scheduled-jobs/no-such-job/runs`],
    ],
    { status: 404 },
  )
})
