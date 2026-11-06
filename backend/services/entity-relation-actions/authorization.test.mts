import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { rejectPostgresReadForTest } from '@voucha/test-helpers/injected-failures'
import { upsertTestHostnameId } from '@voucha/test-helpers/entities/email-domain-hostname'
import { currentUserCanBookmarkTarget } from './authorization.mts'
import { prepareBookmarkActions, upsertPreparedBookmarkActions } from './bookmark.mts'

describe('bookmark target authorization', () => {
  it('shows a private community to its owner and hides it from strangers', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    await expect(
      currentUserCanBookmarkTarget(owner, 'community', community.id, 'follow'),
    ).resolves.toBe(true)
    await expect(
      currentUserCanBookmarkTarget(stranger, 'community', community.id, 'follow'),
    ).resolves.toBe(false)
  })

  it('propagates community load failures other than not-found', async () => {
    const user = await createTestUser()
    const failure = new Error('database unavailable')
    const restoreRead = rejectPostgresReadForTest('getCommunityWithViewerById', failure)
    try {
      await expect(
        currentUserCanBookmarkTarget(user, 'community', crypto.randomUUID(), 'follow'),
      ).rejects.toBe(failure)
    } finally {
      restoreRead()
    }
  })

  it('fails closed for relation entity types without bookmark visibility support', async () => {
    const user = await createTestUser()
    await expect(
      currentUserCanBookmarkTarget(user, 'topic_alias', crypto.randomUUID(), 'follow'),
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

    await expect(
      currentUserCanBookmarkTarget(viewer, 'url_hostname', privateId, 'follow'),
    ).resolves.toBe(false)
    await expect(
      currentUserCanBookmarkTarget(administrator, 'url_hostname', privateId, 'follow'),
    ).resolves.toBe(true)
    await expect(
      currentUserCanBookmarkTarget(viewer, 'url_hostname', publicId, 'follow'),
    ).resolves.toBe(true)
  })

  it('lets a viewer hide, and only hide, a deleted comment shown as a placeholder', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const comment = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: comment.id,
      root_post_id: root.id,
    })
    await deleteTestPost(comment.id)

    await expect(currentUserCanBookmarkTarget(user, 'post', comment.id, 'hide')).resolves.toBe(true)
    await expect(currentUserCanBookmarkTarget(user, 'post', comment.id, 'save')).resolves.toBe(
      false,
    )
    const [hide, save] = await prepareBookmarkActions(user, { kind: 'first_party' }, [
      { entityType: 'post', entityId: comment.id, predicate: 'hide' },
      { entityType: 'post', entityId: comment.id, predicate: 'save' },
    ])
    expect(hide).toMatchObject({ status: 'fulfilled' })
    expect(save).toMatchObject({ status: 'rejected', reason: { status: 404 } })
    if (hide?.status !== 'fulfilled') throw new Error('Placeholder hide was not authorized')
    await expect(upsertPreparedBookmarkActions(user, [hide.value])).resolves.toMatchObject([
      { object_id: comment.id },
    ])
    await deleteTestPost(root.id)
    await expect(currentUserCanBookmarkTarget(user, 'post', comment.id, 'hide')).resolves.toBe(
      false,
    )
  })
})
