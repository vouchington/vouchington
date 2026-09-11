import { describe, it, expect } from 'vitest'
import { formatApiKey, parseApiKey } from './format.mts'

describe('formatApiKey + parseApiKey roundtrip', () => {
  it('roundtrips successfully for rss type', () => {
    const random = 'a'.repeat(32)
    const checksum = 'b'.repeat(16)
    const rawKey = formatApiKey('rss', random, checksum)
    const parsed = parseApiKey(rawKey)
    expect(parsed).not.toBeNull()
    expect(parsed!.type).toBe('rss')
    expect(parsed!.random).toBe(random)
    expect(parsed!.checksum).toBe(checksum)
  })
})

describe('parseApiKey returns null for invalid keys', () => {
  it('returns null for wrong prefix', () => {
    expect(parseApiKey(`fil_rss_${'a'.repeat(32)}_${'b'.repeat(16)}`)).toBeNull()
    expect(parseApiKey(`voucha-rss-${'a'.repeat(32)}-${'b'.repeat(16)}`)).toBeNull()
    expect(parseApiKey(`prefix_rss_${'a'.repeat(32)}_${'b'.repeat(16)}`)).toBeNull()
  })

  it('returns null for unknown type', () => {
    expect(parseApiKey(`voucha_unknown_${'a'.repeat(32)}_${'b'.repeat(16)}`)).toBeNull()
    expect(parseApiKey(`voucha_admin_${'a'.repeat(32)}_${'b'.repeat(16)}`)).toBeNull()
  })

  it('returns null for wrong random length', () => {
    // too short
    expect(parseApiKey(`voucha_rss_${'a'.repeat(16)}_${'b'.repeat(16)}`)).toBeNull()
    // too long
    expect(parseApiKey(`voucha_rss_${'a'.repeat(64)}_${'b'.repeat(16)}`)).toBeNull()
  })

  it('returns null for random with invalid chars (non-hex)', () => {
    // 'g' is not a valid hex char
    expect(parseApiKey(`voucha_rss_${'g'.repeat(32)}_${'b'.repeat(16)}`)).toBeNull()
    // uppercase is not valid (must be lowercase hex)
    expect(parseApiKey(`voucha_rss_${'A'.repeat(32)}_${'b'.repeat(16)}`)).toBeNull()
  })

  it('returns null for wrong checksum length', () => {
    // too short
    expect(parseApiKey(`voucha_rss_${'a'.repeat(32)}_${'b'.repeat(4)}`)).toBeNull()
    // too long
    expect(parseApiKey(`voucha_rss_${'a'.repeat(32)}_${'b'.repeat(32)}`)).toBeNull()
  })

  it('returns null for missing segments', () => {
    expect(parseApiKey('voucha_rss')).toBeNull()
    expect(parseApiKey('voucha_')).toBeNull()
    expect(parseApiKey('')).toBeNull()
    expect(parseApiKey(`voucha_rss_${'a'.repeat(32)}`)).toBeNull()
  })

  it('returns null for checksum with invalid chars', () => {
    expect(parseApiKey(`voucha_rss_${'a'.repeat(32)}_${'G'.repeat(16)}`)).toBeNull()
  })
})
