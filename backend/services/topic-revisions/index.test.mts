import { beforeAll, describe, expect, it } from 'vitest'
import { createTopicRevision, computeTopicChanges, getLatestTopicContentUpdate } from './index.mts'
import { createTestUser, createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  describe('computeTopicChanges', () => {
    it('returns empty object when before and after are identical', () => {
      const record = { name: 'My Topic', slug: 'my-topic', topic_type: 'topic' }
      expect(computeTopicChanges(record, record)).toEqual({})
    })

    it('detects changed name', () => {
      const before = { name: 'Old Name', slug: 'old-slug' }
      const after = { name: 'New Name', slug: 'old-slug' }
      const changes = computeTopicChanges(before, after)
      expect(changes.name).toEqual({ before: 'Old Name', after: 'New Name' })
      expect(changes.slug).toBeUndefined()
    })

    it('detects changed slug', () => {
      const before = { name: 'Name', slug: 'old-slug' }
      const after = { name: 'Name', slug: 'new-slug' }
      const changes = computeTopicChanges(before, after)
      expect(changes.slug).toEqual({ before: 'old-slug', after: 'new-slug' })
      expect(changes.name).toBeUndefined()
    })

    it('treats null and missing fields as null (create from scratch)', () => {
      const changes = computeTopicChanges(null, { name: 'First Topic', slug: 'first-topic' })
      expect(changes.name).toEqual({ before: null, after: 'First Topic' })
      expect(changes.slug).toEqual({ before: null, after: 'first-topic' })
    })

    it('detects multiple changed fields', () => {
      const before = { name: 'A', slug: 'a', topic_type: 'topic', markdown: null }
      const after = { name: 'B', slug: 'b', topic_type: 'card', markdown: 'Desc' }
      const changes = computeTopicChanges(before, after)
      expect(Object.keys(changes)).toHaveLength(4)
      expect(changes.topic_type).toEqual({ before: 'topic', after: 'card' })
      expect(changes.markdown).toEqual({ before: null, after: 'Desc' })
    })

    it('ignores fields not in tracked list', () => {
      const before = { name: 'T', untracked_field: 'old' }
      const after = { name: 'T', untracked_field: 'new' }
      const changes = computeTopicChanges(before, after)
      expect(changes.untracked_field).toBeUndefined()
      expect(Object.keys(changes)).toHaveLength(0)
    })

    it('handles deleted_at change (delete revision)', () => {
      const before = { name: 'Topic', deleted_at: null }
      const after = { name: 'Topic', deleted_at: new Date('2024-01-01') }
      const changes = computeTopicChanges(before, after)
      expect(changes.deleted_at).toBeDefined()
      expect(changes.name).toBeUndefined()
    })

    it('tracks noindex and allow_reviews policy flag changes', () => {
      const before = { noindex: false, allow_reviews: true }
      const after = { noindex: true, allow_reviews: false }
      const changes = computeTopicChanges(before, after)
      expect(changes.noindex).toEqual({ before: false, after: true })
      expect(changes.allow_reviews).toEqual({ before: true, after: false })
    })
  })

  describe('createTopicRevision', () => {
    it('creates a create revision with changes', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `Revision Test Topic ${random}`,
        slug: `revision-test-topic-${random}`,
        createdById: user.id,
      })

      const changes = { name: { before: null, after: `Revision Test Topic ${random}` } }
      const revision = await createTopicRevision(topicId, 'create', changes, user.id)

      expect(revision.id).toBeDefined()
      expect(revision.topic_id).toBe(topicId)
      expect(revision.revision_type).toBe('create')
      expect(revision.revised_by_id).toBe(user.id)
      expect(revision.revised_by_roles).toContain('administrator')
      expect(revision.changes).toEqual(changes)
      expect(revision.created_at).toBeInstanceOf(Date)
    })

    it('creates an update revision', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `Update Revision Topic ${random}`,
        slug: `update-revision-topic-${random}`,
        createdById: user.id,
      })

      const changes = {
        name: { before: `Update Revision Topic ${random}`, after: `Updated Topic ${random}` },
        slug: {
          before: `update-revision-topic-${random}`,
          after: `updated-topic-${random}`,
        },
      }
      const revision = await createTopicRevision(topicId, 'update', changes, user.id)

      expect(revision.revision_type).toBe('update')
      expect(revision.changes).toEqual(changes)
    })

    it('creates a delete revision', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `Delete Revision Topic ${random}`,
        slug: `delete-revision-topic-${random}`,
        createdById: user.id,
      })

      const changes = { deleted_at: { before: null, after: 'now' } }
      const revision = await createTopicRevision(topicId, 'delete', changes, user.id)

      expect(revision.revision_type).toBe('delete')
      expect(revision.changes).toEqual(changes)
    })

    it('allows null revised_by_id', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `System Revision Topic ${random}`,
        slug: `system-revision-topic-${random}`,
        createdById: user.id,
      })

      const revision = await createTopicRevision(
        topicId,
        'update',
        { markdown: { before: null, after: 'Auto-generated' } },
        null,
      )
      expect(revision.revised_by_id).toBeNull()
      expect(revision.revised_by_roles).toEqual([])
    })

    it('returns an admin-authored create revision when there are no later content updates', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `Create Content Revision Topic ${random}`,
        slug: `create-content-revision-topic-${random}`,
        createdById: user.id,
      })

      await createTopicRevision(
        topicId,
        'create',
        { name: { before: null, after: `Create Content Revision Topic ${random}` } },
        user.id,
      )

      const update = await getLatestTopicContentUpdate(topicId)

      expect(update).not.toBeNull()
      expect(update!.updated_by.id).toBe(user.id)
    })

    it('returns the latest content revision and ignores later non-content revisions', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `Content Revision Topic ${random}`,
        slug: `content-revision-topic-${random}`,
        createdById: user.id,
      })

      await createTopicRevision(
        topicId,
        'update',
        { name: { before: `Content Revision Topic ${random}`, after: `Updated ${random}` } },
        user.id,
      )
      await createTopicRevision(
        topicId,
        'update',
        { logo_image_id: { before: null, after: '00000000-0000-7000-8000-000000000001' } },
        user.id,
      )

      const update = await getLatestTopicContentUpdate(topicId)

      expect(update).not.toBeNull()
      expect(update!.updated_by.id).toBe(user.id)
      expect(update!.updated_by.roles).toEqual([])
      expect(update!.updated_at).toBeInstanceOf(Date)
    })

    it('returns the latest admin content revision and ignores later non-admin content revisions', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const regularUser = await createTestUserDirect({ administrator: false })
      const topicId = await insertTestTopic({
        name: `Admin Content Revision Topic ${random}`,
        slug: `admin-content-revision-topic-${random}`,
        createdById: user.id,
      })

      await createTopicRevision(
        topicId,
        'update',
        { markdown: { before: null, after: `Admin content ${random}` } },
        user.id,
      )
      await createTopicRevision(
        topicId,
        'update',
        { markdown: { before: `Admin content ${random}`, after: `User content ${random}` } },
        regularUser.id,
      )

      const update = await getLatestTopicContentUpdate(topicId)

      expect(update).not.toBeNull()
      expect(update!.updated_by.id).toBe(user.id)
      expect(update!.updated_by.roles).toEqual([])
    })

    it('returns null when content revisions were only authored by non-admin users', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const regularUser = await createTestUserDirect({ administrator: false })
      const topicId = await insertTestTopic({
        name: `User Content Revision Topic ${random}`,
        slug: `user-content-revision-topic-${random}`,
        createdById: regularUser.id,
      })

      await createTopicRevision(
        topicId,
        'update',
        { markdown: { before: null, after: `User content ${random}` } },
        regularUser.id,
      )

      await expect(getLatestTopicContentUpdate(topicId)).resolves.toBeNull()
    })

    it('uses the revision-time role snapshot instead of current user roles', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const promotedUser = await createTestUserDirect({ administrator: false })
      const topicId = await insertTestTopic({
        name: `Promoted User Revision Topic ${random}`,
        slug: `promoted-user-revision-topic-${random}`,
        createdById: promotedUser.id,
      })

      const revision = await createTopicRevision(
        topicId,
        'update',
        { markdown: { before: null, after: `Pre-promotion content ${random}` } },
        promotedUser.id,
      )
      await addUserRole(promotedUser.id, 'administrator')

      expect(revision.revised_by_roles).not.toContain('administrator')
      await expect(getLatestTopicContentUpdate(topicId)).resolves.toBeNull()
    })

    it('returns null when a topic only has non-content revisions', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicId = await insertTestTopic({
        name: `Noncontent Revision Topic ${random}`,
        slug: `noncontent-revision-topic-${random}`,
        createdById: user.id,
      })

      await createTopicRevision(
        topicId,
        'update',
        { hero_image_id: { before: null, after: '00000000-0000-7000-8000-000000000001' } },
        user.id,
      )

      await expect(getLatestTopicContentUpdate(topicId)).resolves.toBeNull()
    })
  })
})
