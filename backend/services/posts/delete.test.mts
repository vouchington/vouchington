import { it, expect, describe, beforeAll, vi } from 'vitest'
import { deletePost } from './delete.mts'
import { getPostByAny } from './get.mts'
import {
  beginTransaction,
  createTestUser,
  getPostDeletedById,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPostImage,
  insertTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { lockPostPublication } from '@services/post-publication'

describe('delete', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('deletePost', () => {
    it('soft deletes a post', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: user.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      expect(post).toBeDefined()
      expect(post!.deleted_at).toBeNull()

      await deletePost(user, post!)

      const deletedPost = await getPostByAny(postId)
      expect(deletedPost).toBeNull()
    })

    it('sets deleted_by_id to deleter user', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const creator = await createTestUser()
      const deleter = await createTestUser({ administrator: true })
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator!.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      expect(post).toBeDefined()

      await deletePost(deleter!, post!)

      // Check database directly since view filters deleted posts
      const deletedPost = await getPostDeletedById(postId)
      expect(deletedPost?.deleted_by_id).toBe(deleter!.id)
    })

    it('retires every attached image placement with a new revision', async () => {
      const postId = await insertTestPost({
        title: `Placement deletion ${crypto.randomUUID()}`,
        slug: `placement-deletion-${crypto.randomUUID()}`,
        createdById: user.id,
        markdown: '',
      })
      const [firstImageId, secondImageId] = await Promise.all([
        insertTestImage(user.id),
        insertTestImage(user.id),
      ])
      await Promise.all([
        insertTestPostImage({ postId, imageId: firstImageId }),
        insertTestPostImage({ postId, imageId: secondImageId, orderIndex: 1 }),
      ])
      const [firstPlacement, secondPlacement] = await Promise.all([
        getTestPostImagePlacement(postId, firstImageId),
        getTestPostImagePlacement(postId, secondImageId),
      ])
      const post = await getPostByAny(postId)
      if (!post || !firstPlacement || !secondPlacement) throw new Error('Expected post placements')

      await deletePost(user, post)

      await expect(getTestPostImagePlacement(postId, firstImageId)).resolves.toMatchObject({
        retired_at: expect.any(Date),
        placement_revision: firstPlacement.placement_revision + 1,
      })
      await expect(getTestPostImagePlacement(postId, secondImageId)).resolves.toMatchObject({
        retired_at: expect.any(Date),
        placement_revision: secondPlacement.placement_revision + 1,
      })
    })

    it('takes the publication lock before waiting on the post row', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Publication lock ${random}`,
        slug: `publication-lock-${random}`,
        createdById: user.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      if (!post) throw new Error('Expected test post')
      const rowLocked = Promise.withResolvers<void>()
      const releaseRow = Promise.withResolvers<void>()
      const holder = holdPostRowLock({ postId, rowLocked, releaseRow })
      await rowLocked.promise

      const deleting = deletePost(user, post)
      try {
        await vi.waitFor(async () => {
          await expect(acquirePostPublicationLockWithShortTimeout(postId)).rejects.toMatchObject({
            code: '55P03',
          })
        })
      } finally {
        releaseRow.resolve()
      }
      await holder
      await deleting
    })
  })
})

async function holdPostRowLock({
  postId,
  rowLocked,
  releaseRow,
}: {
  postId: string
  rowLocked: PromiseWithResolvers<void>
  releaseRow: PromiseWithResolvers<void>
}): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* deletePost publication lock test */ SELECT 1 FROM posts WHERE id = $1 FOR UPDATE`,
    [postId],
  )
  rowLocked.resolve()
  await releaseRow.promise
  await query.commit()
}

async function acquirePostPublicationLockWithShortTimeout(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* deletePost publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await lockPostPublication(query, postId)
  await query.commit()
}
