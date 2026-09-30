import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { registerPostRevisionChangeDetection } from '../../test-helpers/revision-change-detection-tests.mts'
import { createPostRevision, computePostChanges } from './index.mts'

describe('index', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  describe('computePostChanges', () => {
    registerPostRevisionChangeDetection(computePostChanges)
  })

  describe('createPostRevision', () => {
    it('creates a create revision with changes', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const postId = await insertTestPost({
        title: `Revision Test Post ${random}`,
        slug: `revision-test-post-${random}`,
        createdById: user.id,
        markdown: 'Initial content',
      })

      const changes = { title: { before: null, after: `Revision Test Post ${random}` } }
      const revision = await createPostRevision(postId, 'create', changes, user.id)

      expect(revision.id).toBeDefined()
      expect(revision.post_id).toBe(postId)
      expect(revision.revision_type).toBe('create')
      expect(revision.revised_by_id).toBe(user.id)
      expect(revision.changes).toEqual(changes)
      expect(revision.created_at).toBeInstanceOf(Date)
    })

    it('creates an update revision', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const postId = await insertTestPost({
        title: `Update Revision Post ${random}`,
        slug: `update-revision-post-${random}`,
        createdById: user.id,
        markdown: 'Content',
      })

      const changes = {
        title: { before: `Update Revision Post ${random}`, after: `Updated Post ${random}` },
        markdown: { before: 'Content', after: 'Updated content' },
      }
      const revision = await createPostRevision(postId, 'update', changes, user.id)

      expect(revision.revision_type).toBe('update')
      expect(revision.changes).toEqual(changes)
    })

    it('creates a delete revision', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const postId = await insertTestPost({
        title: `Delete Revision Post ${random}`,
        slug: `delete-revision-post-${random}`,
        createdById: user.id,
        markdown: 'Content',
      })

      const changes = { deleted_at: { before: null, after: 'now' } }
      const revision = await createPostRevision(postId, 'delete', changes, user.id)

      expect(revision.revision_type).toBe('delete')
      expect(revision.changes).toEqual(changes)
    })

    it('allows null revised_by_id', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const postId = await insertTestPost({
        title: `System Revision Post ${random}`,
        slug: `system-revision-post-${random}`,
        createdById: user.id,
        markdown: 'Content',
      })

      const revision = await createPostRevision(
        postId,
        'update',
        { markdown: { before: 'old', after: 'new' } },
        null,
      )
      expect(revision.revised_by_id).toBeNull()
    })
  })
})
