import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { insertTestUnfurlDispatchPlanLinks } from '@voucha/test-helpers/entities/unfurl-dispatch-plans'
import {
  markReferralLinkUnfurlRequested,
  markReferralLinkUnfurlCompleted,
  markReferralLinkUnfurlFailed,
} from '@services/user-referral-program-links/unfurl-state'
import {
  PRIORITY_DEFAULT,
  UNFURL_REFERRAL_LINKS_DEFAULTS,
  UNFURL_REFERRAL_LINKS_ORDERING,
} from '@queues/unfurl-referral-links/config'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import type { UnfurlDispatchCursor } from '@queues/unfurl-referral-links/types'
import { dispatchUnfurlReferralLinks } from './dispatch.mts'
import { referralUnfurlDispatchConfig } from './work-limits.mts'

function jobParentLinkId(job: { data: unknown }): string | undefined {
  return (job.data as { parentLinkId?: string } | null)?.parentLinkId
}

describe('dispatchUnfurlReferralLinks', () => {
  let userId: string
  let referralProgramId: string

  beforeAll(async () => {
    const user = await createTestUserDirect()
    userId = user!.id
    referralProgramId = await insertTestReferralProgram({ createdById: userId })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([referralUnfurlDispatchConfig])
  })

  async function createLink(): Promise<string> {
    const urlId = await createTestUrlWithHostname()
    return insertTestUserReferralProgramLink({ userId, referralProgramId, urlId })
  }

  it('enqueues the requested-only link, skipping completed/failed/never-requested links', async () => {
    const requestedOnly = await createLink()
    await markReferralLinkUnfurlRequested(requestedOnly)

    const requestedAndCompleted = await createLink()
    await markReferralLinkUnfurlRequested(requestedAndCompleted)
    await markReferralLinkUnfurlCompleted(requestedAndCompleted)

    const requestedAndFailed = await createLink()
    await markReferralLinkUnfurlRequested(requestedAndFailed)
    await markReferralLinkUnfurlFailed(requestedAndFailed, 'sentinel failure')

    const neverRequested = await createLink()

    const totalEnqueued = await dispatchUnfurlReferralLinks()
    expect(totalEnqueued.count).toBeGreaterThanOrEqual(1)

    const jobs = await readAllQueueJobs(unfurlReferralLinksQueue)
    const enqueuedLinkIds = new Set(jobs.map(jobParentLinkId))

    expect(enqueuedLinkIds.has(requestedOnly)).toBe(true)
    expect(enqueuedLinkIds.has(requestedAndCompleted)).toBe(false)
    expect(enqueuedLinkIds.has(requestedAndFailed)).toBe(false)
    expect(enqueuedLinkIds.has(neverRequested)).toBe(false)
  })

  it('enqueues each batch with per-parent options and saves progress once per batch', async () => {
    // Future-dated rows keep the fixed sweep window on this test's own links.
    const requestedAtMs = Date.now() + 3 * 86_400_000 + Math.floor(Math.random() * 86_400_000)
    const requestedAt = new Date(requestedAtMs).toISOString()
    const nilId = '00000000-0000-0000-0000-000000000000'
    const ids = await insertTestUnfurlDispatchPlanLinks({
      userId,
      referralProgramId,
      urlIds: await Promise.all(Array.from({ length: 3 }, () => createTestUrlWithHostname())),
      requestedAt,
    })
    const restoreLimits = overrideDynamicConfigFieldsForTest(referralUnfurlDispatchConfig, {
      batch_size: 2,
      max_rows_per_run: 3,
    })
    const savedCursors: UnfurlDispatchCursor[] = []
    try {
      const result = await dispatchUnfurlReferralLinks(
        {
          sweepStartedAt: requestedAt,
          after: {
            requestedAt: new Date(requestedAtMs - 1).toISOString(),
            id: nilId,
          },
        },
        async cursor => {
          savedCursors.push(cursor)
        },
      )
      expect(result.count).toBe(3)
    } finally {
      restoreLimits()
    }

    // The initial sweep marker, then one save per batch of 2 and 1, each at its batch's last row.
    expect(savedCursors.map(cursor => cursor.after?.id)).toEqual([nilId, ids[1], ids[2]])
    for (const parentLinkId of ids) {
      const jobs = await unfurlReferralLinksQueue.searchJobs({
        name: 'unfurl_referral_link',
        data: { parentLinkId },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        priority: PRIORITY_DEFAULT,
        ordering: UNFURL_REFERRAL_LINKS_ORDERING.unfurl,
        deduplication: {
          id: `unfurl_referral_link__${parentLinkId}`,
          mode: 'debounce',
          ttl: UNFURL_REFERRAL_LINKS_DEFAULTS.deduplicationTtlMs,
        },
      })
    }
  })
})
