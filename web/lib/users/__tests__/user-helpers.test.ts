import { describe, expect, it } from 'vitest'
import { getDisplayName, isProfileOwner } from '../user-helpers'

describe('getDisplayName', () => {
  it('prefers display_account.name', () => {
    expect(
      getDisplayName({ display_account: { id: 'd1', name: 'Alice Smith' }, username: 'alice' }),
    ).toBe('Alice Smith')
  })

  it('falls back to username when no display_account', () => {
    expect(getDisplayName({ username: 'alice' })).toBe('alice')
  })

  it('falls back to "User" when both are absent', () => {
    expect(getDisplayName({})).toBe('User')
  })
})

describe('isProfileOwner', () => {
  it('returns false when currentUser is null', () => {
    expect(isProfileOwner(null, { id: 'u1', username: 'alice' })).toBe(false)
  })

  it('returns true when IDs match', () => {
    expect(isProfileOwner({ id: 'u1' }, { id: 'u1' })).toBe(true)
  })

  it('returns true when usernames match (case-insensitive)', () => {
    expect(isProfileOwner({ id: 'u2', username: 'Alice' }, { id: 'u1', username: 'alice' })).toBe(
      true,
    )
  })

  it('returns false when IDs differ and no matching username', () => {
    expect(isProfileOwner({ id: 'u2', username: 'bob' }, { id: 'u1', username: 'alice' })).toBe(
      false,
    )
  })

  it('returns false when currentUser has no username and IDs differ', () => {
    expect(isProfileOwner({ id: 'u2' }, { id: 'u1', username: 'alice' })).toBe(false)
  })
})
