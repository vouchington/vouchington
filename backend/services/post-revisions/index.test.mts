import { beforeAll, describe, expect, it } from 'vitest'
import { createPostRevision, computePostChanges } from './index.mts'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  describe('computePostChanges', () => {
    it('returns empty object when before and after are identical', () => {
      const record = { title: 'Hello', markdown: 'World', is_anonymous: false }
      expect(computePostChanges(record, record)).toEqual({})
    })

    it('detects changed title', () => {
      const before = { title: 'Old Title', markdown: null }
      const after = { title: 'New Title', markdown: null }
      const changes = computePostChanges(before, after)
      expect(changes.title).toEqual({ before: 'Old Title', after: 'New Title' })
      expect(changes.markdown).toBeUndefined()
    })

    it('detects changed markdown', () => {
      const before = { title: 'Title', markdown: 'Old content' }
      const after = { title: 'Title', markdown: 'New content' }
      const changes = computePostChanges(before, after)
      expect(changes.markdown).toEqual({ before: 'Old content', after: 'New content' })
      expect(changes.title).toBeUndefined()
    })

    it('treats null and missing fields as null (create from scratch)', () => {
      const changes = computePostChanges(null, { title: 'First Title', markdown: 'Content' })
      expect(changes.title).toEqual({ before: null, after: 'First Title' })
      expect(changes.markdown).toEqual({ before: null, after: 'Content' })
    })

    it('detects multiple changed fields', () => {
      const before = { title: 'A', markdown: 'B', broadcast: 'everyone', privacy: 'public' }
      const after = { title: 'X', markdown: 'Y', broadcast: 'users', privacy: 'private' }
      const changes = computePostChanges(before, after)
      expect(Object.keys(changes)).toHaveLength(4)
      expect(changes.title).toEqual({ before: 'A', after: 'X' })
      expect(changes.broadcast).toEqual({ before: 'everyone', after: 'users' })
    })

    it('ignores fields not in tracked list', () => {
      const before = { title: 'T', some_other_field: 'old' }
      const after = { title: 'T', some_other_field: 'new' }
      const changes = computePostChanges(before, after)
      expect(changes.some_other_field).toBeUndefined()
      expect(Object.keys(changes)).toHaveLength(0)
    })

    it('handles null before (create revision)', () => {
      const after = { title: 'New Post', markdown: 'Content', is_anonymous: false }
      const changes = computePostChanges(null, after)
      expect(changes.title).toEqual({ before: null, after: 'New Post' })
      expect(changes.is_anonymous).toEqual({ before: null, after: false })
    })

    it('handles null after (delete revision)', () => {
      const before = { title: 'Post', deleted_at: null }
      const after = { title: 'Post', deleted_at: new Date('2024-01-01') }
      const changes = computePostChanges(before, after)
      expect(changes.deleted_at).toBeDefined()
      expect(changes.title).toBeUndefined()
    })
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
