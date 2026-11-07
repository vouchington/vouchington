import { describe, expect, it } from 'vitest'
import { waitForOwnedVoteRouteJob } from './owned-vote-route-job-completion.mts'
import { admissionObservationDeadline } from './real-glide-terminal-deadline.mts'

describe('owned vote route admission deadline', () => {
  it('names a stalled active job before the default project budget', async () => {
    const started = performance.now()
    await expect(
      waitForOwnedVoteRouteJob(
        { getState: async () => 'active' },
        'topics:stalled-admission',
        admissionObservationDeadline(),
        new Map(),
        new Map(),
        [],
      ),
    ).rejects.toThrow('Owned wait expired; not cancelled: topics:stalled-admission')
    expect(performance.now() - started).toBeLessThan(5_000)
  })
})
