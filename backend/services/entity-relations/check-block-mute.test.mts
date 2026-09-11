import { it, expect, beforeAll, describe } from 'vitest'
import { createTestUserDirect, blockUser, muteUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { isUserBlockedOrMuted } from './check-block-mute.mts'

describe('check-block-mute', () => {
  let user1: PrivateUser
  let user2: PrivateUser
  let user3: PrivateUser
  let user4: PrivateUser

  beforeAll(async () => {
    const [u1, u2, u3, u4] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    user1 = u1!
    user2 = u2!
    user3 = u3!
    user4 = u4!
  })

  it('returns false when no block or mute relation exists', async () => {
    const result = await isUserBlockedOrMuted(user1!.id, user2!.id)
    expect(result).toBe(false)
  })

  it('returns true when user1 has blocked user2', async () => {
    await blockUser(user1!, user2!)
    const result = await isUserBlockedOrMuted(user1!.id, user2!.id)
    expect(result).toBe(true)
  })

  it('returns true when user2 has blocked user1 (reverse direction)', async () => {
    await blockUser(user2!, user1!)
    const result = await isUserBlockedOrMuted(user1!.id, user2!.id)
    expect(result).toBe(true)
  })

  it('returns true when user3 has muted user4', async () => {
    await muteUser(user3!, user4!)
    const result = await isUserBlockedOrMuted(user3!.id, user4!.id)
    expect(result).toBe(true)
  })

  it('returns true when user4 has muted user3 (reverse direction)', async () => {
    await muteUser(user4!, user3!)
    const result = await isUserBlockedOrMuted(user3!.id, user4!.id)
    expect(result).toBe(true)
  })
})
