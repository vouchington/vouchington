import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { rejectPostgresReadForTest } from '@voucha/test-helpers/injected-failures'
import { upsertTestHostnameId } from '@voucha/test-helpers/entities/email-domain-hostname'
import { currentUserCanBookmarkTarget } from './authorization.mts'

describe('bookmark target authorization', () => {
  it('shows a private community to its owner and hides it from strangers', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    await expect(currentUserCanBookmarkTarget(owner, 'community', community.id)).resolves.toBe(true)
    await expect(currentUserCanBookmarkTarget(stranger, 'community', community.id)).resolves.toBe(
      false,
    )
  })

  it('propagates community load failures other than not-found', async () => {
    const user = await createTestUser()
    const failure = new Error('database unavailable')
    const restoreRead = rejectPostgresReadForTest('getCommunityWithViewerById', failure)
    try {
      await expect(
        currentUserCanBookmarkTarget(user, 'community', crypto.randomUUID()),
      ).rejects.toBe(failure)
    } finally {
      restoreRead()
    }
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
