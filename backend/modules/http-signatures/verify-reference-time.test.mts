import { describe, expect, it } from 'vitest'
import { computeDigest } from './digest.mts'
import { generateRsaSha256KeyPair } from './keys.mts'
import { verifySignature } from './verify.mts'
import {
  BODY,
  buildManualSignature,
  FULL_HEADERS,
  HOST,
  METHOD,
  PATH,
} from './verify-test-helpers.mts'

describe('verifySignature queued reference time', () => {
  it('evaluates signature freshness relative to request receipt time', () => {
    const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
    const receivedAt = new Date('2026-01-01T00:00:00.000Z')
    const dateHeader = new Date(receivedAt.getTime() - 30_000).toUTCString()
    const digestHeader = computeDigest(BODY)
    const signatureHeader = buildManualSignature({
      privateKeyPem,
      dateHeader,
      digestHeader,
      headerNames: FULL_HEADERS,
    })

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      signatureHeader,
      digestHeader,
      dateHeader,
      publicKeyPem,
      { referenceTime: receivedAt },
    )

    expect(result.valid).toBe(true)
  })
})
