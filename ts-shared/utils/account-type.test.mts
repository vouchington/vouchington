import { describe, expect, it } from 'vitest'
import { isPlatformAccount } from './account-type.mts'

describe('platform trust-signal restriction', () => {
  it.each(['official', 'system', 'ai_agent'] as const)('restricts %s', account_type => {
    expect(isPlatformAccount({ account_type })).toBe(true)
  })
  it('permits member accounts without inferring identity from usernames or roles', () => {
    expect(isPlatformAccount({ account_type: null })).toBe(false)
    expect(isPlatformAccount(null)).toBe(false)
    expect(isPlatformAccount(undefined)).toBe(false)
  })
})
