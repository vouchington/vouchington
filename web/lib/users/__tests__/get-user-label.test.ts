import { describe, expect, it } from 'vitest'
import { getUserLabel } from '../get-user-label'

describe('getUserLabel', () => {
  it('uses the display name before the username', () => {
    expect(
      getUserLabel({ display_account: { name: 'Alice Smith' }, username: 'alice' }, 'Deleted user'),
    ).toBe('Alice Smith')
  })

  it('uses the username when the display name is missing', () => {
    expect(
      getUserLabel({ display_account: { name: null }, username: 'alice' }, 'Deleted user'),
    ).toBe('alice')
  })

  it('uses the supplied translation when no name remains', () => {
    const deletedUser = { id: '01900000-0000-7000-8000-000000000001', username: null }
    expect(getUserLabel(deletedUser, 'Usuario eliminado')).toBe('Usuario eliminado')
    expect(getUserLabel(null, 'Usuario eliminado')).toBe('Usuario eliminado')
  })
})
