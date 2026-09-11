import { describe, expect, it } from 'vitest'
import { isOfficialAccount, OFFICIAL_ROLE_SLUGS, SYSTEM_USERNAMES } from './official-account.mts'

describe('isOfficialAccount', () => {
  it('returns false for null input', () => {
    expect(isOfficialAccount(null)).toBe(false)
  })

  it('returns false for undefined input', () => {
    expect(isOfficialAccount(undefined)).toBe(false)
  })

  it('returns false for regular user with no roles or is_agent', () => {
    expect(isOfficialAccount({ roles: [], username: 'regular-user' })).toBe(false)
    expect(isOfficialAccount({ roles: ['user'] })).toBe(false)
  })

  it('returns true for official role slugs', () => {
    expect(isOfficialAccount({ roles: ['administrator'] })).toBe(true)
    expect(isOfficialAccount({ roles: ['investor'] })).toBe(true)
    expect(isOfficialAccount({ roles: ['customer_support'] })).toBe(true)
  })

  it('returns true for is_agent users', () => {
    expect(isOfficialAccount({ roles: [], is_agent: true })).toBe(true)
    expect(isOfficialAccount({ is_agent: true })).toBe(true)
  })

  it('returns false when is_agent is false', () => {
    expect(isOfficialAccount({ roles: [], is_agent: false })).toBe(false)
  })

  it('returns true for reserved system usernames', () => {
    expect(isOfficialAccount({ roles: [], username: 'system' })).toBe(true)
    expect(isOfficialAccount({ roles: [], username: 'autotagger' })).toBe(true)
    expect(isOfficialAccount({ roles: [], username: 'customer-support' })).toBe(true)
    expect(isOfficialAccount({ roles: [], username: 'rss-feed-auto-updater' })).toBe(true)
    expect(isOfficialAccount({ roles: [], username: 'story-teller' })).toBe(true)
    expect(isOfficialAccount({ roles: [], username: 'wikipedia-recommender' })).toBe(true)
  })

  it('returns true for the voucha username', () => {
    expect(isOfficialAccount({ roles: [], username: 'voucha' })).toBe(true)
  })

  it('returns false when username is not a system username', () => {
    expect(isOfficialAccount({ roles: [], username: 'random-user' })).toBe(false)
    expect(isOfficialAccount({ roles: [] })).toBe(false)
  })

  it('OFFICIAL_ROLE_SLUGS contains expected roles', () => {
    expect(OFFICIAL_ROLE_SLUGS.has('administrator')).toBe(true)
    expect(OFFICIAL_ROLE_SLUGS.has('investor')).toBe(true)
    expect(OFFICIAL_ROLE_SLUGS.has('customer_support')).toBe(true)
    expect(OFFICIAL_ROLE_SLUGS.has('user')).toBe(false)
  })

  it('SYSTEM_USERNAMES contains expected usernames including voucha', () => {
    expect(SYSTEM_USERNAMES.has('voucha')).toBe(true)
    expect(SYSTEM_USERNAMES.has('system')).toBe(true)
    expect(SYSTEM_USERNAMES.has('unknown-bot')).toBe(false)
  })
})
