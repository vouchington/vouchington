import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  createRandomString,
  getPostLockedFields,
  getModeratorActionRowsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { lockPost, unlockPost } from './lock.mts'

describe('lock', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  function makeSlug() {
    return `lock-svc-${createRandomString(8)}`
  }

  describe('lockPost', () => {
    it('sets locked_at and locked_by_id', async () => {
      const postId = await insertTestPost({
        title: 'Lock Test Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await lockPost(postId, user.id)

      const fields = await getPostLockedFields(postId)
      expect(fields?.locked_at).not.toBeNull()
      expect(fields?.locked_by_id).toBe(user.id)
    })

    it('is idempotent when called twice (locked_at does not change)', async () => {
      const postId = await insertTestPost({
        title: 'Lock Idempotent Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await lockPost(postId, user.id)
      const firstFields = await getPostLockedFields(postId)

      await lockPost(postId, user.id)
      const secondFields = await getPostLockedFields(postId)

      expect(secondFields?.locked_at).toEqual(firstFields?.locked_at)
    })
  })

  describe('unlockPost', () => {
    it('clears locked_at and locked_by_id', async () => {
      const postId = await insertTestPost({
        title: 'Unlock Test Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await lockPost(postId, user.id)
      await unlockPost(postId, user.id)

      const fields = await getPostLockedFields(postId)
      expect(fields?.locked_at).toBeNull()
      expect(fields?.locked_by_id).toBeNull()
    })

    it('is idempotent when called on an already-unlocked post', async () => {
      const postId = await insertTestPost({
        title: 'Unlock Idempotent Post',
        slug: makeSlug(),
        createdById: user.id,
        markdown: 'content',
      })

      await unlockPost(postId, null)

      const fields = await getPostLockedFields(postId)
      expect(fields?.locked_at).toBeNull()
    })
  })

  describe('modlog integration', () => {
    it('writes a modlog row when moderator locks a post (locker != author)', async () => {
      const author = await createTestUser()
      const moderator = await createTestUser()
      const postId = await insertTestPost({
        title: `Modlog Lock Post ${createRandomString(4)}`,
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      await lockPost(postId, moderator.id)

      const rows = await getModeratorActionRowsForTest({ postId })
      const lockRow = rows.find(r => r.action_type === 'lock')
      expect(lockRow).toBeDefined()
      expect(lockRow?.actor_id).toBe(moderator.id)
    })

    it('does not write a modlog row when author self-locks their post', async () => {
      const author = await createTestUser()
      const postId = await insertTestPost({
        title: `Self Lock Post ${createRandomString(4)}`,
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      await lockPost(postId, author.id)

      const rows = await getModeratorActionRowsForTest({ postId })
      const lockRow = rows.find(r => r.action_type === 'lock')
      expect(lockRow).toBeUndefined()
    })
  })
})
