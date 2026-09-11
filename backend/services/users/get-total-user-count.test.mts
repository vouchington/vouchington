import { describe, it, expect } from 'vitest'
import { getTotalUserCount } from './get-total-user-count.mts'
import { createTestUserDirect } from '@voucha/test-helpers'

// This is a global, unscoped aggregate (used by the ActivityPub NodeInfo endpoint's coarse usage
// count), so tests avoid exact-delta assertions that would race against other test files
// concurrently inserting/soft-deleting users in the shared test database — see
// docs/development/tests.md#parallel-safety-and-test-root-hygiene and the precedent in
// backend/services/growth-metrics/get-growth-metrics.test.mts (`total_users` type/bound checks
// only).
describe('getTotalUserCount', () => {
  it('returns a non-negative integer', async () => {
    const count = await getTotalUserCount()
    expect(Number.isInteger(count)).toBe(true)
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('reflects a newly created active user', async () => {
    const before = await getTotalUserCount()
    await createTestUserDirect()
    const after = await getTotalUserCount()
    expect(after).toBeGreaterThan(before)
  })
})
