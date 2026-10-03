import { describe, expect, it } from 'vitest'
import { toClientAuthUser, toProfileMenuUser } from './client-auth-user'
import type { User } from '@/types/user'

describe('toClientAuthUser', () => {
  it('projects a private user to the exact client auth boundary', () => {
    const privateUser: User = {
      id: 'user-1',
      roles: ['administrator'],
      account_type: 'official',
      username: 'private-name',
      email_address: 'tests+client-auth-projection-b72d@voucha.ai',
      suspended_reason: 'private reason',
    }

    expect(toClientAuthUser(privateUser)).toStrictEqual({
      id: 'user-1',
      roles: ['administrator'],
      account_type: 'official',
    })
    expect(Object.keys(toClientAuthUser(privateUser)).toSorted()).toStrictEqual([
      'account_type',
      'id',
      'roles',
    ])
  })

  it.each(['official', 'system', 'ai_agent', null] as const)(
    'preserves the canonical account type %s without deriving it from identity',
    account_type => {
      expect(
        toClientAuthUser({ id: 'user-1', roles: ['user'], username: 'system', account_type }),
      ).toStrictEqual({ id: 'user-1', roles: ['user'], account_type })
    },
  )
})

describe('toProfileMenuUser', () => {
  it('uses the email consistently when the username contains only whitespace', () => {
    expect(
      toProfileMenuUser({
        id: 'user-1',
        roles: ['user'],
        account_type: null,
        username: '   ',
        email_address: 'tests+profile-whitespace-d94f@voucha.ai',
      }),
    ).toStrictEqual({
      avatarLabel: 'tests+profile-whitespace-d94f',
      displayLabel: 'tests+profile-whitespace-d94f@voucha.ai',
      href: '/user/user-1',
      profileImageId: null,
      profileImagePlacement: null,
    })
  })

  it('trims a padded username consistently for display and navigation', () => {
    expect(
      toProfileMenuUser({
        id: 'user-1',
        roles: ['user'],
        account_type: null,
        username: '  padded-user  ',
        email_address: 'tests+profile-padded-e05a@voucha.ai',
      }),
    ).toStrictEqual({
      avatarLabel: 'padded-user',
      displayLabel: 'padded-user',
      href: '/user/padded-user',
      profileImageId: null,
      profileImagePlacement: null,
    })
  })
})
