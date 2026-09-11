import { expect, it, describe } from 'vitest'
import {
  currentUserCanModifyRssFeedDiscoverability,
  currentUserCanModifyRssFeedEnablement,
} from './authorization.mts'
import { RSS_FEED_AUTO_UPDATER_USERNAME } from '@services/users/constants'
import type { PrivateUser } from '@services/users/types'

describe('authorization', () => {
  it('does not grant current-user RSS feed state permissions by username alone', () => {
    const claimedSystemUsername = {
      username: RSS_FEED_AUTO_UPDATER_USERNAME,
      roles: [],
    } as unknown as PrivateUser

    expect(currentUserCanModifyRssFeedDiscoverability(claimedSystemUsername)).toBe(false)
    expect(currentUserCanModifyRssFeedEnablement(claimedSystemUsername)).toBe(false)
  })

  it('allows administrators to modify RSS feed state as current users', () => {
    const admin = {
      username: 'admin',
      roles: ['administrator'],
    } as unknown as PrivateUser

    expect(currentUserCanModifyRssFeedDiscoverability(admin)).toBe(true)
    expect(currentUserCanModifyRssFeedEnablement(admin)).toBe(true)
  })
})
