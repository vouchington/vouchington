import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  expireTestMcpCreateAttemptLeases,
  holdTestMcpCreateAttemptLock,
  listTestMcpCreateAttempts,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import {
  claimDelegatedCreate,
  completeDelegatedCreate,
  releaseDelegatedCreate,
  type DelegatedCreateClaim,
} from './delegated-create-attempts.mts'

function expectClaimed(claim: DelegatedCreateClaim) {
  expect(claim.kind).toBe('claimed')
  return claim as Extract<DelegatedCreateClaim, { kind: 'claimed' }>
}

describe('claimDelegatedCreate — real store', () => {
  it('claims the key afresh when the claim it conflicted with is released mid-claim', async () => {
    const user = await createTestUser()
    const key = crypto.randomUUID()
    const intent = 'a'.repeat(64)
    const abandoned = expectClaimed(await claimDelegatedCreate(user.id, key, intent))

    // The retry conflicts with the abandoned row, then waits on its lock; the row is deleted
    // before the retry gets the lock, as a failed create releases its key.
    await using lock = await holdTestMcpCreateAttemptLock(user.id)
    const retry = claimDelegatedCreate(user.id, key, intent)
    try {
      await waitForTestPostgresLockWaiter(lock.processId, 'claimDelegatedCreate.get')
    } finally {
      await lock.deleteAndRelease()
    }
    const claim = expectClaimed(await retry)

    const rows = await listTestMcpCreateAttempts(user.id)
    expect(rows).toHaveLength(1)
    expect(claim.id).toBe(rows[0]!.id)
    expect(claim.leaseToken).not.toBe(abandoned.leaseToken)
  })

  it('keeps a holder whose lease was taken over from finishing or freeing the new claim', async () => {
    const user = await createTestUser()
    const key = crypto.randomUUID()
    const intent = 'b'.repeat(64)
    const stale = expectClaimed(await claimDelegatedCreate(user.id, key, intent))
    await expireTestMcpCreateAttemptLeases(user.id)
    const current = expectClaimed(await claimDelegatedCreate(user.id, key, intent))
    expect(current.id).toBe(stale.id)
    expect(current.leaseToken).not.toBe(stale.leaseToken)

    await releaseDelegatedCreate(stale)
    await completeDelegatedCreate(stale, { holder: 'stale' })
    expect(await listTestMcpCreateAttempts(user.id)).toEqual([
      { id: current.id, response: null, completed_at: null },
    ])

    await completeDelegatedCreate(current, { holder: 'current' })
    expect(await claimDelegatedCreate(user.id, key, intent)).toEqual({
      kind: 'replay',
      response: { holder: 'current' },
    })
  })
})
