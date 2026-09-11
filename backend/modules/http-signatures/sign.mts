import { buildSignatureHeaders as buildPlatformSignatureHeaders } from '@vouchington/utils/http-signatures'

export interface SignatureHeaders {
  digest: string
  signature: string
  date: string
}

const SIGNED_HEADERS = ['(request-target)', 'host', 'date', 'digest'] as const

export function buildSignatureHeaders(
  method: string,
  url: string,
  body: string | Buffer,
  keyId: string,
  privateKeyPem: string,
): SignatureHeaders {
  return buildPlatformSignatureHeaders({
    method,
    url,
    body,
    keyId,
    privateKeyPem,
    signedHeaders: SIGNED_HEADERS,
    algorithm: 'rsa-sha256',
  })
}

export function withSignatureHeaders(
  headers: Record<string, string>,
  signatureHeaders: SignatureHeaders,
): Record<string, string> {
  return {
    ...headers,
    digest: signatureHeaders.digest,
    signature: signatureHeaders.signature,
    date: signatureHeaders.date,
  }
}
