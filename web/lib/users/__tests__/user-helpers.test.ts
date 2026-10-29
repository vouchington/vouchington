import { describe, expect, it } from 'vitest'
import { getUserLabel, isProfileOwner } from '../user-helpers'

describe('getUserLabel', () => {
  it('prefers display_account.name', () => {
    expect(
      getUserLabel({ display_account: { name: 'Alice Smith' }, username: 'alice' }, 'Deleted user'),
    ).toBe('Alice Smith')
  })

  it.each([
    { username: 'alice' },
    { display_account: null, username: 'alice' },
    { display_account: { name: null }, username: 'alice' },
    { display_account: { name: '' }, username: 'alice' },
  ])('falls back to username when no display name remains: %j', user => {
    expect(getUserLabel(user, 'Deleted user')).toBe('alice')
  })

  it.each([
    {},
    { username: null },
    { display_account: { name: '' }, username: '' },
    null,
    undefined,
  ])('uses the caller-translated label when no name remains: %j', user => {
    expect(getUserLabel(user, 'Usuario eliminado')).toBe('Usuario eliminado')
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
