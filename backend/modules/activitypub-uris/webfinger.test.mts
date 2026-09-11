import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWebfingerAcct, parseWebfingerAcct } from './webfinger.mts'

describe('WebFinger acct alias', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds an acct: alias from username and the site hostname', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(getWebfingerAcct('alice')).toBe('acct:alice@app.example.test')
  })

  it('round-trips through parseWebfingerAcct', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    const acct = getWebfingerAcct('alice')
    expect(parseWebfingerAcct(acct)).toEqual({ username: 'alice', hostname: 'app.example.test' })
  })

  it('returns undefined for non-acct resources', () => {
    expect(parseWebfingerAcct('https://example.test/users/alice')).toBeUndefined()
  })
})
