import { createPublicKey } from 'node:crypto'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ATTESTATION_REJECTED } from '@modules/on-error/error-codes'
import { verifyAssertion as verifyAppAttestAssertion } from 'node-app-attest'
import {
  getAppleAppAttestBundleId,
  getAppleAppAttestTeamId,
  isDevelopmentAttestationAllowed,
} from './config.mts'
import { loadAttestationKeyByKeyId } from './store.mts'

export type VerifyAssertionSignatureParams = {
  keyId: string
  did: string
  assertion: Buffer
  /**
   * Raw, unhashed payload the device signed. node-app-attest SHA-256-hashes this once internally.
   * Do not pre-hash before passing in.
   */
  payload: Buffer | string
  /**
   * Pass -1 to disable the monotonic sign-count gate (appropriate for per-request signing where
   * out-of-order delivery is expected). Any other value causes the stored sign_count to be used
   * as the floor, enforcing strict monotonic progression (appropriate for challenge-path assertions).
   */
  signCountFloor: -1 | 0
}

export function rejectAssertion(cause: unknown): never {
  const error = createCodedError(
    403,
    'App Attest assertion verification failed',
    ATTESTATION_REJECTED,
  )
  error.cause = cause
  throw error
}

/**
 * Verify an App Attest assertion signature against a stored public key.
 * Loads the key, checks did-binding and environment gate, then calls node-app-attest.
 * Returns the next sign count from the assertion on success.
 * Does NOT persist the sign count — callers decide how to record it.
 */
export async function verifyAssertionSignature(
  params: VerifyAssertionSignatureParams,
): Promise<number> {
  const keyIdBuffer = Buffer.from(params.keyId, 'base64')
  const storedKey = await loadAttestationKeyByKeyId(keyIdBuffer)
  if (!storedKey) {
    rejectAssertion(new Error('Unknown App Attest key'))
  }
  if (storedKey.did !== params.did) {
    rejectAssertion(new Error('App Attest key is not bound to the caller device'))
  }
  if (storedKey.environment !== 'production' && !isDevelopmentAttestationAllowed()) {
    rejectAssertion(new Error('Development App Attest keys are not allowed'))
  }

  const publicKeyPem = createPublicKey({
    key: storedKey.public_key,
    format: 'der',
    type: 'spki',
  }).export({ type: 'spki', format: 'pem' })

  const signCountGate = params.signCountFloor === -1 ? -1 : storedKey.sign_count

  let result
  try {
    result = verifyAppAttestAssertion({
      assertion: params.assertion,
      payload: params.payload,
      publicKey: publicKeyPem,
      bundleIdentifier: getAppleAppAttestBundleId(),
      teamIdentifier: getAppleAppAttestTeamId(),
      signCount: signCountGate,
    })
  } catch (err) {
    rejectAssertion(err)
  }

  return result.signCount
}
