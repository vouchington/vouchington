import { describe, expect, it } from 'vitest'
import { createDbscTestSession } from '@voucha/test-helpers/dbsc-session'
import { softDeleteUser, suspendTestUser } from '@voucha/test-helpers/entities/users'
import { refreshSessionState } from './flows.mts'
import { revokeSession } from './user-session-revocation.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'

describe('device-bound session live authority', () => {
  it('rejects a durably revoked session before offering another challenge', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    await revokeSession(registered.sid)
    await expect(fixture.challenge(registered.dt)).rejects.toMatchObject({ status: 401 })
    expect((await readSessionDeviceAuthority(registered.sid))!.revoked_at).toBeInstanceOf(Date)
  })

  it('does not authorize a retained credential after its user is deleted', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    await softDeleteUser(fixture.user.id)
    await expect(fixture.challenge(registered.dt)).rejects.toMatchObject({ status: 401 })
  })

  it('preserves the same suspended-user renewal policy for bound and unbound sessions', async () => {
    const unbound = await createDbscTestSession()
    const bound = await createDbscTestSession()
    const registered = await bound.register()
    await suspendTestUser(unbound.user.id)
    await suspendTestUser(bound.user.id)
    const unboundResult = await refreshSessionState(unbound.base)
    const nonce = await bound.challenge(registered.dt)
    const proof = await bound.authorizeRefresh(registered.dt, nonce)
    const boundResult = await refreshSessionState({
      ...bound.base,
      deviceToken: registered.dt,
      dbscProof: proof,
    })
    expect(unboundResult.uid).toBe(unbound.user.id)
    expect(boundResult.uid).toBe(bound.user.id)
  })
})
