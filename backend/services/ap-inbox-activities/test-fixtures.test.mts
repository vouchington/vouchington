import { describe, it, expect } from 'vitest'
import { waitForDeliverActivityJobs } from './test-fixtures.mts'

describe('waitForDeliverActivityJobs', () => {
  it('retries until the timeout elapses when the predicate never matches', async () => {
    const jobs = await waitForDeliverActivityJobs(() => false, 50)

    expect(Array.isArray(jobs)).toBe(true)
  })
})
