import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDigest } from '@vouchington/utils/http-signatures'
import { generateRsaSha256KeyPair } from './keys.mts'
import { verifySignature } from './verify.mts'
import {
  BODY,
  buildManualSignature,
  FULL_HEADERS,
  HOST,
  METHOD,
  PATH,
} from '@voucha/test-helpers/modules/http-signatures/verify-fixtures'

const referenceTime = new Date('2026-01-01T00:00:00.000Z')

describe('HTTP signature verification', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(process.env.VOUCH_PROOF_NOW ?? '2026-10-05T23:59:40.000Z'))
  })
  afterEach(() => vi.useRealTimers())
  describe('verifySignature additionalHeaders', () => {
    it('verifies a signature that also covers content-type via additionalHeaders', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = referenceTime.toUTCString()
      const digestHeader = computeDigest(BODY)
      const contentType = 'application/activity+json'
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: [...FULL_HEADERS, 'content-type'],
        additionalHeaders: { 'content-type': contentType },
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
        { additionalHeaders: { 'content-type': contentType }, referenceTime },
      )

      expect(result.valid).toBe(true)
    })

    it('rejects a signed header not present in additionalHeaders', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = referenceTime.toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: [...FULL_HEADERS, 'x-custom-header'],
        additionalHeaders: { 'x-custom-header': 'anything' },
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
        { referenceTime },
      )

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Unknown signed header: x-custom-header')
    })
  })

  describe('verifySignature signature header defaults', () => {
    it('defaults a missing algorithm when keyId contains a comma', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = referenceTime.toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: FULL_HEADERS,
        algorithm: null,
        keyId: 'https://alice.example.com/ap/users/a,b#main-key',
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
        { referenceTime },
      )

      expect(result.valid).toBe(true)
    })
  })
})
