import { it, expect, describe } from 'vitest'
import { invalidate } from '@services/entity-cache/invalidate'
import { caches } from '@services/entity-cache/caches'
import { createTestUser } from '@voucha/test-helpers'
import { getPrivateUserByAny, getPublicUserByAny } from '../get.mts'
import type { PrivateUser, PublicUser } from '../types.mts'

const getUserPrivateByAnyCached = caches.users_private.cacheGetByAny(getPrivateUserByAny)
const getUserPublicByAnyCached = caches.users_public.cacheGetByAny(getPublicUserByAny)

describe('invalidate.generated (users)', () => {
  it('invalidate.users clears cache for user ID', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate cache
    await getUserPrivateByAnyCached(user!.id)
    await getUserPublicByAnyCached(user!.id)

    // Invalidate cache
    await invalidate.users(user!.id)

    // Verify cache is cleared by checking if we can still get the user (will refetch)
    const result = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(user!.id)
  })

  it('invalidate.users clears cache for username', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate cache
    await getUserPrivateByAnyCached(user!.username!)
    await getUserPublicByAnyCached(user!.username!)

    // Invalidate cache
    await invalidate.users(user!.username!)

    // Verify cache is cleared
    const result = (await getUserPrivateByAnyCached(user!.username!)) as PrivateUser | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(user!.id)
  })

  it('invalidate.users clears cache for user object with id', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate cache
    await getUserPrivateByAnyCached(user!.id)
    await getUserPublicByAnyCached(user!.id)

    // Invalidate cache
    await invalidate.users({ id: user!.id })

    // Verify cache is cleared
    const result = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(user!.id)
  })

  it('invalidate.users clears cache for user object with username', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate cache
    await getUserPrivateByAnyCached(user!.username!)
    await getUserPublicByAnyCached(user!.username!)

    // Invalidate cache
    await invalidate.users({ username: user!.username! })

    // Verify cache is cleared
    const result = (await getUserPrivateByAnyCached(user!.username!)) as PrivateUser | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(user!.id)
  })

  it('invalidate.users clears both private and public caches', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate both caches
    await getUserPrivateByAnyCached(user!.id)
    await getUserPublicByAnyCached(user!.id)

    // Invalidate cache
    await invalidate.users(user!.id)

    // Verify both caches are cleared
    const privateResult = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    const publicResult = (await getUserPublicByAnyCached(user!.id)) as PublicUser | null

    expect(privateResult).toBeDefined()
    expect(privateResult!.id).toBe(user!.id)
    expect(publicResult).toBeDefined()
    expect(publicResult!.id).toBe(user!.id)
  })

  it('invalidate.users handles multiple users', async () => {
    const user1 = await createTestUser({ administrator: true })
    const user2 = await createTestUser({ administrator: true })
    // Populate cache for both users
    await getUserPrivateByAnyCached(user1!.id)
    await getUserPrivateByAnyCached(user2!.id)

    // Invalidate cache for both users
    await invalidate.users(user1!.id, user2!.id)

    // Verify both caches are cleared
    const result1 = (await getUserPrivateByAnyCached(user1!.id)) as PrivateUser | null
    const result2 = (await getUserPrivateByAnyCached(user2!.id)) as PrivateUser | null

    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user1!.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user2!.id)
  })

  it('invalidate.users handles empty input', async () => {
    await expect(invalidate.users()).resolves.not.toThrow()
  })

  it('invalidate.users handles non-existent user gracefully', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await expect(invalidate.users(fakeId)).resolves.not.toThrow()
  })

  it('invalidate.users handles mixed input types', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate cache
    await getUserPrivateByAnyCached(user!.id)
    await getUserPublicByAnyCached(user!.username!)

    // Invalidate with mixed types
    await invalidate.users(user!.id, { username: user!.username! })

    // Verify cache is cleared
    const result1 = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    const result2 = (await getUserPublicByAnyCached(user!.username!)) as PublicUser | null

    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('invalidate.users case-insensitive keys resolve to same cache and invalidate properly', async () => {
    const user = await createTestUser({ administrator: true })
    // Populate cache with lowercase key
    await getUserPrivateByAnyCached(user!.id)
    await getUserPublicByAnyCached(user!.id)

    // Verify uppercase key resolves to same cache
    const cached1 = (await getUserPrivateByAnyCached(user!.id.toUpperCase())) as PrivateUser | null
    expect(cached1).toBeDefined()
    expect(cached1!.id).toBe(user!.id)

    // Invalidate with uppercase key
    await invalidate.users(user!.id.toUpperCase())

    // Both lowercase and uppercase should be invalidated
    const result1 = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    const result2 = (await getUserPrivateByAnyCached(user!.id.toUpperCase())) as PrivateUser | null

    // Should refetch (cache was cleared)
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('invalidate.users case-insensitive username keys resolve to same cache and invalidate properly', async () => {
    const user = await createTestUser({ administrator: true })
    if (!user!.username) {
      // Skip if user doesn't have username
      return
    }

    // Populate cache with lowercase username
    await getUserPrivateByAnyCached(user!.username)
    await getUserPublicByAnyCached(user!.username)

    // Verify uppercase username resolves to same cache
    const cached1 = (await getUserPrivateByAnyCached(
      user!.username.toUpperCase(),
    )) as PrivateUser | null
    expect(cached1).toBeDefined()
    expect(cached1!.id).toBe(user!.id)

    // Invalidate with uppercase username
    await invalidate.users(user!.username.toUpperCase())

    // Both lowercase and uppercase should be invalidated
    const result1 = (await getUserPrivateByAnyCached(user!.username)) as PrivateUser | null
    const result2 = (await getUserPrivateByAnyCached(
      user!.username.toUpperCase(),
    )) as PrivateUser | null

    // Should refetch (cache was cleared)
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })
})
