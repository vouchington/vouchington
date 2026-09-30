import { describe, expect, it } from 'vitest'
import * as serverRoutes from '@/lib/api/server'
import { createTestUser, safeUsername } from '../../../../backend/test-helpers/index.mts'
import { installRoutesExtendedHarness } from '../../../test-helpers/routes-extended-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes-extended', () => {
  const harness = installRoutesExtendedHarness({
    unset,
    workerSecret: 'always',
  })

  describe('users server routes', () => {
    it('getUserTopicsCollection returns an empty result for a user following no topics', async () => {
      const result = await serverRoutes.getUserTopicsCollection(harness.user.username!, 'following')
      expect(result).not.toBeNull()
      expect(result?.results).toEqual([])
    })

    it('getUserUsersCollection returns an empty result for a user following no users', async () => {
      const result = await serverRoutes.getUserUsersCollection(harness.user.username!, 'following')
      expect(result).not.toBeNull()
      expect(result?.results).toEqual([])
    })

    it('getUserRssFeedItemsCollection returns null when unauthenticated', async () => {
      // Unlike the "following" topics/users collections above, saved rss feed items are
      // owner-only: resolveTargetUser's privateCollection check (ctx.assert(currentUser, 401,
      // ...)) fires before any 403/404 check, so an unauthenticated request gets a 401, which
      // returnNullForMissingEntity's nullStatusCodes converts to null. Assert the raw status
      // directly so a regression that instead 404s (broken route, missing target) can't produce
      // the same null through a different failure mode and slip past this test.
      const userUsername = harness.user.username!
      await expect(
        serverRoutes.serverApi.get(
          `/api/v1/users/${encodeURIComponent(userUsername)}/rss-feed-items/saved`,
        ),
      ).rejects.toMatchObject({ status: 401 })

      const result = await serverRoutes.getUserRssFeedItemsCollection(userUsername, 'saved')
      expect(result).toBeNull()
    })

    it('getUserVouchContext returns null when unauthenticated', async () => {
      const target = await createTestUser({ username: safeUsername('ext-vouch-ctx-anon') })

      // requireAuth throws 401 for anonymous requests before any target-lookup path runs, which
      // returnNullForMissingEntity's nullStatusCodes converts to null. Assert the raw status
      // directly so a regression that instead 404s can't produce the same null and slip past
      // this test.
      await expect(
        serverRoutes.serverApi.get(`/api/v1/users/${encodeURIComponent(target.id)}/vouch-context`),
      ).rejects.toMatchObject({ status: 401 })

      const result = await serverRoutes.getUserVouchContext(target.id)
      expect(result).toBeNull()
    })

    it('GET /api/v1/users/:id/vouch-context returns the expected shape for authed viewers', async () => {
      const target = await createTestUser({ username: safeUsername('ext-vouch-ctx-auth') })

      const raw = await serverRoutes.serverApi.get<{
        positive_by_following: { total: number; users: unknown[] }
        negative_by_following: { total: number; users: unknown[] }
      }>(`/api/v1/users/${encodeURIComponent(target.id)}/vouch-context`, {
        headers: harness.userCookieHeader,
      })
      expect(raw.positive_by_following).toMatchObject({ total: expect.any(Number) })
      expect(raw.negative_by_following).toMatchObject({ total: expect.any(Number) })
    })
    it('GET /api/v1/topics/user-tags returns the curated moderation catalog', async () => {
      const raw = await serverRoutes.serverApi.get<{
        user_tags: Array<{ id: string; slug: string; label: string }>
      }>('/api/v1/topics/user-tags', { headers: harness.adminCookieHeader })

      expect(raw.user_tags).toEqual([
        expect.objectContaining({ slug: 'bot', label: 'Bot' }),
        expect.objectContaining({ slug: 'spammer', label: 'Spammer' }),
      ])
    })
  })
})
