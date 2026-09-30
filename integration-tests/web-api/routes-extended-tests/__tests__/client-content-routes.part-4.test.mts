import { describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import {
  getMyIdentityVerificationSessionUrl,
  updateMyIdentityVerificationDisplayPreferences,
} from '@/lib/api/client/identity-verification'
import type { VoteIntegrityPenalty } from '@/types/vote-integrity'
import {
  createTestPost,
  insertTestVoteIntegrityFlag,
} from '../../../../backend/test-helpers/index.mts'
import { installClientContentRouteHarness } from '../../../test-helpers/client-content-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('client-content-routes', () => {
  let pendingFlagId = ''

  const harness = installClientContentRouteHarness({
    unset,
    afterPenalty: async ({ admin }) => {
      const flagPost = await createTestPost({ user: admin })
      pendingFlagId = await insertTestVoteIntegrityFlag({ postId: flagPost.id })
    },
  })

  describe('vote-integrity client routes (admin only)', () => {
    it('getVoteIntegrityFlagsClient returns 200 with no params', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>(),
        harness.adminCookieHeader,
      )
      expect(result.results.some(flag => flag.id === pendingFlagId)).toBe(true)
    })

    it('getVoteIntegrityFlagsClient returns 200 with status param', async () => {
      const result = await harness.withClientRuntime(
        () =>
          clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>({
            status: 'pending',
          }),
        harness.adminCookieHeader,
      )
      expect(result.results.some(flag => flag.id === pendingFlagId)).toBe(true)
    })

    it('getVoteIntegrityFlagsClient returns 200 with resolved status', async () => {
      await harness.withClientRuntime(
        () => clientRoutes.resolveVoteIntegrityFlag(pendingFlagId, 'dismissed'),
        harness.adminCookieHeader,
      )

      const resolved = await harness.withClientRuntime(
        () =>
          clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>({
            status: 'resolved',
          }),
        harness.adminCookieHeader,
      )
      expect(resolved.results.some(flag => flag.id === pendingFlagId)).toBe(true)

      const stillPending = await harness.withClientRuntime(
        () =>
          clientRoutes.getVoteIntegrityFlagsClient<{ results: Array<{ id: string }> }>({
            status: 'pending',
          }),
        harness.adminCookieHeader,
      )
      expect(stillPending.results.some(flag => flag.id === pendingFlagId)).toBe(false)
    })

    it('revokeVoteWeightPenalty returns 200', async () => {
      const result = await harness.withClientRuntime(
        () =>
          clientRoutes.revokeVoteWeightPenalty<{ penalty: VoteIntegrityPenalty }>(
            harness.penaltyId,
          ),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({
        penalty: expect.objectContaining({ id: harness.penaltyId, revoked_at: expect.any(String) }),
      })
    })
  })

  describe('identity-verification client routes', () => {
    it('getMyIdentityVerificationSessionUrl reaches the endpoint (requires pending session)', async () => {
      // Endpoint requires verification_status === 'identity_pending' with a real Stripe session.
      // Confirm the function reaches the API route by matching the domain error.
      await expect(
        harness.withClientRuntime(
          () => getMyIdentityVerificationSessionUrl(),
          harness.userCookieHeader,
        ),
      ).rejects.toMatchObject({ name: 'ApiError' })
    })

    it('updateMyIdentityVerificationDisplayPreferences returns 200 for verified user', async () => {
      // verifiedUser was set to verified before the server started, so no stale cache.
      const result = await harness.withClientRuntime(
        () =>
          updateMyIdentityVerificationDisplayPreferences({
            verified_badge_visible: false,
          }),
        harness.verifiedUserCookieHeader,
      )
      expect(result).toMatchObject({ verified_badge_visible: false })
    })
  })
})
