import { createHash } from 'node:crypto'

export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Build the canonical signing string for per-request App Attest verification.
 *
 * Format (5 lines joined by LF, no trailing newline):
 *   VOUCHA-REQSIG-v1
 *   {METHOD}           uppercase HTTP method
 *   {PATH}             pathname only, no query string
 *   {BODY_SHA256_HEX}  lowercase hex sha256 of raw body; empty body → EMPTY_BODY_SHA256
 *   {TIMESTAMP}        client Unix epoch seconds, base-10 string
 *   {NONCE}            client-generated >=128-bit random, opaque
 *
 * This string is passed unhashed as `payload` to verifyAssertionSignature. node-app-attest
 * SHA-256-hashes it internally before comparing against the assertion signature.
 */
export function buildCanonicalRequestString(
  method: string,
  path: string,
  bodySha256Hex: string,
  timestamp: string,
  nonce: string,
): string {
  return ['VOUCHA-REQSIG-v1', method.toUpperCase(), path, bodySha256Hex, timestamp, nonce].join(
    '\n',
  )
}
