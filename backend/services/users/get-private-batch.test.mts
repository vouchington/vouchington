import { it, expect, describe } from 'vitest'
import { getPrivateUsersByAnyBatch } from './get-private-batch.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from './types.mts'

describe('get-private-batch', () => {
  it('getPrivateUsersByAnyBatch returns empty array for empty input', async () => {
    const results = await getPrivateUsersByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getPrivateUsersByAnyBatch fetches multiple users by IDs in correct order', async () => {
    const user1 = (await createTestUser({})) as PrivateUser
    const user2 = (await createTestUser({})) as PrivateUser
    const user3 = (await createTestUser({})) as PrivateUser
    // Fetch in specific order
    const results = await getPrivateUsersByAnyBatch([user2.id, user1.id, user3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(user2.id)
    expect(results[1]?.id).toBe(user1.id)
    expect(results[2]?.id).toBe(user3.id)
  })

  it('getPrivateUsersByAnyBatch fetches multiple users by usernames in correct order', async () => {
    const username1 = `testuser1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const username2 = `testuser2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const username3 = `testuser3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    await createTestUser({ username: username1 })
    await createTestUser({ username: username2 })
    await createTestUser({ username: username3 })
    // Fetch by usernames in specific order
    const results = await getPrivateUsersByAnyBatch([username2, username1, username3])

    expect(results).toHaveLength(3)
    expect(results[0]?.username).toBe(username2)
    expect(results[1]?.username).toBe(username1)
    expect(results[2]?.username).toBe(username3)
  })

  it('getPrivateUsersByAnyBatch handles mixed IDs and usernames', async () => {
    const username = `testusermixed-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const user1 = (await createTestUser({})) as PrivateUser
    await createTestUser({ username })
    // Mix IDs and usernames
    const results = await getPrivateUsersByAnyBatch([user1.id, username])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe(user1.id)
    expect(results[1]?.username).toBe(username)
  })

  it('getPrivateUsersByAnyBatch handles email and phone partitions in caller order', async () => {
    const userWithEmail = (await createTestUser({})) as PrivateUser
    const userWithPhone = (await createTestUser({ phone_number: true })) as PrivateUser

    const results = await getPrivateUsersByAnyBatch([
      userWithPhone.phone_number!,
      userWithEmail.email_address!.toUpperCase(),
      userWithPhone.id,
    ])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(userWithPhone.id)
    expect(results[1]?.id).toBe(userWithEmail.id)
    expect(results[2]?.id).toBe(userWithPhone.id)
  })

  it('getPrivateUsersByAnyBatch returns null for non-existent users while preserving order', async () => {
    const testUser = (await createTestUser({})) as PrivateUser
    const results = await getPrivateUsersByAnyBatch([
      '00000000-0000-0000-0000-000000000099',
      testUser.id,
      'nonexistentuser',
    ])

    expect(results).toHaveLength(3)
    expect(results[0]).toBeNull()
    expect(results[1]?.id).toBe(testUser.id)
    expect(results[2]).toBeNull()
  })

  it('getPrivateUsersByAnyBatch throws for invalid identifiers', async () => {
    await expect(getPrivateUsersByAnyBatch(['invalid!@#'])).rejects.toThrow(
      'Invalid user identifier',
    )
  })

  it('getPrivateUsersByAnyBatch handles case-insensitive usernames', async () => {
    const username = `TestUserCase-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    await createTestUser({ username: username.toLowerCase() })
    // Query with different case
    const results = await getPrivateUsersByAnyBatch([username.toUpperCase()])

    expect(results).toHaveLength(1)
    expect(results[0]?.username).toBe(username.toLowerCase())
  })
})
