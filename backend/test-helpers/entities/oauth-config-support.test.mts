import { describe, expect, it, vi } from 'vitest'
import { getOAuthTableConfig, type OAuthProvider } from './_oauth-config-support.mts'

describe('OAuth fixture table configuration', () => {
  it.each([
    ['facebook', true, false, 'id'],
    ['apple', false, false, 'id'],
    ['google', false, false, 'id'],
    ['x', true, true, 'id'],
    ['linkedin', true, true, undefined],
    ['microsoft', true, true, 'id'],
    ['github', true, true, 'id'],
  ] as const)('preserves the %s SQL metadata', (provider, hasTokens, hasRefresh, accountId) => {
    expect(getOAuthTableConfig(provider)).toEqual({
      table: `${provider}_accounts`,
      userIdColumn: 'user_id',
      providerUserIdColumn: `${provider}_user_id`,
      emailColumn: `${provider}_user_email_address`,
      dataColumn: `${provider}_user_data`,
      hasTokenColumns: hasTokens,
      hasRefreshToken: hasRefresh,
      ...(accountId ? { accountIdColumn: accountId } : {}),
    })
    const config = getOAuthTableConfig(provider)
    expect(Reflect.set(config, 'table', 'untrusted_table')).toBe(false)
    expect(getOAuthTableConfig(provider).table).toBe(`${provider}_accounts`)
  })

  it.each(['constructor', 'toString', '__proto__', 'unknown', ''])('rejects key %s', key => {
    // Runtime callers can bypass the TypeScript provider union.
    expect(() => getOAuthTableConfig(key as OAuthProvider)).toThrow('Invalid OAuth provider')
  })

  it('rejects non-string keys without coercing them into an owned provider', () => {
    const coerce = vi.fn<() => string>(() => 'github')
    const objectKey = { [Symbol.toPrimitive]: coerce }
    for (const key of [undefined, null, true, 1, Symbol('github'), ['github'], objectKey]) {
      expect(() => getOAuthTableConfig(key as unknown as OAuthProvider)).toThrow(
        'Invalid OAuth provider',
      )
    }
    expect(coerce).not.toHaveBeenCalled()
  })
})
