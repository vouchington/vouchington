import { describe, expect, it } from 'vitest'
import {
  createDbscTestSession,
  DBSC_TEST_REGISTRATION_URL,
} from '@voucha/test-helpers/dbsc-session'
import { expireTestPreviousDeviceTokenGrace } from '@voucha/test-helpers/entities/device-authority'
import { authorizeDbscProof } from './dbsc-proof.mts'
import { createDbscRegistrationOffer, createDbscRefreshChallenge } from './dbsc-registration.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { refreshSessionState } from './flows.mts'

describe('browser device-bound recovery', () => {
  it('binds registration atomically when the credential response was lost after an unbound rotation', async () => {
    const fixture = await createDbscTestSession()
    const rotated = await refreshSessionState(fixture.base)
    const nonce = await createDbscRegistrationOffer(fixture.base)
    expect(nonce).toBeTruthy()
    const proof = await authorizeDbscProof({
      ...fixture.base,
      purpose: 'registration',
      requestUrl: DBSC_TEST_REGISTRATION_URL,
      proofHeader: await fixture.sign(nonce!, true),
    })
    const recovered = await refreshSessionState({ ...fixture.base, dbscProof: proof })
    expect(recovered.dt).toBe(rotated.dt)
    expect(await readSessionDeviceAuthority(recovered.sid)).toMatchObject({
      revoked_at: null,
      device_bound_session_binding: { publicKey: fixture.publicKey },
    })
    expect(
      await createDbscRegistrationOffer({ ...fixture.base, deviceToken: recovered.dt }),
    ).toBeNull()
    expect(
      await createDbscRefreshChallenge({
        ...fixture.base,
        deviceToken: recovered.dt,
        sessionId: fixture.tokens.sessionToken.payload.sid,
        origin: 'https://other.example',
      }),
    ).toBeNull()
  })

  it('revokes an old credential if its grace expires while a browser proof is being verified', async () => {
    const fixture = await createDbscTestSession()
    const sid = fixture.tokens.sessionToken.payload.sid
    await expect(
      authorizeDbscProof({
        ...fixture.base,
        purpose: 'registration',
        requestUrl: DBSC_TEST_REGISTRATION_URL,
        proofHeader: await fixture.sign(fixture.nonce, true),
        fetchUser: async uid => {
          const user = await fixture.base.fetchUser(uid)
          await refreshSessionState(fixture.base)
          await expireTestPreviousDeviceTokenGrace(fixture.user.id, sid)
          return user
        },
      }),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_REFRESH_REUSED' })
    expect((await readSessionDeviceAuthority(sid))!.revoked_at).toBeInstanceOf(Date)
  })
})
