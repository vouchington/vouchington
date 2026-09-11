import { it, expect, describe } from 'vitest'
import { normalizeDomain } from '../index.mts'

describe('index.generated (normalizeDomain)', () => {
  it('normalizeDomain skips comment lines', () => {
    expect(normalizeDomain('# Title: Scam Block List')).toBeNull()
    expect(normalizeDomain('# Description: Scam domains')).toBeNull()
    expect(normalizeDomain('# Homepage: https://github.com/blocklistproject/Lists')).toBeNull()
    expect(normalizeDomain('#')).toBeNull()
    expect(normalizeDomain('  # indented comment')).toBeNull()
  })

  it('normalizeDomain parses valid domains after header', () => {
    expect(normalizeDomain('10tradeoption.com')).toBe('10tradeoption.com')
    expect(normalizeDomain('example.com')).toBe('example.com')
    expect(normalizeDomain('sub.domain.org')).toBe('sub.domain.org')
    expect(normalizeDomain('  UPPERCASE.COM  ')).toBe('uppercase.com')
  })

  it('normalizeDomain skips empty and whitespace-only lines', () => {
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain('   ')).toBeNull()
    expect(normalizeDomain('\t')).toBeNull()
  })

  it('normalizeDomain rejects invalid formats', () => {
    expect(normalizeDomain('not a domain')).toBeNull()
    expect(normalizeDomain('https://example.com')).toBeNull()
    expect(normalizeDomain('example.com/path')).toBeNull()
    expect(normalizeDomain('.leading-dot.com')).toBeNull()
    expect(normalizeDomain('-leading-dash.com')).toBeNull()
  })

  it('normalizeDomain handles subdomains and hyphens', () => {
    expect(normalizeDomain('my-site.example.com')).toBe('my-site.example.com')
    expect(normalizeDomain('a.b.c.d.example.co.uk')).toBe('a.b.c.d.example.co.uk')
    expect(normalizeDomain('x-y-z.org')).toBe('x-y-z.org')
  })
})
