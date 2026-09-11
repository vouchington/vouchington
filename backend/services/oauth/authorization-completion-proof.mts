import { createHash, timingSafeEqual } from 'node:crypto'
import createHttpError from 'http-errors'
import type { CompletionRow } from './authorization-completion-types.mts'

export function assertCompletionProof(authorization: CompletionRow, verifier?: string): void {
  if (authorization.callback_mode === 'native') {
    const challenge =
      verifier && /^[A-Za-z0-9_-]{43}$/.test(verifier)
        ? createHash('sha256').update(verifier).digest('base64url')
        : ''
    if (
      !authorization.completion_proof_challenge ||
      !safeEqual(authorization.completion_proof_challenge, challenge)
    ) {
      throw createHttpError(401, 'OAuth completion proof is invalid')
    }
  } else if (verifier !== undefined) {
    throw createHttpError(422, 'Web OAuth completion does not accept a proof verifier')
  }
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
