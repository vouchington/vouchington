import { describe, expect, it } from 'vitest'
import { toClientAuthUser, toProfileMenuUser } from './client-auth-user'
import type { User } from '@/types/user'

describe('toClientAuthUser', () => {
  it('projects a private user to the exact client auth boundary', () => {
    const privateUser: User = {
      id: 'user-1',
      roles: ['administrator'],
      username: 'private-name',
      email_address: 'tests+client-auth-projection-b72d@voucha.ai',
      suspended_reason: 'private reason',
    }

    expect(toClientAuthUser(privateUser)).toStrictEqual({
      id: 'user-1',
      roles: ['administrator'],
      isOfficialAccount: true,
    })
    expect(Object.keys(toClientAuthUser(privateUser)).toSorted()).toStrictEqual([
      'id',
      'isOfficialAccount',
      'roles',
    ])
  })

  it.each([
    { source: { is_agent: true }, label: 'agent flag' },
    { source: { username: 'system' }, label: 'reserved system username' },
  ])('derives official-account status from the $label', ({ source }) => {
    expect(
      toClientAuthUser({
        id: 'user-1',
        roles: ['user'],
        ...source,
      }),
    ).toStrictEqual({
      id: 'user-1',
      roles: ['user'],
      isOfficialAccount: true,
    })
  })
})

describe('toProfileMenuUser', () => {
  it('uses the email consistently when the username contains only whitespace', () => {
    expect(
      toProfileMenuUser({
        id: 'user-1',
        roles: ['user'],
        username: '   ',
        email_address: 'tests+profile-whitespace-d94f@voucha.ai',
      }),
    ).toStrictEqual({
      avatarLabel: 'tests+profile-whitespace-d94f',
      displayLabel: 'tests+profile-whitespace-d94f@voucha.ai',
      href: '/user/user-1',
      profileImageId: null,
    })
  })

  it('trims a padded username consistently for display and navigation', () => {
    expect(
      toProfileMenuUser({
        id: 'user-1',
        roles: ['user'],
        username: '  padded-user  ',
        email_address: 'tests+profile-padded-e05a@voucha.ai',
      }),
    ).toStrictEqual({
      avatarLabel: 'padded-user',
      displayLabel: 'padded-user',
      href: '/user/padded-user',
      profileImageId: null,
    })
  })
})
