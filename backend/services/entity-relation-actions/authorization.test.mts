import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { canLoadBookmarkCommunity, currentUserCanBookmarkTarget } from './authorization.mts'

describe('bookmark target authorization', () => {
  it('treats community not-found as invisible and propagates other errors', async () => {
    await expect(
      canLoadBookmarkCommunity(() => Promise.reject(Object.assign(new Error(), { status: 404 }))),
    ).resolves.toBe(false)

    const databaseError = new Error('database unavailable')
    await expect(canLoadBookmarkCommunity(() => Promise.reject(databaseError))).rejects.toBe(
      databaseError,
    )
  })

  it('fails closed for relation entity types without bookmark visibility support', async () => {
    const user = await createTestUser()
    await expect(
      currentUserCanBookmarkTarget(user, 'topic_alias', crypto.randomUUID()),
    ).resolves.toBe(false)
  })
})
