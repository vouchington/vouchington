import { expect, it, describe } from 'vitest'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { getVisibleCommentDescendantIdsPage } from './descendant-ids.mts'

describe('descendant-ids', () => {
  it('getCommentDescendantIds returns all descendants when starting from the root', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const comment1 = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: root.id,
      root_id: root.id,
    })
    const comment2 = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: comment1.id,
      root_id: root.id,
    })

    const { results: ids } = await getVisibleCommentDescendantIdsPage(user, root.id, root.id, {
      limit: 100,
    })

    expect(ids).toEqual([comment1.id, comment2.id])
  })

  it('getCommentDescendantIds returns only the subtree when starting from a mid-level comment', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const comment1 = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: root.id,
      root_id: root.id,
    })
    const reply = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: comment1.id,
      root_id: root.id,
    })
    await createTestPost({ user, post_type: 'comment', parent_id: root.id, root_id: root.id })

    const { results: ids } = await getVisibleCommentDescendantIdsPage(user, root.id, comment1.id, {
      limit: 100,
    })

    expect(ids).toEqual([reply.id])
  })

  it('keeps deleted comments as structural tombstones', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const deletedParent = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: root.id,
      root_id: root.id,
    })
    const reply = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: deletedParent.id,
      root_id: root.id,
    })
    await deleteTestPost(deletedParent.id)

    const { results } = await getVisibleCommentDescendantIdsPage(null, root.id, root.id, {
      limit: 100,
    })

    expect(results).toEqual([deletedParent.id, reply.id])
  })

  it('prunes approved replies beneath an invisible nondeleted comment', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const pendingParent = await createTestPost({
      user,
      post_type: 'comment',
      parent_id: root.id,
      root_id: root.id,
    })
    await createTestPost({
      user,
      post_type: 'comment',
      parent_id: pendingParent.id,
      root_id: root.id,
    })
    await setTestPostClearanceStatus(pendingParent.id, 'pending', user.id)

    const { results } = await getVisibleCommentDescendantIdsPage(null, root.id, root.id, {
      limit: 100,
    })

    expect(results).toEqual([])
  })
})
