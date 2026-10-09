import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createReferralProgramFixture,
  WEB_PROVENANCE,
  updateUrlHostnameBlocked,
  updateUrlHostnameCrawlable,
} from '@voucha/test-helpers'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { getUrlById } from '@services/urls/get'
import { dispatchReferralLinkCrawls } from './dispatch.mts'

describe('referral dispatcher hostname flags', () => {
  it.each(['uncrawlable', 'blocked'] as const)(
    'does not enqueue links from %s hostnames',
    async flag => {
      const user = await createTestUser()
      const suffix = randomUUID().replaceAll('-', '')
      const hostname = `dispatch-flags-${suffix}.com`
      const fixture = await createReferralProgramFixture({
        createdById: user.id,
        randomSuffix: suffix,
        hostname,
        pathname: '/ref/%',
      })
      const link = await createUserReferralLink(user, WEB_PROVENANCE, {
        user_id: user.id,
        referral_program_id: fixture.referralProgramId,
        url: `https://${hostname}/ref/a`,
      })
      const url = await getUrlById(link.url_id)
      if (!url) throw new Error('Expected owned URL')
      if (flag === 'blocked') await updateUrlHostnameBlocked(url.hostname.id, true)
      else await updateUrlHostnameCrawlable(url.hostname.id, false)
      const enqueue = vi
        .fn<
          NonNullable<
            Parameters<typeof dispatchReferralLinkCrawls>[0]
          >['enqueueBulkCrawlReferralLinks']
        >()
        .mockResolvedValue(undefined)
      const result = await dispatchReferralLinkCrawls({
        referralLinkIds: [link.id],
        computeHostnameRateLimitMs: async () => 1,
        enqueueBulkCrawlReferralLinks: enqueue,
      })
      expect(result.count).toBe(0)
      expect(enqueue).not.toHaveBeenCalled()
    },
  )
})
