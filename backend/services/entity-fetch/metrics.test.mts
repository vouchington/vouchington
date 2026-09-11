import { it, expect, describe, beforeAll } from 'vitest'
import { getUserMetricsByAny, getUserProfileMetricsByAny } from './metrics.mts'
import {
  createTestUser,
  createUserProfileFixture,
  insertEntityRelation,
  insertTestRssFeedDirect,
  setTestUserLegacyBookmarkMetrics,
} from '@voucha/test-helpers'
import { softDeleteTopic } from '../../test-helpers/entities/topics/deletion.mts'
import { upsertRecentlyViewed } from '@services/recently-viewed'
import type { PrivateUser } from '@services/users/types'
import { updateUserFields } from '@services/users/update-fields'

describe('metrics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('getUserMetricsByAny', () => {
    it('retrieves metrics by UUID', async () => {
      const metrics = await getUserMetricsByAny(user.id)

      expect(metrics).toBeDefined()
      expect(metrics).toMatchObject({
        __entity_type: 'user_metrics',
        id: user.id,
        bookmarks: {
          follow: {
            topics: 0,
            posts: 0,
            users: 0,
          },
        },
        bookmarkers: {
          follow: 0,
        },
      })
      expect(metrics?.bookmarks__updated_at).toBeInstanceOf(Date)
    })

    it('retrieves metrics by username', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const username = `testuser${random}`
      const testUser = await createTestUser({ username })
      const metrics = await getUserMetricsByAny(username)

      expect(metrics).toBeDefined()
      expect(metrics).toMatchObject({
        __entity_type: 'user_metrics',
        id: testUser!.id,
        bookmarks: {
          follow: {
            topics: 0,
            posts: 0,
            users: 0,
          },
        },
        bookmarkers: {
          follow: 0,
        },
      })
    })

    it('retrieves metrics by username (case insensitive)', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const username = `testuser${random}`
      const testUser = await createTestUser({ username: username.toLowerCase() })
      // Query with mixed case should still work due to LOWER() in SQL
      const metrics = await getUserMetricsByAny(username.toUpperCase())

      expect(metrics).toBeDefined()
      expect(metrics?.id).toBe(testUser!.id)
    })

    it('returns null for non-existent UUID', async () => {
      const nonExistentId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      const metrics = await getUserMetricsByAny(nonExistentId)

      expect(metrics).toBeNull()
    })

    it('returns null for non-existent username', async () => {
      const nonExistentUsername = `nonexistent${Math.random().toString(36).slice(2, 15)}`
      const metrics = await getUserMetricsByAny(nonExistentUsername)

      expect(metrics).toBeNull()
    })

    it('throws error for invalid identifier', async () => {
      await expect(getUserMetricsByAny('invalid identifier!')).rejects.toThrow(
        /Invalid user identifier/,
      )
    })

    it('returns public, viewer, and private profile counts when authorized', async () => {
      const fixture = await createUserProfileFixture({ suffix: `metrics-${Date.now()}` })

      const metrics = await getUserProfileMetricsByAny(fixture.owner.id, {
        currentUser: fixture.owner,
      })

      expect(metrics).toMatchObject({
        count: {
          reviews: 1,
          discussions: 1,
          comments: 1,
          users_following: 1,
          users_followers: 1,
          topics_following: 1,
          rss_feeds_following: 1,
        },
        viewer_count: {
          reviews: 1,
          discussions: 1,
          comments: 1,
        },
        private_count: {
          topics_blocked: 1,
          topics_muted: 1,
          topics_viewed: 1,
          users_blocked: 1,
          users_muted: 1,
          rss_feed_items_saved: 1,
          rss_feed_items_viewed: 1,
        },
      })
    })

    it('zeros privacy-restricted collection counts for anonymous and unrelated viewers', async () => {
      const fixture = await createUserProfileFixture({
        suffix: `metrics-restricted-${Date.now()}`,
      })
      const stranger = await createTestUser()
      if (!stranger) throw new Error('Failed to create stranger')
      await insertEntityRelation(
        'relation__user__follow__post',
        fixture.owner.id,
        fixture.discussion.id,
      )
      await setTestUserLegacyBookmarkMetrics(fixture.owner.id, {
        topics: 1,
        posts: 1,
        users: 1,
        followers: 1,
      })
      await updateUserFields(fixture.owner.id, {
        follows_visibility: 'nobody',
        followers_visibility: 'nobody',
        topic_follows_visibility: 'nobody',
        rss_feed_follows_visibility: 'nobody',
      })

      const anonymousMetrics = await getUserProfileMetricsByAny(fixture.owner.id)
      const strangerMetrics = await getUserProfileMetricsByAny(fixture.owner.id, {
        currentUser: stranger,
      })

      for (const metrics of [anonymousMetrics, strangerMetrics]) {
        expect(metrics?.count).toMatchObject({
          users_following: 0,
          users_followers: 0,
          topics_following: 0,
          rss_feeds_following: 0,
        })
        expect(metrics?.bookmarks.follow).toEqual({
          topics: 0,
          posts: 0,
          users: 0,
        })
        expect(metrics?.bookmarkers.follow).toBe(0)
      }
    })

    it('returns actual collection counts to owners and authorized follower audiences', async () => {
      const fixture = await createUserProfileFixture({
        suffix: `metrics-audiences-${Date.now()}`,
      })
      await insertEntityRelation(
        'relation__user__follow__post',
        fixture.owner.id,
        fixture.discussion.id,
      )
      await setTestUserLegacyBookmarkMetrics(fixture.owner.id, {
        topics: 1,
        posts: 1,
        users: 1,
        followers: 1,
      })
      await updateUserFields(fixture.owner.id, {
        follows_visibility: 'followers',
        followers_visibility: 'followers',
        topic_follows_visibility: 'followers',
        rss_feed_follows_visibility: 'followers',
      })

      const ownerMetrics = await getUserProfileMetricsByAny(fixture.owner.id, {
        currentUser: fixture.owner,
      })
      const followerMetrics = await getUserProfileMetricsByAny(fixture.owner.id, {
        currentUser: fixture.follower,
      })

      expect(ownerMetrics?.count).toMatchObject({
        users_following: 1,
        users_followers: 1,
        topics_following: 1,
        rss_feeds_following: 1,
      })
      expect(ownerMetrics?.bookmarks.follow).toEqual({
        topics: 1,
        posts: 1,
        users: 1,
      })
      expect(ownerMetrics?.bookmarkers.follow).toBe(1)
      expect(followerMetrics?.count).toMatchObject({
        users_following: 1,
        users_followers: 1,
        topics_following: 1,
        rss_feeds_following: 1,
      })
      expect(followerMetrics?.bookmarks.follow).toEqual({
        topics: 1,
        posts: 0,
        users: 1,
      })
      expect(followerMetrics?.bookmarkers.follow).toBe(1)

      await insertEntityRelation(
        'relation__user__follow__user',
        fixture.owner.id,
        fixture.follower.id,
      )
      await setTestUserLegacyBookmarkMetrics(fixture.owner.id, {
        topics: 1,
        posts: 1,
        users: 2,
        followers: 1,
      })
      await updateUserFields(fixture.owner.id, {
        follows_visibility: 'mutual_followers',
        followers_visibility: 'mutual_followers',
        topic_follows_visibility: 'mutual_followers',
        rss_feed_follows_visibility: 'mutual_followers',
      })

      const mutualFollowerMetrics = await getUserProfileMetricsByAny(fixture.owner.id, {
        currentUser: fixture.follower,
      })
      expect(mutualFollowerMetrics?.count).toMatchObject({
        users_following: 2,
        users_followers: 1,
        topics_following: 1,
        rss_feeds_following: 1,
      })
      expect(mutualFollowerMetrics?.bookmarks.follow).toEqual({
        topics: 1,
        posts: 0,
        users: 2,
      })
      expect(mutualFollowerMetrics?.bookmarkers.follow).toBe(1)
    })

    it('excludes soft-deleted relation targets from private profile counts', async () => {
      const fixture = await createUserProfileFixture({ suffix: `metrics-dangling-${Date.now()}` })

      await softDeleteTopic(fixture.blockedTopic.id, fixture.owner.id)

      const metrics = await getUserProfileMetricsByAny(fixture.owner.id, {
        currentUser: fixture.owner,
      })

      expect(metrics?.private_count?.topics_blocked).toBe(0)
    })

    it('includes rss_feeds_viewed in private counts', async () => {
      const user = await createTestUser()
      const feed = await insertTestRssFeedDirect({})
      await upsertRecentlyViewed('rss_feed', feed.id, null, user.id)

      const metrics = await getUserProfileMetricsByAny(user.id, { currentUser: user })

      expect(metrics?.private_count?.rss_feeds_viewed).toBe(1)
    })
  })
})
