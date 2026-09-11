import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { followerDistributions } from '@queues/follower-distributions/queues'
import { followerDistributionsWorker } from './workers.mts'

describe('followerDistributionsWorker', () => {
  beforeEach(async () => {
    await followerDistributions.obliterate({ force: true })
  })

  afterAll(async () => {
    await followerDistributionsWorker.close()
  })

  it('rejects unknown jobs', async () => {
    await expect(
      followerDistributions.add(
        'missingJob',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Follower distribution job missingJob not found')
  })
})
