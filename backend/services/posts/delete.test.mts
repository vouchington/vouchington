import { it, expect, describe, beforeAll, onTestFinished, vi } from 'vitest'
import { deletePost } from './delete.mts'
import { getPostByAny } from './get.mts'
import {
  beginTransaction,
  createTestUser,
  getPostDeletedById,
  getTestPostDeletedAt,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPostImage,
  insertTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import * as postPublication from '@services/post-publication'
import { ENTITY_LISTENERS_POST_DELETED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

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

      const gate = holdQueueAdmission(
        entitiesListeners,
        ENTITY_LISTENERS_POST_DELETED_JOB.name,
        data => typeof data === 'object' && data !== null && 'id' in data && data.id === postId,
      )
      let deleting: Promise<void> | undefined
      let settled = false
      let entered = false
      void gate.entered.then(() => {
        entered = true
      })
      let cleanupPromise: Promise<void> | undefined
      const cleanup = () => {
        cleanupPromise ??= (async () => {
          gate.release()
          try {
            await deleting?.catch(() => undefined)
            if (entered)
              await removeEnqueuedJobs(
                [gate.admitted.catch(() => [])],
                ENTITY_LISTENERS_POST_DELETED_JOB.name,
              )
          } finally {
            gate.restore()
          }
        })()
        return cleanupPromise
      }
      onTestFinished(cleanup)
      deleting = deletePost(user, post!).finally(() => {
        settled = true
      })
      try {
        expect(
          await Promise.race([
            gate.entered.then(() => 'admission-entered'),
            deleting.then(() => 'deletion-settled'),
          ]),
        ).toBe('admission-entered')
        await expect(getTestPostDeletedAt(postId)).resolves.toBeInstanceOf(Date)
        expect(settled).toBe(false)
        gate.release()
        await deleting
        expect(await readEnqueuedJob(entitiesListeners, await gate.admitted)).toMatchObject({
          name: ENTITY_LISTENERS_POST_DELETED_JOB.name,
          data: { id: postId },
        })
        const deletedPost = await getPostByAny(postId)
        expect(deletedPost).toBeNull()
      } finally {
        await cleanup()
      }
    })

    it('keeps the committed deletion when post-deleted admission rejects', async () => {
      const suffix = crypto.randomUUID()
      const postId = await insertTestPost({
        title: `Admission rejection ${suffix}`,
        slug: `admission-rejection-${suffix}`,
        createdById: user.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      if (!post) throw new Error('Expected test post')
      const failure = new Error(`Post deletion admission ${suffix}`)
      const originalAdd = entitiesListeners.add
      let matchingAdmissions = 0
      const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
        if (
          name === ENTITY_LISTENERS_POST_DELETED_JOB.name &&
          typeof data === 'object' &&
          data !== null &&
          'id' in data &&
          data.id === postId
        ) {
          matchingAdmissions += 1
          return Promise.reject(failure)
        }
        return originalAdd.call(entitiesListeners, name, data, options)
      })
      onTestFinished(() => spy.mockRestore())

      await deletePost(user, post)

      await expect(getTestPostDeletedAt(postId)).resolves.toBeInstanceOf(Date)
      await expect(getPostDeletedById(postId)).resolves.toEqual({ deleted_by_id: user.id })
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([reported]) => reported === failure),
      ).toHaveLength(1)
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

      const publicationLocked = Promise.withResolvers<void>()
      const lockPublication = postPublication.lockPostPublication
      const spy = vi
        .spyOn(postPublication, 'lockPostPublication')
        .mockImplementation(async (query, lockedPostId) => {
          try {
            return await lockPublication(query, lockedPostId)
          } finally {
            if (lockedPostId === postId) publicationLocked.resolve()
          }
        })
      const deleting = deletePost(user, post)
      try {
        await publicationLocked.promise
        await expect(acquirePostPublicationLockWithShortTimeout(postId)).rejects.toMatchObject({
          code: '55P03',
        })
      } finally {
        spy.mockRestore()
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
  await postPublication.lockPostPublication(query, postId)
  await query.commit()
}
