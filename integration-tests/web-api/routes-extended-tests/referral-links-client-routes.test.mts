import { describe, expect, it } from 'vitest'
import * as clientRoutes from '@/lib/api/client'
import * as serverRoutes from '@/lib/api/server'
import { installRoutesExtendedHarness } from '../../test-helpers/routes-extended-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes-extended', () => {
  const harness = installRoutesExtendedHarness({
    unset,
    workerSecret: 'with-cookie',
  })

  describe('referral-links client routes', () => {
    it('activateReferralLink returns 200', async () => {
      // Create a link first to ensure one exists for this test
      await harness.withClientRuntime(
        () =>
          clientRoutes.createReferralLink({
            referral_program_id: harness.referralProgram.referralProgramId,
            url: `https://${harness.referralProgram.hostname}/ref/activate-test`,
            label: null,
          }),
        harness.userCookieHeader,
      )
      const res = await serverRoutes.serverApi.get<{
        results: Array<{ id: string }>
      }>('/api/v1/referral-links', {
        searchParams: { referral_program_id: harness.referralProgram.referralProgramId },
        headers: harness.userCookieHeader,
      })
      const linkId = res.results[0]?.id
      expect(linkId).toBeDefined()
      await harness.withClientRuntime(
        () => clientRoutes.activateReferralLink(linkId!),
        harness.userCookieHeader,
      )
    })

    it('deactivateReferralLink returns 200', async () => {
      // Create a link specifically for this test so it is self-contained
      await harness.withClientRuntime(
        () =>
          clientRoutes.createReferralLink({
            referral_program_id: harness.referralProgram.referralProgramId,
            url: `https://${harness.referralProgram.hostname}/ref/deactivate-test`,
            label: null,
          }),
        harness.userCookieHeader,
      )
      const res = await serverRoutes.serverApi.get<{
        results: Array<{ id: string }>
      }>('/api/v1/referral-links', {
        searchParams: { referral_program_id: harness.referralProgram.referralProgramId },
        headers: harness.userCookieHeader,
      })
      const linkId = res.results[0]?.id
      expect(linkId).toBeDefined()
      await harness.withClientRuntime(
        () => clientRoutes.deactivateReferralLink(linkId!),
        harness.userCookieHeader,
      )
    })

    it('getMyReferralLinksClient returns 200', async () => {
      const res = await harness.withClientRuntime(
        () => clientRoutes.getMyReferralLinksClient(),
        harness.userCookieHeader,
      )
      expect(res).toBeDefined()
      expect(res.results).toBeInstanceOf(Array)
    })
  })

  describe('my referral-clicks server routes', () => {
    it('getMyReferralClicks returns 200', async () => {
      const res = await serverRoutes.getMyReferralClicks({ headers: harness.userCookieHeader })
      expect(res).toBeDefined()
      expect(res.results).toBeInstanceOf(Array)
    })
  })

  describe('my referral-clicks client routes', () => {
    it('getMyReferralClicksClient returns 200', async () => {
      const res = await harness.withClientRuntime(
        () => clientRoutes.getMyReferralClicksClient(),
        harness.userCookieHeader,
      )
      expect(res).toBeDefined()
      expect(res.results).toBeInstanceOf(Array)
    })
  })

  describe('elections client routes', () => {
    it('submitPostVote resolves', async () => {
      await expect(
        harness.withClientRuntime(
          () => clientRoutes.submitPostVote(harness.post.id, 'like'),
          harness.userCookieHeader,
        ),
      ).resolves.toBeUndefined()
    })

    it('submitTopicVote resolves', async () => {
      await expect(
        harness.withClientRuntime(
          () => clientRoutes.submitTopicVote(harness.topic.id, 'like'),
          harness.userCookieHeader,
        ),
      ).resolves.toBeUndefined()
    })
  })

  describe('api-keys client routes', () => {
    it('createApiKey and revokeApiKey return 200', async () => {
      const created = (await harness.withClientRuntime(
        () => clientRoutes.createApiKey('extended-test-key', 'rss', ['rss:read']),
        harness.userCookieHeader,
      )) as { api_key: { id: string }; raw_key: string }
      expect(created.api_key?.id).toBeDefined()
      expect(created.raw_key).toBeDefined()
      await harness.withClientRuntime(
        () => clientRoutes.revokeApiKey(created.api_key.id),
        harness.userCookieHeader,
      )
    })
  })
})
