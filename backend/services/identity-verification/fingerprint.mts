import { createHmac } from 'node:crypto'

/**
 * Compute a 64-char hex HMAC-SHA256 fingerprint of a government ID document.
 * The raw documentNumber MUST be discarded by the caller after this function returns —
 * it must never be logged or persisted.
 *
 * Reads IDENTITY_FINGERPRINT_SECRET from process.env at call time so that test
 * environments can set the variable in beforeEach without module-cache issues.
 */
export function computeIdentityFingerprint({
  issuingCountry,
  documentType,
  documentNumber,
}: {
  issuingCountry: string
  documentType: string
  documentNumber: string
}): string {
  const secret = process.env.IDENTITY_FINGERPRINT_SECRET ?? ''
  if (secret.length < 32) {
    throw new Error(
      'BUG: IDENTITY_FINGERPRINT_SECRET must be at least 32 characters. Set this env var before calling computeIdentityFingerprint.',
    )
  }
  const country = issuingCountry.trim().toUpperCase()
  const docType = documentType.trim().toUpperCase()
  const docNumber = documentNumber.trim().toUpperCase()
  return createHmac('sha256', secret).update(`${country}:${docType}:${docNumber}`).digest('hex')
}
