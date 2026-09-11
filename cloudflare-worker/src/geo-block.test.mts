import { describe, expect, it } from 'vitest'
import { isGeoBlocked, parseBlockedCountries } from './geo-block.mts'

describe('parseBlockedCountries', () => {
  it('returns null for undefined', () => {
    expect(parseBlockedCountries(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseBlockedCountries('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseBlockedCountries('   ')).toBeNull()
  })

  it('parses a single country code', () => {
    const result = parseBlockedCountries('CN')
    expect(result).not.toBeNull()
    expect(result?.has('CN')).toBe(true)
  })

  it('parses multiple comma-separated codes', () => {
    const result = parseBlockedCountries('CN,IR,RU')
    expect(result).not.toBeNull()
    expect(result?.has('CN')).toBe(true)
    expect(result?.has('IR')).toBe(true)
    expect(result?.has('RU')).toBe(true)
    expect(result?.size).toBe(3)
  })

  it('normalizes codes to uppercase', () => {
    const result = parseBlockedCountries('cn,ir,ru')
    expect(result?.has('CN')).toBe(true)
    expect(result?.has('IR')).toBe(true)
    expect(result?.has('RU')).toBe(true)
  })

  it('trims whitespace around codes', () => {
    const result = parseBlockedCountries(' CN , IR , RU ')
    expect(result?.has('CN')).toBe(true)
    expect(result?.has('IR')).toBe(true)
    expect(result?.has('RU')).toBe(true)
  })

  it('ignores empty segments from trailing commas', () => {
    const result = parseBlockedCountries('CN,IR,')
    expect(result?.size).toBe(2)
    expect(result?.has('CN')).toBe(true)
    expect(result?.has('IR')).toBe(true)
  })

  it('returns null when all comma-separated segments are empty', () => {
    expect(parseBlockedCountries(' , , ')).toBeNull()
  })

  it('parses the default country list', () => {
    const defaultList = 'CN,HK,IR,RU,KP,BY,SY,VE,CU,MM,SD'
    const result = parseBlockedCountries(defaultList)
    expect(result).not.toBeNull()
    expect(result?.size).toBe(11)
    for (const code of defaultList.split(',')) {
      expect(result?.has(code)).toBe(true)
    }
  })
})

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

describe('isGeoBlocked', () => {
  const blockedCountries = new Set(['CN', 'IR', 'RU'])

  it('returns false when blockedCountries is null (blocking disabled)', () => {
    expect(isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'CN' }), null)).toBe(false)
  })

  it('returns false when cf-ray is absent (local dev / CI)', () => {
    expect(isGeoBlocked(makeHeaders({}), blockedCountries)).toBe(false)
    expect(isGeoBlocked(makeHeaders({ 'cf-ipcountry': 'CN' }), blockedCountries)).toBe(false)
  })

  it('returns true when cf-ray is present but cf-ipcountry is absent (fail-closed)', () => {
    expect(isGeoBlocked(makeHeaders({ 'cf-ray': 'abc123' }), blockedCountries)).toBe(true)
  })

  it('returns true for a blocked country code', () => {
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'CN' }), blockedCountries),
    ).toBe(true)
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'IR' }), blockedCountries),
    ).toBe(true)
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'RU' }), blockedCountries),
    ).toBe(true)
  })

  it('returns false for an unblocked country code', () => {
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'US' }), blockedCountries),
    ).toBe(false)
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'GB' }), blockedCountries),
    ).toBe(false)
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'AU' }), blockedCountries),
    ).toBe(false)
  })

  it('normalizes the country header to uppercase', () => {
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'cn' }), blockedCountries),
    ).toBe(true)
    expect(
      isGeoBlocked(makeHeaders({ 'cf-ray': 'abc', 'cf-ipcountry': 'Cn' }), blockedCountries),
    ).toBe(true)
  })

  it('returns false when both blockedCountries is null and cf-ray is absent', () => {
    expect(isGeoBlocked(makeHeaders({}), null)).toBe(false)
  })
})
