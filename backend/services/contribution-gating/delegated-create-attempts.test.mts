import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  holdTestMcpCreateAttemptLock,
  listTestMcpCreateAttempts,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import { claimDelegatedCreate } from './delegated-create-attempts.mts'

describe('claimDelegatedCreate — real store', () => {
  it('claims the key afresh when the claim it conflicted with is released mid-claim', async () => {
    const user = await createTestUser()
    const key = crypto.randomUUID()
    const intent = 'a'.repeat(64)
    const abandoned = await claimDelegatedCreate(user.id, key, intent)
    expect(abandoned).toMatchObject({ kind: 'claimed' })

    // The retry conflicts with the abandoned row, then waits on its lock; the row is deleted
    // before the retry gets the lock, as a failed create releases its key.
    await using lock = await holdTestMcpCreateAttemptLock(user.id)
    const retry = claimDelegatedCreate(user.id, key, intent)
    try {
      await waitForTestPostgresLockWaiter(lock.processId, 'claimDelegatedCreate.get')
    } finally {
      await lock.deleteAndRelease()
    }
    const claim = await retry

    const rows = await listTestMcpCreateAttempts(user.id)
    expect(rows).toHaveLength(1)
    expect(claim).toEqual({ kind: 'claimed', id: rows[0]!.id })
    expect(claim).not.toEqual(abandoned)
  })
})
