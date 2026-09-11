import { describe, expect, it } from 'vitest'
import {
  SESSION_EXPIRATION_STRING,
  ATTESTED_SESSION_EXPIRATION_STRING,
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  sessionExpiryFor,
} from './index.mts'

describe('ATTESTED_SESSION_EXPIRATION_SECONDS', () => {
  it('is 30 days in seconds', () => {
    expect(ATTESTED_SESSION_EXPIRATION_SECONDS).toBe(30 * 24 * 60 * 60)
  })
})

describe('sessionExpiryFor', () => {
  it('returns the attested expiration string for an attested device', () => {
    expect(sessionExpiryFor('attested')).toBe(ATTESTED_SESSION_EXPIRATION_STRING)
  })

  it('returns the default expiration string when no device class is given', () => {
    expect(sessionExpiryFor(undefined)).toBe(SESSION_EXPIRATION_STRING)
  })

  it('returns the default expiration string when called with no arguments', () => {
    expect(sessionExpiryFor()).toBe(SESSION_EXPIRATION_STRING)
  })
})
