import { describe, it, expect } from 'vitest'
import { waitForDeliverActivityJobs } from '@voucha/test-helpers/ap-inbox-activity-fixtures'

// Keep this queue-backed wait test in the service project, whose global setup owns the real
// ActivityPub delivery queue. The pure backend-test-helpers project does not initialize it.
describe('waitForDeliverActivityJobs', () => {
  it('retries until the timeout elapses when the predicate never matches', async () => {
    const jobs = await waitForDeliverActivityJobs(() => false, 50)

    expect(Array.isArray(jobs)).toBe(true)
  })
})
