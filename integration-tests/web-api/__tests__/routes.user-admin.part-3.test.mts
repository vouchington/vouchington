import { beforeAll, describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import { createTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'
import { createWebApiTestCookieHeader } from '../routes.mts'
import { installUserAdminRouteHarness } from '../../test-helpers/user-admin-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes — user and admin', () => {
  const harness = installUserAdminRouteHarness(unset)

  describe('archivePost and unarchivePost', () => {
    // Use dedicated user + post to avoid mutating the shared postId fixture
    let archivePostId: string
    let archiveCookieHeader: Record<string, string>

    beforeAll(async () => {
      const archiveUser = await createTestUser()
      archiveCookieHeader = await createWebApiTestCookieHeader(archiveUser.id)
      const post = await createTestPost({ user: archiveUser })
      archivePostId = post.id
    })

    it('archivePost archives the post', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.archivePost(archivePostId),
        archiveCookieHeader,
      )
      expect(result.post.archived_at).not.toBeNull()
    })

    it('unarchivePost unarchives the post', async () => {
      await harness.withClientRuntime(
        () => clientRoutes.archivePost(archivePostId),
        archiveCookieHeader,
      )
      const result = await harness.withClientRuntime(
        () => clientRoutes.unarchivePost(archivePostId),
        archiveCookieHeader,
      )
      expect(result.post.archived_at).toBeNull()
    })
  })
})
