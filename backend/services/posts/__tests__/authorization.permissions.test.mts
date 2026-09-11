import { it, expect, describe, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  currentUserCanUpdatePost,
  currentUserCanDeletePost,
  currentUserCanCreatePost,
} from '../authorization.mts'
import { getPostByAny } from '../get.mts'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'

describe('authorization', () => {
  let admin: PrivateUser
  let creator: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    creator = await createTestUser()
  })
  describe('currentUserCanUpdatePost', () => {
    it('returns false when user is null', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanUpdatePost(null, post!)

      expect(result).toBe(false)
    })

    it('returns true when user is the creator', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanUpdatePost(creator, post!)

      expect(result).toBe(true)
    })

    it('returns false when user is not the creator', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const otherUser = await createTestUser()
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanUpdatePost(otherUser, post!)

      expect(result).toBe(false)
    })

    it('returns true when user is an admin', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanUpdatePost(admin, post!)

      expect(result).toBe(true)
    })
  })

  describe('currentUserCanCreatePost', () => {
    function makeUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
      return {
        __entity_type: 'user',
        id: 'test-id',
        roles: [],
        cards_visibility: 'everyone',
        rewards_program_statuses_visibility: 'everyone',
        spending_categories_visibility: 'everyone',
        follows_visibility: 'everyone',
        topic_follows_visibility: 'everyone',
        rss_feed_follows_visibility: 'everyone',
        community_memberships_visibility: 'everyone',
        followers_visibility: 'everyone',
        likes_visibility: 'everyone',
        direct_messages_audience: 'everyone',
        default_post_broadcast: 'everyone',
        default_post_privacy: 'public',
        engagement_emails_enabled: true,
        news_digest_frequency: 'weekly',
        moderation_emails_enabled: true,
        community_digest_frequency: 'weekly',
        moderation_email_cadence: 'daily',
        moderation_email_days_of_week: [1, 2, 3, 4, 5],
        moderation_email_time_of_day: '09:00',
        moderation_email_timezone: 'America/Los_Angeles',
        ...overrides,
      } as PrivateUser
    }

    it('returns true for user with OAuth only (no username, no email)', () => {
      const user = makeUser({
        google_account: { id: '123', name: 'Test', email_address: 'tests+test@voucha.ai' },
      })
      expect(currentUserCanCreatePost(user)).toBe(true)
    })

    it('returns true for user with username + email (no OAuth)', () => {
      const user = makeUser({ username: 'testuser', email_address: 'tests+test@voucha.ai' })
      expect(currentUserCanCreatePost(user)).toBe(true)
    })

    it('returns false for user with username only (no email, no OAuth)', () => {
      const user = makeUser({ username: 'testuser' })
      expect(currentUserCanCreatePost(user)).toBe(false)
    })

    it('returns true for admin without anything', () => {
      const user = makeUser({ roles: ['administrator'] })
      expect(currentUserCanCreatePost(user)).toBe(true)
    })
  })

  describe('currentUserCanDeletePost - community moderator', () => {
    function makePost(
      overrides: Partial<{
        post_type: string
        community_id: string | null
        created_by_id: string
      }> = {},
    ) {
      return {
        id: 'post-id',
        post_type: overrides.post_type ?? 'comment',
        community_id: 'community_id' in overrides ? overrides.community_id : 'community-id',
        created_by_id: overrides.created_by_id ?? 'other-user-id',
      } as Parameters<typeof currentUserCanDeletePost>[1]
    }

    it('community owner can delete community-scoped comment', async () => {
      const mod = await createTestUser()
      const result = currentUserCanDeletePost(mod, makePost(), { communityMemberRole: 'owner' })
      expect(result).toBe(true)
    })

    it('community moderator can delete community-scoped comment', async () => {
      const mod = await createTestUser()
      const result = currentUserCanDeletePost(mod, makePost(), { communityMemberRole: 'moderator' })
      expect(result).toBe(true)
    })

    it('community member cannot delete community-scoped comment', async () => {
      const member = await createTestUser()
      const result = currentUserCanDeletePost(member, makePost(), { communityMemberRole: 'member' })
      expect(result).toBe(false)
    })

    it('community role is ignored for non-comment posts', async () => {
      const mod = await createTestUser()
      const post = makePost({ post_type: 'discussion', community_id: 'community-id' })
      const result = currentUserCanDeletePost(mod, post, { communityMemberRole: 'owner' })
      expect(result).toBe(false)
    })

    it('community role is ignored for global comments (community_id is null)', async () => {
      const mod = await createTestUser()
      const post = makePost({ community_id: null })
      const result = currentUserCanDeletePost(mod, post, { communityMemberRole: 'owner' })
      expect(result).toBe(false)
    })
  })

  describe('currentUserCanDeletePost', () => {
    it('returns false when user is null', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanDeletePost(null, post!)

      expect(result).toBe(false)
    })

    it('returns true when user is the creator', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: creator.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanDeletePost(creator, post!)

      expect(result).toBe(true)
    })

    it('returns true when user is an admin', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const testCreator = await createTestUser()
      const testAdmin = await createTestUser()
      await addUserRole(testAdmin!.id, 'administrator')

      // Refetch user to get updated roles from view
      const updatedAdmin = await getPrivateUserByAny(testAdmin!.id)

      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: testCreator!.id,
        markdown: 'Test content',
      })
      const post = await getPostByAny(postId)
      const result = currentUserCanDeletePost(updatedAdmin, post!)

      expect(result).toBe(true)
    })
  })
})
