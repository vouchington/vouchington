import { describe, it, expect } from 'vitest'
import { getAgentDisplayName } from './display-name'

describe('getAgentDisplayName', () => {
  it('returns display_account.name when available', () => {
    const user = {
      id: 'user-1',
      username: 'johndoe',
      display_account: { name: 'John Doe' },
    }
    expect(getAgentDisplayName(user, 'fallback')).toBe('John Doe')
  })

  it('returns username when display_account is absent', () => {
    const user = { id: 'user-1', username: 'johndoe' }
    expect(getAgentDisplayName(user, 'fallback')).toBe('johndoe')
  })

  it('returns fallback when user is null', () => {
    expect(getAgentDisplayName(null, 'abc12345')).toBe('abc12345')
  })

  it('returns fallback when user is undefined', () => {
    expect(getAgentDisplayName(undefined, 'abc12345')).toBe('abc12345')
  })

  it('returns fallback when user has no username or display_account', () => {
    const user = { id: 'user-1' }
    expect(getAgentDisplayName(user, 'abc12345')).toBe('abc12345')
  })

  it('prefers display_account.name over username', () => {
    const user = {
      id: 'user-1',
      username: 'johndoe',
      display_account: { name: 'Display Name' },
    }
    expect(getAgentDisplayName(user, 'fallback')).toBe('Display Name')
  })
})
