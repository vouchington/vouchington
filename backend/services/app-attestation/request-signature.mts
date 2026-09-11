import { createCodedError } from '@modules/on-error/create-coded-error'
import {
  ATTESTATION_NONCE_REPLAYED,
  ATTESTATION_TIMESTAMP_INVALID,
} from '@modules/on-error/error-codes'
import { verifyAssertionSignature } from './assertion-core.mts'
import { buildCanonicalRequestString, sha256Hex } from './request-canonical.mts'
import { checkAndStoreRequestNonce } from './request-nonce.mts'

export const ATTESTED_BODY_LIMIT = '1mb'
const TIMESTAMP_TOLERANCE_SECONDS = 300

export type VerifyRequestSignatureParams = {
  method: string
  path: string
  body: Buffer
  keyId: string
  assertion: string
  timestamp: string
  nonce: string
  did: string
}

/**
 * Verify a per-request App Attest assertion.
 *
 * Checks:
 * 1. Timestamp is a valid integer within ±300 s of server time
 * 2. Nonce has not been seen before (Valkey NX SET)
 * 3. ECDSA signature over the canonical request string is valid (via App Attest)
 *
 * Sign count monotonic gate is disabled (signCountFloor=-1) because concurrent requests arrive
 * out of order. Sign count is not persisted on the per-request path to avoid racing with the
 * strict challenge-path counter used by verifyCaptchaOrAttestation.
 *
 * Throws ATTESTATION_TIMESTAMP_INVALID, ATTESTATION_NONCE_REPLAYED, or ATTESTATION_REJECTED.
 */
export async function verifyRequestSignature(params: VerifyRequestSignatureParams): Promise<void> {
  const { method, path, body, keyId, assertion, timestamp, nonce, did } = params

  if (!/^\d+$/.test(timestamp)) {
    throw createCodedError(
      422,
      'x-app-attest-timestamp must be a base-10 positive integer string',
      ATTESTATION_TIMESTAMP_INVALID,
    )
  }
  const ts = Number(timestamp)
  if (!Number.isInteger(ts) || ts <= 0) {
    throw createCodedError(
      422,
      'x-app-attest-timestamp must be a positive integer',
      ATTESTATION_TIMESTAMP_INVALID,
    )
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw createCodedError(
      422,
      'x-app-attest-timestamp is outside the allowed window',
      ATTESTATION_TIMESTAMP_INVALID,
    )
  }

  const fresh = await checkAndStoreRequestNonce(keyId, nonce)
  if (!fresh) {
    throw createCodedError(
      422,
      'x-app-attest-nonce has already been used',
      ATTESTATION_NONCE_REPLAYED,
    )
  }

  const bodySha256Hex = sha256Hex(body)
  const canonical = buildCanonicalRequestString(method, path, bodySha256Hex, timestamp, nonce)

  await verifyAssertionSignature({
    keyId,
    did,
    assertion: Buffer.from(assertion, 'base64'),
    payload: canonical,
    signCountFloor: -1,
  })
}
