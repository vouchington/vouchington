import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { upsertPlaybackPosition, getPlaybackPosition } from './playback-positions.mts'

describe('podcast-playback-positions', () => {
  let user: PrivateUser
  let otherUser: PrivateUser
  let rssFeedId: string

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
    const rand = crypto.randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Podcast Pos Topic ${rand}`,
      slug: `podcast-pos-topic-${rand}`,
      createdById: user.id,
    })
    rssFeedId = await insertTestRssFeed({ topicId, title: `Podcast Pos Feed ${rand}` })
  })

  describe('getPlaybackPosition', () => {
    it('returns null when no position exists for the user+episode', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const result = await getPlaybackPosition(user.id, episodeId)
      expect(result).toBeNull()
    })
  })

  describe('upsertPlaybackPosition + getPlaybackPosition', () => {
    it('inserts a new position and reads it back', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)

      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 42.5,
        completed: false,
      })

      const result = await getPlaybackPosition(user.id, episodeId)
      expect(result).not.toBeNull()
      expect(result!.position_seconds).toBe(42.5)
      expect(result!.completed_at).toBeNull()
    })

    it('overwrites position_seconds on subsequent upserts', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)

      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 10,
        completed: false,
      })
      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 120,
        completed: false,
      })

      const result = await getPlaybackPosition(user.id, episodeId)
      expect(result!.position_seconds).toBe(120)
      expect(result!.completed_at).toBeNull()
    })

    it('sets completed_at when completed is true', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)

      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 3600,
        completed: true,
      })

      const result = await getPlaybackPosition(user.id, episodeId)
      expect(result!.position_seconds).toBe(3600)
      expect(result!.completed_at).not.toBeNull()
    })

    it('clears completed_at on subsequent non-completed writes', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)

      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 3600,
        completed: true,
      })
      const afterComplete = await getPlaybackPosition(user.id, episodeId)
      const completedAt = afterComplete!.completed_at

      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 5,
        completed: false,
      })

      const result = await getPlaybackPosition(user.id, episodeId)
      expect(result!.position_seconds).toBe(5)
      expect(completedAt).not.toBeNull()
      expect(result!.completed_at).toBeNull()
    })

    it('is isolated per user — different users have independent positions', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)

      await upsertPlaybackPosition(user.id, episodeId, {
        positionSeconds: 100,
        completed: false,
      })
      await upsertPlaybackPosition(otherUser.id, episodeId, {
        positionSeconds: 200,
        completed: false,
      })

      const userResult = await getPlaybackPosition(user.id, episodeId)
      const otherResult = await getPlaybackPosition(otherUser.id, episodeId)

      expect(userResult!.position_seconds).toBe(100)
      expect(otherResult!.position_seconds).toBe(200)
    })
  })
})
