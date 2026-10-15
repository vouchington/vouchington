import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { upsertTestHostnameId } from '@voucha/test-helpers/entities/email-domain-hostname'
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

  it('keeps email-only hostnames private from bookmarks while administrators can inspect them', async () => {
    const viewer = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const privateId = await upsertTestHostnameId(
      `private-bookmark-${crypto.randomUUID()}.example.test`,
      {},
      'private_email',
    )
    const publicId = await upsertTestHostnameId(
      `public-bookmark-${crypto.randomUUID()}.example.test`,
    )

    await expect(currentUserCanBookmarkTarget(viewer, 'url_hostname', privateId)).resolves.toBe(
      false,
    )
    await expect(
      currentUserCanBookmarkTarget(administrator, 'url_hostname', privateId),
    ).resolves.toBe(true)
    await expect(currentUserCanBookmarkTarget(viewer, 'url_hostname', publicId)).resolves.toBe(true)
  })
})
