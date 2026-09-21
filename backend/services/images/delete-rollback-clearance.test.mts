import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { setPostClearanceStatus } from '@services/post-clearance'
import { createPostModerationContent } from '@services/posts/content'
import { getPostModerationInput } from '@services/posts/moderation-input'
import {
  createTestUserDirect,
  getPostModerationResetState,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { deleteImageById } from './delete.mts'

describe('deleteImageById clearance rollback', () => {
  beforeEach(async () => {
    await entitiesListeners.obliterate({ force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['pending', 'rejected', 'in_review'] as const)(
    'restores a %s clearance state when deletion enqueue rolls back',
    async clearanceStatus => {
      const creator = await createTestUserDirect()
      expect(creator).toBeTruthy()
      const suffix = randomUUID()
      const postId = await insertTestPost({
        title: `Delete image ${clearanceStatus} rollback ${suffix}`,
        slug: `delete-image-${clearanceStatus}-rollback-${suffix}`,
        createdById: creator!.id,
        markdown: 'Post whose clearance must be restored after a failed image deletion',
        clearanceStatus: 'pending',
      })
      const imageId = await insertTestImage(creator!.id)
      await insertTestPostImage({ postId, imageId })
      if (clearanceStatus !== 'pending') {
        await setPostClearanceStatus(postId, clearanceStatus, creator!.id)
      }
      const post = await getPostModerationInput(postId)
      if (!post) throw new Error('post was not found')
      await setPostLLMModerationContentSha256(
        postId,
        createPostModerationContent(post).content_sha256,
      )
      const enqueueError = new Error(`failed ${clearanceStatus} rollback enqueue`)
      const rejectedBulk = Promise.reject(enqueueError) as ReturnType<
        typeof entitiesListeners.addBulk
      >
      void rejectedBulk.catch(() => {})
      vi.spyOn(entitiesListeners, 'addBulk').mockReturnValueOnce(rejectedBulk)

      await expect(deleteImageById(imageId)).rejects.toThrow(enqueueError)

      const expectedState = {
        pending: { approved_at: null, rejected_at: null, in_review_at: null },
        rejected: { approved_at: null, rejected_at: expect.any(Date), in_review_at: null },
        in_review: { approved_at: null, rejected_at: null, in_review_at: expect.any(Date) },
      }
      await expect(getPostModerationResetState(postId)).resolves.toMatchObject(
        expectedState[clearanceStatus],
      )
    },
  )
})
