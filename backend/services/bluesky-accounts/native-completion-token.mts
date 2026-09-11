import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { hashToken } from '@modules/token-secrets'

const TOKEN_PURPOSE_PREFIX = 'bluesky-native-link-completion'

export function createNativeCompletionToken(flowId: string): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashNativeCompletionToken(flowId, token) }
}

export function nativeCompletionTokenMatches(
  flowId: string,
  token: string,
  expectedHash: string,
): boolean {
  const expectedBuffer = Buffer.from(expectedHash, 'hex')
  const presentedBuffer = Buffer.from(hashNativeCompletionToken(flowId, token), 'hex')
  return (
    expectedBuffer.length === presentedBuffer.length &&
    timingSafeEqual(expectedBuffer, presentedBuffer)
  )
}

export function nativeCompletionProofMatches(verifier: string, expectedChallenge: string): boolean {
  const presentedChallenge = createHash('sha256').update(verifier).digest('base64url')
  const expectedBuffer = Buffer.from(expectedChallenge)
  const presentedBuffer = Buffer.from(presentedChallenge)
  return (
    expectedBuffer.length === presentedBuffer.length &&
    timingSafeEqual(expectedBuffer, presentedBuffer)
  )
}

function hashNativeCompletionToken(flowId: string, token: string): string {
  return hashToken(`${TOKEN_PURPOSE_PREFIX}:${flowId}`, token)
}
