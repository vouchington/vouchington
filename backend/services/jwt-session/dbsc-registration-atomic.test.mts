import { describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import {
  createDbscTestSession,
  DBSC_TEST_REGISTRATION_URL,
} from '@voucha/test-helpers/dbsc-session'
import { createDbscRegistrationOffer } from './dbsc-registration.mts'
import { authorizeDbscProof } from './dbsc-proof.mts'
import { refreshSessionState } from './flows.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'

describe('DBSC registration rotation', () => {
  it('keeps the first registered browser key when another authorized registration reaches rotation', async () => {
    const fixture = await createDbscTestSession()
    const secondNonce = await createDbscRegistrationOffer(fixture.base)
    expect(secondNonce).toBeTruthy()
    const otherKey = await generateKeyPair('ES256', { extractable: true })
    const otherPublicKey = await exportJWK(otherKey.publicKey)
    const otherProofHeader = await new SignJWT({ jti: secondNonce! })
      .setProtectedHeader({ alg: 'ES256', typ: 'dbsc+jwt', jwk: otherPublicKey })
      .sign(otherKey.privateKey)
    const firstProof = await fixture.authorizeRegistration()
    const secondProof = await authorizeDbscProof({
      ...fixture.base,
      purpose: 'registration',
      requestUrl: DBSC_TEST_REGISTRATION_URL,
      proofHeader: otherProofHeader,
    })
    const first = await refreshSessionState({ ...fixture.base, dbscProof: firstProof })
    const afterFirst = await readSessionDeviceAuthority(first.sid)
    expect(afterFirst!.device_bound_session_binding).toMatchObject({ publicKey: fixture.publicKey })
    await expect(
      refreshSessionState({ ...fixture.base, dbscProof: secondProof }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_REQUIRED' })
    expect(await readSessionDeviceAuthority(first.sid)).toMatchObject({
      device_token_digest: afterFirst!.device_token_digest,
      device_bound_session_binding: afterFirst!.device_bound_session_binding,
      revoked_at: null,
    })
  })
})
