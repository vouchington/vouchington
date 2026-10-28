import { describe, expect, it } from 'vitest'
import { beginTransaction, getTestPostgresBackendProcessId } from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { lockHostnameOwnership } from './ownership-lock.mts'
import { getUrlHostnameByAny } from './get.mts'
import { prepareUrlHostnamesForOwnedMutation, upsertUrlHostnames } from './upsert.mts'

describe('concurrent public hostname batch', () => {
  it('resolves a cold conflict before acquiring the existing hostname ownership lock', async () => {
    const existing = `public-existing-${crypto.randomUUID()}.example.com`
    const cold = `public-cold-${crypto.randomUUID()}.example.com`
    const existingId = (await upsertUrlHostnames(null, [existing])).get(existing)!

    await using owner = await beginTransaction()
    const coldId = (await prepareUrlHostnamesForOwnedMutation(null, [cold], owner)).get(cold)!
    const ownerPid = await getTestPostgresBackendProcessId(owner)
    const resolved = await withTestOwnedPostgresWait(
      {
        holderProcessId: ownerPid,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'upsertUrlHostnames:insertMissing',
        releaseHolder: () => owner[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const promoting = upsertUrlHostnames(null, [existing, cold])
        await waitForLock(promoting)
        // The old public path held existingId's advisory lock before waiting on
        // coldId's uncommitted row, so this acquisition formed a database deadlock.
        await lockHostnameOwnership(owner, [existingId])
        await owner.commit()
        return promoting
      },
    )
    expect(resolved.get(existing)).toBe(existingId)
    expect(resolved.get(cold)).toBe(coldId)
    expect((await getUrlHostnameByAny(existingId))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect((await getUrlHostnameByAny(coldId))?.publicly_introduced_at).toBeInstanceOf(Date)
  })
})
