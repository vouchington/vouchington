import { describe, expect, it, vi } from 'vitest'
import type { OAuthProvider } from './_oauth-config-support.mts'
import { getFriendsTableConfig } from './friends-config.mts'

describe('friend fixture table configuration', () => {
  it.each(['facebook', 'x', 'github'] as const)('preserves the %s SQL metadata', provider => {
    expect(getFriendsTableConfig(provider)).toEqual({
      table: `${provider}_friends`,
      userIdColumn: `${provider}_account_id`,
      friendIdColumn: `${provider}_friend_id`,
    })
    const config = getFriendsTableConfig(provider)
    expect(Reflect.set(config, 'table', 'untrusted_table')).toBe(false)
    expect(getFriendsTableConfig(provider).table).toBe(`${provider}_friends`)
  })

  it.each([
    'apple',
    'google',
    'linkedin',
    'microsoft',
    'constructor',
    'toString',
    '__proto__',
    'unknown',
    '',
  ])('rejects unsupported or inherited key %s', key => {
    // Runtime callers can bypass the TypeScript provider union.
    expect(() => getFriendsTableConfig(key as OAuthProvider)).toThrow(
      'No friends table config for provider:',
    )
  })

  it('rejects non-string keys without coercing them into a friend provider', () => {
    const coerce = vi.fn<() => string>(() => 'github')
    const objectKey = { [Symbol.toPrimitive]: coerce }
    for (const key of [undefined, null, true, 1, Symbol('github'), ['github'], objectKey]) {
      expect(() => getFriendsTableConfig(key as unknown as OAuthProvider)).toThrow(
        'Invalid friends provider',
      )
    }
    expect(coerce).not.toHaveBeenCalled()
  })
})
