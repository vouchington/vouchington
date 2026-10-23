import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { lockHostnameOwnership } from './ownership-lock.mts'
import { getUrlHostnameById } from './get.mts'
import { prepareUrlHostnamesForOwnedMutation, upsertUrlHostnames } from './upsert.mts'

describe('concurrent public hostname batch', () => {
  it('resolves a cold conflict before acquiring the existing hostname ownership lock', async () => {
    const existing = `public-existing-${crypto.randomUUID()}.example.com`
    const cold = `public-cold-${crypto.randomUUID()}.example.com`
    const existingId = (await upsertUrlHostnames(null, [existing])).get(existing)!

    await using owner = await beginTransaction()
    const coldId = (await prepareUrlHostnamesForOwnedMutation(null, [cold], owner)).get(cold)!
    const ownerPid = await getTestPostgresBackendProcessId(owner)
    const promoting = upsertUrlHostnames(null, [existing, cold])
    void promoting.catch(() => {})

    await waitForTestPostgresLockWaiter(ownerPid, 'upsertUrlHostnames:insertMissing')
    // The old public path held existingId's advisory lock before waiting on
    // coldId's uncommitted row, so this acquisition formed a database deadlock.
    await lockHostnameOwnership(owner, [existingId])
    await owner.commit()

    const resolved = await promoting
    expect(resolved.get(existing)).toBe(existingId)
    expect(resolved.get(cold)).toBe(coldId)
    expect((await getUrlHostnameById(existingId))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect((await getUrlHostnameById(coldId))?.publicly_introduced_at).toBeInstanceOf(Date)
  })
})
