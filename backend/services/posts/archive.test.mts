import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  createRandomString,
  getPostArchivedFields,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { archivePost, unarchivePost } from './archive.mts'

describe('archive', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  function makeSlug() {
    return `archive-svc-${createRandomString(8)}`
  }

  describe('archivePost', () => {
    it('sets archived_at and archived_by_id', async () => {
      const postId = await insertTestPost({
        title: 'Archive Test Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await archivePost(postId, user.id)

      const fields = await getPostArchivedFields(postId)
      expect(fields?.archived_at).not.toBeNull()
      expect(fields?.archived_by_id).toBe(user.id)
    })

    it('is idempotent when called twice', async () => {
      const postId = await insertTestPost({
        title: 'Archive Idempotent Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await archivePost(postId, user.id)
      const firstFields = await getPostArchivedFields(postId)

      await archivePost(postId, user.id)
      const secondFields = await getPostArchivedFields(postId)

      // archived_at should not change on second call
      expect(secondFields?.archived_at).toEqual(firstFields?.archived_at)
    })
  })

  describe('unarchivePost', () => {
    it('clears archived_at and archived_by_id', async () => {
      const postId = await insertTestPost({
        title: 'Unarchive Test Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await archivePost(postId, user.id)
      await unarchivePost(postId)

      const fields = await getPostArchivedFields(postId)
      expect(fields?.archived_at).toBeNull()
      expect(fields?.archived_by_id).toBeNull()
    })

    it('is idempotent when called on already-unarchived post', async () => {
      const postId = await insertTestPost({
        title: 'Unarchive Idempotent Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await unarchivePost(postId)

      const fields = await getPostArchivedFields(postId)
      expect(fields?.archived_at).toBeNull()
    })
  })
})
