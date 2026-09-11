import { it, expect, describe } from 'vitest'
import { getPublicUsersByAnyBatch } from './get-public-batch.mts'
import {
  createTestUser,
  setUserVerificationFields,
  insertTestVerifiedIdentity,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import type { PrivateUser } from './types.mts'

describe('get-public-batch', () => {
  it('getPublicUsersByAnyBatch returns empty array for empty input', async () => {
    const results = await getPublicUsersByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getPublicUsersByAnyBatch fetches multiple users by IDs in correct order', async () => {
    const user1 = (await createTestUser({ administrator: false })) as PrivateUser
    const user2 = (await createTestUser({ administrator: false })) as PrivateUser
    const user3 = (await createTestUser({ administrator: false })) as PrivateUser
    // Fetch in specific order
    const results = await getPublicUsersByAnyBatch([user2.id, user1.id, user3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(user2.id)
    expect(results[1]?.id).toBe(user1.id)
    expect(results[2]?.id).toBe(user3.id)
  })

  it('getPublicUsersByAnyBatch fetches multiple users by usernames in correct order', async () => {
    const username1 = `testuser1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const username2 = `testuser2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const username3 = `testuser3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    await createTestUser({ username: username1 })
    await createTestUser({ username: username2 })
    await createTestUser({ username: username3 })
    // Fetch by usernames in specific order
    const results = await getPublicUsersByAnyBatch([username2, username1, username3])

    expect(results).toHaveLength(3)
    expect(results[0]?.username).toBe(username2)
    expect(results[1]?.username).toBe(username1)
    expect(results[2]?.username).toBe(username3)
  })

  it('getPublicUsersByAnyBatch handles mixed IDs and usernames', async () => {
    const username = `testusermixed-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const user1 = (await createTestUser({})) as PrivateUser
    await createTestUser({ username })
    // Mix IDs and usernames
    const results = await getPublicUsersByAnyBatch([user1.id, username])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe(user1.id)
    expect(results[1]?.username).toBe(username)
  })

  it('getPublicUsersByAnyBatch returns null for non-existent users while preserving order', async () => {
    const user = (await createTestUser({})) as PrivateUser
    const results = await getPublicUsersByAnyBatch([
      '00000000-0000-0000-0000-000000000099',
      user.id,
      'nonexistentuser',
    ])

    expect(results).toHaveLength(3)
    expect(results[0]).toBeNull()
    expect(results[1]?.id).toBe(user.id)
    expect(results[2]).toBeNull()
  })

  it('getPublicUsersByAnyBatch throws for invalid identifiers', async () => {
    await expect(getPublicUsersByAnyBatch(['invalid!@#'])).rejects.toThrow(
      'Invalid user identifier',
    )
  })

  it('getPublicUsersByAnyBatch handles case-insensitive usernames', async () => {
    const username = `TestUserCase-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    await createTestUser({ username: username.toLowerCase() })
    // Query with different case
    const results = await getPublicUsersByAnyBatch([username.toUpperCase()])

    expect(results).toHaveLength(1)
    expect(results[0]?.username).toBe(username.toLowerCase())
  })
})

describe('identity verification fields in public batch', () => {
  it('returns null verification_status and null verified_display_name for unverified user', async () => {
    const user = await createTestUser()
    const results = await getPublicUsersByAnyBatch([user.id])
    // view_users_public only exposes verification_status for 'verified' users; others get NULL
    expect(results[0]?.verification_status).toBeNull()
    expect(results[0]?.verified_display_name).toBeNull()
  })

  it('returns verified status and verified_display_name=first_name when display=first_name and badge visible', async () => {
    const user = await createTestUser()
    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    await insertTestVerifiedIdentity(user.id, fingerprint, `vs_${v7()}`)
    await setUserVerificationFields(user.id, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: true,
      publicVerifiedNameDisplay: 'first_name',
      verifiedFirstName: 'Alice',
      verifiedLastNameInitial: 'S',
      verifiedFullName: 'Alice Smith',
    })

    const results = await getPublicUsersByAnyBatch([user.id])
    expect(results[0]?.verification_status).toBe('verified')
    expect(results[0]?.verified_display_name).toBe('Alice')
  })

  it('returns first_name_last_initial display name when display=first_name_last_initial', async () => {
    const user = await createTestUser()
    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    await insertTestVerifiedIdentity(user.id, fingerprint, `vs_${v7()}`)
    await setUserVerificationFields(user.id, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: true,
      publicVerifiedNameDisplay: 'first_name_last_initial',
      verifiedFirstName: 'Alice',
      verifiedLastNameInitial: 'S',
      verifiedFullName: 'Alice Smith',
    })

    const results = await getPublicUsersByAnyBatch([user.id])
    expect(results[0]?.verified_display_name).toBe('Alice S.')
  })

  it('returns full_name when display=full_name', async () => {
    const user = await createTestUser()
    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    await insertTestVerifiedIdentity(user.id, fingerprint, `vs_${v7()}`)
    await setUserVerificationFields(user.id, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: true,
      publicVerifiedNameDisplay: 'full_name',
      verifiedFirstName: 'Alice',
      verifiedLastNameInitial: 'S',
      verifiedFullName: 'Alice Smith',
    })

    const results = await getPublicUsersByAnyBatch([user.id])
    expect(results[0]?.verified_display_name).toBe('Alice Smith')
  })

  it('returns null verified_display_name when verified_badge_visible=false', async () => {
    const user = await createTestUser()
    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    await insertTestVerifiedIdentity(user.id, fingerprint, `vs_${v7()}`)
    await setUserVerificationFields(user.id, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: false,
      publicVerifiedNameDisplay: 'full_name',
      verifiedFirstName: 'Alice',
      verifiedFullName: 'Alice Smith',
    })

    const results = await getPublicUsersByAnyBatch([user.id])
    expect(results[0]?.verified_display_name).toBeNull()
  })

  it('returns null verified_display_name when display=hidden', async () => {
    const user = await createTestUser()
    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    await insertTestVerifiedIdentity(user.id, fingerprint, `vs_${v7()}`)
    await setUserVerificationFields(user.id, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: true,
      publicVerifiedNameDisplay: 'hidden',
      verifiedFirstName: 'Alice',
      verifiedFullName: 'Alice Smith',
    })

    const results = await getPublicUsersByAnyBatch([user.id])
    expect(results[0]?.verified_display_name).toBeNull()
  })
})
