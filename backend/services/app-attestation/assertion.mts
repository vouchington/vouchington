import assert from 'http-assert'
import { verifyAssertionSignature } from './assertion-core.mts'
import { getAndDeleteAppAttestChallenge } from './challenges.mts'
import { bumpAttestationSignCount } from './store.mts'
import type { AssertionResult } from './types.mts'

export type VerifyAssertionParams = {
  challengeKey: string
  keyId: string
  /**
   * The caller's current `did` (device-id claim), e.g. from `ctx.getDeviceTokenData()`. Must
   * match the `did` the key was attested under, or verification is rejected even for an
   * otherwise-valid signature — this stops one attested device from acting as a Turnstile-bypass
   * signing oracle for a different device's (e.g. a stolen) session.
   */
  did: string
  assertion: Buffer
  /**
   * Raw, unhashed payload the device signed (e.g. the challenge concatenated with the
   * canonical request body). node-app-attest SHA-256-hashes this exactly once internally —
   * do not pre-hash it before passing it in, or verification will fail against what the
   * device actually signed.
   */
  payload: Buffer | string
}

export async function verifyAssertion(params: VerifyAssertionParams): Promise<AssertionResult> {
  const challenge = await getAndDeleteAppAttestChallenge('assertion', params.challengeKey)
  assert(challenge !== null, 400, 'App Attest challenge missing or expired')
  // The challenge value itself is not included in the assertion payload —
  // the single-use Valkey GETDEL on the challenge ID provides replay protection.
  // See docs/overview/architecture/app-attestation.md § Replay Defenses.

  const nextSignCount = await verifyAssertionSignature({
    keyId: params.keyId,
    did: params.did,
    assertion: params.assertion,
    payload: params.payload,
    signCountFloor: 0,
  })

  const keyIdBuffer = Buffer.from(params.keyId, 'base64')
  await bumpAttestationSignCount(keyIdBuffer, nextSignCount)

  return { keyId: params.keyId, signCount: nextSignCount }
}
