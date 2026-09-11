import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { computeIdentityFingerprint } from '../fingerprint.mts'

const VALID_SECRET = 'a'.repeat(32)

describe('computeIdentityFingerprint', () => {
  const originalSecret = process.env.IDENTITY_FINGERPRINT_SECRET

  beforeEach(() => {
    process.env.IDENTITY_FINGERPRINT_SECRET = VALID_SECRET
  })

  afterEach(() => {
    process.env.IDENTITY_FINGERPRINT_SECRET = originalSecret
  })

  it('returns a 64-char hex string', () => {
    const fingerprint = computeIdentityFingerprint({
      issuingCountry: 'US',
      documentType: 'passport',
      documentNumber: 'X12345678',
    })
    expect(fingerprint).toHaveLength(64)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces stable output for the same inputs', () => {
    const opts = { issuingCountry: 'US', documentType: 'passport', documentNumber: 'X12345678' }
    const first = computeIdentityFingerprint(opts)
    const second = computeIdentityFingerprint(opts)
    expect(first).toBe(second)
  })

  it('produces different fingerprints for different document numbers', () => {
    const base = { issuingCountry: 'US', documentType: 'passport' }
    const a = computeIdentityFingerprint({ ...base, documentNumber: 'X12345678' })
    const b = computeIdentityFingerprint({ ...base, documentNumber: 'X87654321' })
    expect(a).not.toBe(b)
  })

  it('produces different fingerprints for different issuing countries', () => {
    const base = { documentType: 'passport', documentNumber: 'X12345678' }
    const us = computeIdentityFingerprint({ ...base, issuingCountry: 'US' })
    const gb = computeIdentityFingerprint({ ...base, issuingCountry: 'GB' })
    expect(us).not.toBe(gb)
  })

  it('produces different fingerprints for different document types', () => {
    const base = { issuingCountry: 'US', documentNumber: 'X12345678' }
    const passport = computeIdentityFingerprint({ ...base, documentType: 'passport' })
    const id_card = computeIdentityFingerprint({ ...base, documentType: 'id_card' })
    expect(passport).not.toBe(id_card)
  })

  it('normalizes case: same fingerprint for lowercase vs uppercase inputs', () => {
    const upper = computeIdentityFingerprint({
      issuingCountry: 'US',
      documentType: 'PASSPORT',
      documentNumber: 'X12345678',
    })
    const lower = computeIdentityFingerprint({
      issuingCountry: 'us',
      documentType: 'passport',
      documentNumber: 'x12345678',
    })
    expect(upper).toBe(lower)
  })

  it('normalizes whitespace: same fingerprint despite extra surrounding spaces', () => {
    const clean = computeIdentityFingerprint({
      issuingCountry: 'US',
      documentType: 'passport',
      documentNumber: 'X12345678',
    })
    const padded = computeIdentityFingerprint({
      issuingCountry: '  US  ',
      documentType: '  passport  ',
      documentNumber: '  X12345678  ',
    })
    expect(clean).toBe(padded)
  })
})
