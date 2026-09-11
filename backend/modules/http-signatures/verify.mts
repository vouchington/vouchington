import {
  extractSignatureKeyId,
  verifySignature as verifyPlatformSignature,
} from '@vouchington/utils/http-signatures'

export { extractSignatureKeyId }

interface SignatureVerificationOptions {
  maxAge?: number
  additionalHeaders?: Record<string, string>
  referenceTime?: Date
}

interface SignatureVerificationResult {
  valid: boolean
  error?: string
}

const ALLOWED_ALGORITHMS = ['rsa-sha256', 'hs2019'] as const
const REQUIRED_SIGNED_HEADERS = ['(request-target)', 'host', 'date', 'digest'] as const

function withDefaultSignatureAlgorithm(header: string): string {
  if (header.length === 0 || /algorithm="/i.test(header)) return header
  return `${header},algorithm="rsa-sha256"`
}

export function verifySignature(
  method: string,
  path: string,
  host: string,
  body: string | Buffer,
  signatureHeader: string,
  digestHeader: string,
  dateHeader: string,
  publicKeyPem: string,
  options: SignatureVerificationOptions = {},
): SignatureVerificationResult {
  return verifyPlatformSignature({
    method,
    path,
    host,
    body,
    signatureHeader: withDefaultSignatureAlgorithm(signatureHeader),
    digestHeader,
    dateHeader,
    publicKeyPem,
    requiredHeaders: REQUIRED_SIGNED_HEADERS,
    allowedAlgorithms: ALLOWED_ALGORITHMS,
    maxAgeSeconds: options.maxAge ?? 3600,
    additionalHeaders: options.additionalHeaders,
    referenceTime: options.referenceTime,
  })
}
