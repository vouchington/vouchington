import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { markReferralLinkUnfurlRequested } from '@services/user-referral-program-links/unfurl-state'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { UnfurlDispatchCursor } from '@queues/unfurl-referral-links/types'
import { referralUnfurlDispatchConfig } from './work-limits.mts'
import { dispatchUnfurlReferralLinks } from './dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('bounded referral unfurl dispatch', () => {
  afterAll(() => unfurlReferralLinksQueue.close())

  it('resumes still-requested rows while excluding new requests from the fixed sweep', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const afterId = getMinUUIDv7ForDate(new Date())
    const ids = (
      await Promise.all(
        Array.from({ length: 3 }, async () =>
          insertTestUserReferralProgramLink({
            userId: owner.id,
            referralProgramId,
            urlId: await createTestUrlWithHostname(),
          }),
        ),
      )
    ).toSorted()
    await Promise.all(ids.map(id => markReferralLinkUnfurlRequested(id)))
    const sweepStartedAt = new Date().toISOString()
    overrideDynamicConfigFieldsForTest(referralUnfurlDispatchConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    expect(await dispatchUnfurlReferralLinks({ sweepStartedAt, afterId })).toEqual({
      count: 1,
      hasMore: true,
    })
    const jobs = await unfurlReferralLinksQueue.searchJobs({
      name: 'unfurl_referral_links_dispatcher',
    })
    const cursor = jobs
      .map(job => (job.data as { cursor?: UnfurlDispatchCursor }).cursor)
      .find(cursor => cursor?.afterId === ids[0])!
    const later = await insertTestUserReferralProgramLink({
      userId: owner.id,
      referralProgramId,
      urlId: await createTestUrlWithHostname(),
    })
    await markReferralLinkUnfurlRequested(later)
    expect(await dispatchUnfurlReferralLinks(cursor)).toEqual({ count: 1, hasMore: true })
    expect(await dispatchUnfurlReferralLinks({ ...cursor, afterId: ids[1] })).toEqual({
      count: 1,
      hasMore: false,
    })
    for (const parentLinkId of ids)
      expect(
        await unfurlReferralLinksQueue.searchJobs({
          name: 'unfurl_referral_link',
          data: { parentLinkId },
        }),
      ).toHaveLength(1)
    expect(
      await unfurlReferralLinksQueue.searchJobs({
        name: 'unfurl_referral_link',
        data: { parentLinkId: later },
      }),
    ).toEqual([])
  })
})
