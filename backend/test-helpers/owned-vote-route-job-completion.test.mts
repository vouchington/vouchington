import { describe, expect, it } from 'vitest'
import { waitForOwnedVoteRouteJob } from './owned-vote-route-job-completion.mts'

describe('owned vote route admission deadline', () => {
  it('names a stalled active job when its deadline expires', async () => {
    await expect(
      waitForOwnedVoteRouteJob(
        { getState: async () => 'active' },
        'topics:stalled-admission',
        AbortSignal.timeout(50),
        new Map(),
        new Map(),
        [],
      ),
    ).rejects.toThrow('Owned wait expired; not cancelled: topics:stalled-admission')
  })
})
