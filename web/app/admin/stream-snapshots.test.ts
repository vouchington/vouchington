import { describe, expect, it } from 'vitest'
import { isPostgreSQLStreamSnapshot, isValkeySnapshot } from './stream-snapshots'

describe('admin stream snapshot parsing', () => {
  it('accepts complete PostgreSQL and partial Valkey snapshots', () => {
    expect(isPostgreSQLStreamSnapshot({ applied: ['001'], pending: [], total: 1 })).toBe(true)
    expect(isPostgreSQLStreamSnapshot({ error: 'unavailable' })).toBe(true)
    expect(
      isValkeySnapshot({
        groups: [{ name: 'users', prefixes: ['users:'] }],
        errors: { groups: 'partial result' },
      }),
    ).toBe(true)
  })

  it('rejects malformed stream payloads before the UI consumes them', () => {
    expect(isPostgreSQLStreamSnapshot({ applied: ['001'], pending: [], total: '1' })).toBe(false)
    expect(isValkeySnapshot({ groups: [{ name: 'users', prefixes: [1] }] })).toBe(false)
    expect(isValkeySnapshot({ errors: {} })).toBe(false)
  })
})
