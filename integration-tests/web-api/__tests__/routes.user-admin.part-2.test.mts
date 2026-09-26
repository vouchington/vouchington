import { describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import { installUserAdminRouteHarness } from '../../test-helpers/user-admin-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes — user and admin', () => {
  const harness = installUserAdminRouteHarness(unset)

  describe('web client API user routes', () => {
    it('getFriendRecommendations resolves', async () => {
      await expect(
        harness.withClientRuntime(
          () => clientRoutes.getFriendRecommendations<unknown>(),
          harness.userCookieHeader,
        ),
      ).resolves.not.toThrow()
    })

    it('bookmarkEntity creates a bookmark for the topic', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.bookmarkEntity('topic', harness.topicId, 'follow'),
        harness.userCookieHeader,
      )
      expect(result.bookmark).toBeDefined()
    })

    it('unbookmarkEntity resolves after removing the bookmark', async () => {
      await expect(
        harness.withClientRuntime(
          () => clientRoutes.unbookmarkEntity('topic', harness.topicId, 'follow'),
          harness.userCookieHeader,
        ),
      ).resolves.not.toThrow()
    })
  })
})
