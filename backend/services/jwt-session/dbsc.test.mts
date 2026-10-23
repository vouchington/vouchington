import { authorizeDbscProof } from './dbsc-proof.mts'
import { describe, expect, it } from 'vitest'
import { exportJWK, SignJWT } from 'jose'
import {
  createDbscTestSession,
  DBSC_TEST_REGISTRATION_URL,
} from '@voucha/test-helpers/dbsc-session'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { refreshSessionState } from './flows.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { getDbscChallengeKey } from './dbsc-state.mts'

describe('durable browser device-bound session authority', () => {
  it('accepts Chromium registration without iat/sub/aud and preserves original lifetime', async () => {
    const fixture = await createDbscTestSession()
    const before = await verifyDeviceJwt(fixture.tokens.deviceToken.token)
    const registered = await fixture.register()
    const after = await verifyDeviceJwt(registered.dt)
    expect(after).toMatchObject({ iat: before!.iat, exp: before!.exp })
    expect(after!.jti).not.toBe(before!.jti)
    expect(
      (await readSessionDeviceAuthority(registered.sid))!.device_bound_session_binding,
    ).toMatchObject({ publicKey: fixture.publicKey, origin: fixture.base.origin })
  })

  it('requires stored-key proof to rotate a bound session without changing authority on rejection', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    const before = await readSessionDeviceAuthority(registered.sid)
    await expect(
      refreshSessionState({ ...fixture.base, deviceToken: registered.dt }),
    ).rejects.toMatchObject({ status: 403, code: 'DBSC_PROOF_REQUIRED' })
    expect(await readSessionDeviceAuthority(registered.sid)).toMatchObject({
      device_token_digest: before!.device_token_digest,
      device_bound_session_binding: before!.device_bound_session_binding,
    })
  })

  it('renews with a raw identifier and stored-key proof', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    const nonce = await fixture.challenge(registered.dt)
    const proof = await fixture.authorizeRefresh(registered.dt, nonce)
    const refreshed = await refreshSessionState({
      ...fixture.base,
      deviceToken: registered.dt,
      dbscProof: proof,
    })
    expect(refreshed.uid).toBe(fixture.user.id)
    expect(refreshed.dt).not.toBe(registered.dt)
    const [before, after] = await Promise.all([
      verifyDeviceJwt(registered.dt),
      verifyDeviceJwt(refreshed.dt),
    ])
    expect(after).toMatchObject({ iat: before!.iat, exp: before!.exp })
  })

  it('retains binding through challenge eviction and accepts a fresh challenge', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    const nonce = await fixture.challenge(registered.dt)
    await sessionValkeyClient.unlink([getDbscChallengeKey(nonce)])
    await expect(fixture.authorizeRefresh(registered.dt, nonce)).rejects.toMatchObject({
      status: 403,
      code: 'DBSC_PROOF_REQUIRED',
    })
    expect(
      (await readSessionDeviceAuthority(registered.sid))!.device_bound_session_binding,
    ).toMatchObject({ publicKey: fixture.publicKey })
    const fresh = await fixture.challenge(registered.dt)
    const proof = await fixture.authorizeRefresh(registered.dt, fresh)
    await expect(
      refreshSessionState({ ...fixture.base, deviceToken: registered.dt, dbscProof: proof }),
    ).resolves.toMatchObject({ uid: fixture.user.id })
  })

  it('renews an unbound session without a Valkey authority document', async () => {
    const fixture = await createDbscTestSession()
    await sessionValkeyClient.unlink([getDbscChallengeKey(fixture.nonce)])
    const refreshed = await refreshSessionState(fixture.base)
    expect(refreshed.uid).toBe(fixture.user.id)
    expect(
      (await readSessionDeviceAuthority(refreshed.sid))!.device_bound_session_binding,
    ).toBeNull()
  })

  it('rejects a quoted compact proof without consuming the registration nonce', async () => {
    const fixture = await createDbscTestSession()
    const raw = await fixture.sign(fixture.nonce, true)
    await expect(fixture.authorizeRegistration(`"${raw}"`)).rejects.toMatchObject({
      status: 400,
      code: 'DBSC_PROOF_INVALID',
    })
    await expect(fixture.authorizeRegistration(raw)).resolves.toMatchObject({
      sid: fixture.tokens.sessionToken.payload.sid,
    })
  })

  it('validates optional audiences when present', async () => {
    const fixture = await createDbscTestSession()
    const sign = (aud: string) =>
      new SignJWT({ jti: fixture.nonce, aud })
        .setProtectedHeader({ alg: 'ES256', typ: 'dbsc+jwt', jwk: fixture.publicKey })
        .sign(fixture.key.privateKey)
    await expect(
      fixture.authorizeRegistration(await sign('https://other.example/')),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      fixture.authorizeRegistration(await sign(DBSC_TEST_REGISTRATION_URL)),
    ).resolves.toMatchObject({ sid: fixture.tokens.sessionToken.payload.sid })
  })

  it('rejects a private registration JWK without binding or rotating, then accepts the original nonce', async () => {
    const fixture = await createDbscTestSession()
    const sid = fixture.tokens.sessionToken.payload.sid
    const before = await readSessionDeviceAuthority(sid)
    const privateJwk = await exportJWK(fixture.key.privateKey)
    expect(privateJwk.d).toBeDefined()
    const proof = await fixture.sign(fixture.nonce, true, {
      ...fixture.publicKey,
      d: privateJwk.d!,
    })

    await expect(fixture.authorizeRegistration(proof)).rejects.toMatchObject({
      status: 400,
      code: 'DBSC_PROOF_INVALID',
    })
    expect(await readSessionDeviceAuthority(sid)).toMatchObject({
      device_token_digest: before!.device_token_digest,
      device_bound_session_binding: null,
    })

    const registered = await fixture.register()
    expect(registered.dt).not.toBe(fixture.tokens.deviceToken.token)
    expect(await readSessionDeviceAuthority(sid)).toMatchObject({
      device_bound_session_binding: { publicKey: fixture.publicKey },
    })
  })

  it('rejects a refresh proof carrying a replacement JWK without consuming its challenge', async () => {
    const fixture = await createDbscTestSession()
    const other = await createDbscTestSession()
    const registered = await fixture.register()
    const before = await readSessionDeviceAuthority(registered.sid)
    const nonce = await fixture.challenge(registered.dt)
    // The proof signature matches the registered key; only the injected header key differs.
    const injectedJwkProof = await fixture.sign(nonce, false, other.publicKey)

    await expect(
      fixture.authorizeRefresh(registered.dt, nonce, injectedJwkProof),
    ).rejects.toMatchObject({ status: 400, code: 'DBSC_PROOF_INVALID' })
    expect(await readSessionDeviceAuthority(registered.sid)).toMatchObject({
      device_token_digest: before!.device_token_digest,
      device_bound_session_binding: before!.device_bound_session_binding,
    })

    const correctedProof = await fixture.authorizeRefresh(registered.dt, nonce)
    const refreshed = await refreshSessionState({
      ...fixture.base,
      deviceToken: registered.dt,
      dbscProof: correctedProof,
    })
    expect(refreshed.dt).not.toBe(registered.dt)
    expect(await readSessionDeviceAuthority(registered.sid)).toMatchObject({
      device_bound_session_binding: before!.device_bound_session_binding,
    })
  })

  it('rejects another key without consuming the stored-key challenge', async () => {
    const fixture = await createDbscTestSession()
    const other = await createDbscTestSession()
    const registered = await fixture.register()
    const nonce = await fixture.challenge(registered.dt)
    await expect(
      fixture.authorizeRefresh(registered.dt, nonce, await other.sign(nonce)),
    ).rejects.toMatchObject({ status: 400 })
    await expect(fixture.authorizeRefresh(registered.dt, nonce)).resolves.toMatchObject({
      sid: registered.sid,
    })
  })

  it('rejects forged proof objects at the locked renewal boundary', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    const row = await readSessionDeviceAuthority(registered.sid)
    await expect(
      refreshSessionState({
        ...fixture.base,
        deviceToken: registered.dt,
        dbscProof: { sid: registered.sid, deviceTokenDigest: row!.device_token_digest! },
      }),
    ).rejects.toMatchObject({ status: 403, code: 'DBSC_PROOF_REQUIRED' })
  })

  it('serializes concurrent registrations against the same row', async () => {
    const fixture = await createDbscTestSession()
    const results = await Promise.allSettled([
      fixture.authorizeRegistration(),
      fixture.authorizeRegistration(),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const winner = results.find(result => result.status === 'fulfilled')!
    if (winner.status !== 'fulfilled') throw new Error('No winning registration')
    await expect(
      refreshSessionState({ ...fixture.base, dbscProof: winner.value }),
    ).resolves.toMatchObject({ uid: fixture.user.id })
  })

  it('rejects and revokes when ordinary rotation wins after the registration authority read', async () => {
    const fixture = await createDbscTestSession()
    let rotated: Awaited<ReturnType<typeof refreshSessionState>> | undefined
    const proofHeader = await fixture.sign(fixture.nonce, true)
    await expect(
      authorizeDbscProof({
        ...fixture.base,
        purpose: 'registration',
        requestUrl: DBSC_TEST_REGISTRATION_URL,
        proofHeader,
        fetchUser: async uid => {
          const user = await fixture.base.fetchUser(uid)
          // This is a real competing committed renewal after the optimistic read, before its lock.
          rotated = await refreshSessionState(fixture.base)
          return user
        },
      }),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_REFRESH_REUSED' })
    expect(rotated).toBeDefined()
    expect(await readSessionDeviceAuthority(fixture.tokens.sessionToken.payload.sid)).toMatchObject(
      {
        revoked_at: expect.any(Date),
        device_bound_session_binding: null,
      },
    )
    await expect(
      refreshSessionState({ ...fixture.base, deviceToken: rotated!.dt }),
    ).resolves.toMatchObject({ uid: null })
  })

  it('durably revokes a rotated device credential reused after registration', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    await expect(refreshSessionState(fixture.base)).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_REFRESH_REUSED',
    })
    expect((await readSessionDeviceAuthority(registered.sid))!.revoked_at).toBeInstanceOf(Date)
  })
})
