import { describe, expect, it } from 'vitest'
import { normalizeDeviceName, normalizeIpAddress, normalizeText } from './session-device-name.mts'

describe('session device name normalization', () => {
  it('uses an explicit trimmed device name before user-agent detection', () => {
    expect(normalizeDeviceName('  Work laptop  ', 'Mozilla/5.0')).toBe('Work laptop')
    expect(normalizeDeviceName(`${'a'.repeat(254)} b`)).toBe('a'.repeat(254))
  })

  it('derives common browser and device families from user agents', () => {
    expect(
      normalizeDeviceName(
        null,
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 Chrome/126.0',
      ),
    ).toBe('Chrome on Mac')
    expect(normalizeDeviceName(null, 'Mozilla/5.0 (iPhone) AppleWebKit/605.1 Safari/605.1')).toBe(
      'Safari on iPhone',
    )
    expect(normalizeDeviceName(null, 'Mozilla/5.0 (iPhone) AppleWebKit/605.1 CriOS/126.0')).toBe(
      'Chrome on iPhone',
    )
    expect(normalizeDeviceName(null, 'Mozilla/5.0 (iPad) Firefox/126.0')).toBe('Firefox on iPad')
    expect(normalizeDeviceName(null, 'Mozilla/5.0 (Android) Edg/126.0')).toBe('Edge on Android')
    expect(normalizeDeviceName(null, 'Mozilla/5.0 (Windows NT 10.0) OPR/90.0')).toBe(
      'Opera on Windows',
    )
    expect(normalizeDeviceName(null, 'Mozilla/5.0 (X11; Linux x86_64) Unknown/1.0')).toBe('Linux')
  })

  it('falls back for unknown or empty user agents', () => {
    expect(normalizeDeviceName(null, null)).toBe('Unknown device')
    expect(normalizeDeviceName(null, 'MysteryBrowser/1.0')).toBe('Unknown device')
    expect(normalizeDeviceName(null, 'MysteryDevice Chrome/126.0 Chromium')).toBe('Unknown device')
    expect(normalizeDeviceName(null, 'MysteryDevice Firefox/126.0')).toBe('Firefox')
  })

  it('normalizes free-form text and IP addresses', () => {
    expect(normalizeText('  abcdef  ', 3)).toBe('abc')
    expect(normalizeText(`${'a'.repeat(4)} b`, 5)).toBe('aaaa')
    expect(normalizeText(null)).toBe('')
    expect(normalizeIpAddress('  203.0.113.10  ')).toBe('203.0.113.10')
    expect(normalizeIpAddress('   ')).toBeNull()
  })
})
