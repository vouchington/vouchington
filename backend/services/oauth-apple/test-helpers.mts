import { createSign, generateKeyPairSync } from 'node:crypto'
import type { fetch as undiciFetch } from 'undici'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>

const { privateKey: applePrivateKey, publicKey: applePublicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const appleJwk = applePublicKey.export({ format: 'jwk' }) as Record<string, string>

export function makeFetchResponse(jwk: Record<string, string>): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ keys: [jwk] }),
  } as FetchResponse
}

export function makeAppleJwk(kid: string): Record<string, string> {
  return {
    kid,
    alg: 'RS256',
    use: 'sig',
    kty: String(appleJwk.kty),
    n: String(appleJwk.n),
    e: String(appleJwk.e),
  }
}

export function createSignedJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  stubFetch?: (jwk: Record<string, string>) => void,
): string {
  stubFetch?.(makeAppleJwk(String(header.kid)))

  const encodedHeader = encodeJwtPart(header)
  const encodedPayload = encodeJwtPart(payload)
  const signer = createSign('RSA-SHA256')
  signer.update(`${encodedHeader}.${encodedPayload}`)
  signer.end()
  const signature = signer.sign(applePrivateKey).toString('base64url')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function encodeJwtPart(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
