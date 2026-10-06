import { describe, it, expect } from 'vitest'
import { getTotalUserCount } from './get-total-user-count.mts'
import { createTestUserDirect } from '@voucha/test-helpers'

// This is a global, unscoped aggregate (used by the ActivityPub NodeInfo endpoint's coarse usage
// count), so tests avoid before/after deltas as well as exact counts: any test file running
// concurrently in the shared test database that soft-deletes a user, or promotes one to a platform
// account (`setAccountTypeTestUserKind` sets `platform_account_kind` on an existing active user),
// removes it from this count and can cancel out the +1 from the user created here. See
// docs/development/tests.md#parallel-safety-and-test-root-hygiene and the precedent in
// backend/services/growth-metrics/get-growth-metrics.test.mts (`total_users` type/bound checks
// only).
describe('getTotalUserCount', () => {
  it('returns a non-negative integer', async () => {
    const count = await getTotalUserCount()
    expect(Number.isInteger(count)).toBe(true)
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('counts a newly created active user', async () => {
    await createTestUserDirect()
    // The new user is active and unflagged, and this test owns it, so the count is at least 1
    // whatever else runs concurrently.
    expect(await getTotalUserCount()).toBeGreaterThanOrEqual(1)
  })
})
