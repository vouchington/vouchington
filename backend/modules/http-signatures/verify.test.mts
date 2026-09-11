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

describe('verifySignature', () => {
  describe('date handling', () => {
    it('rejects an invalid date header', () => {
      const { publicKeyPem } = generateRsaSha256KeyPair()
      const result = verifySignature(
        METHOD,
        PATH,
        HOST,
        BODY,
        'Signature keyId="x",headers="(request-target) host date digest",signature="abc"',
        computeDigest(BODY),
        'not-a-real-date',
        publicKeyPem,
      )

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid date header')
    })

    it('rejects a signature older than maxAge (replay protection)', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader: staleDate,
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
        staleDate,
        publicKeyPem,
      )

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Date header too old')
    })

    it('rejects a signature dated in the future beyond maxAge', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader: futureDate,
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
        futureDate,
        publicKeyPem,
      )

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Date header too old')
    })

    it('accepts a stale date when maxAge is widened via options', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader: staleDate,
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
        staleDate,
        publicKeyPem,
        { maxAge: 24 * 60 * 60 },
      )

      expect(result.valid).toBe(true)
    })
  })

  describe('required signed headers', () => {
    it('rejects a signature missing the host header (closes the replay/host-confusion gap)', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = new Date().toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: ['(request-target)', 'date', 'digest'],
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
      )

      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Signature must cover (request-target), host, date, digest (missing: host)',
      )
    })

    it('rejects a signature missing the date header', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = new Date().toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: ['(request-target)', 'host', 'digest'],
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
      )

      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Signature must cover (request-target), host, date, digest (missing: date)',
      )
    })

    it('rejects a signature covering only (request-target) and digest', () => {
      // This is the reference implementation's previously-documented gap: a signature covering
      // only (request-target)+digest used to verify successfully, meaning it could be replayed
      // against a different host or well past its intended validity window. Both host and date
      // are now required.
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = new Date().toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: ['(request-target)', 'digest'],
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
      )

      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Signature must cover (request-target), host, date, digest (missing: host, date)',
      )
    })
  })

  describe('algorithm handling', () => {
    it('rejects an unsupported algorithm', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = new Date().toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: FULL_HEADERS,
        algorithm: 'sha1',
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
      )

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Unsupported signature algorithm: sha1')
    })

    it('accepts hs2019', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = new Date().toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: FULL_HEADERS,
        algorithm: 'hs2019',
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
      )

      expect(result.valid).toBe(true)
    })

    it('accepts a signature with the algorithm parameter omitted', () => {
      const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
      const dateHeader = new Date().toUTCString()
      const digestHeader = computeDigest(BODY)
      const signatureHeader = buildManualSignature({
        privateKeyPem,
        dateHeader,
        digestHeader,
        headerNames: FULL_HEADERS,
        algorithm: null,
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
      )

      expect(result.valid).toBe(true)
    })
  })
})
