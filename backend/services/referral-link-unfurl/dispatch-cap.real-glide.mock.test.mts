import { afterAll, describe, expect, it, vi, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundCpu as unfurlReferralLinksQueue } from '@queues/background-cpu/queues'
import { getDateFromUUIDv7, mintUUIDv7 } from '@modules/utils'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import { insertTestUnfurlDispatchPlanLinks } from '@voucha/test-helpers/entities/unfurl-dispatch-plans'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import type { UnfurlDispatchCursor } from '@queues/unfurl-referral-links/types'
import { referralUnfurlDispatchConfig } from './work-limits.mts'
import { dispatchUnfurlReferralLinks } from './dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())
const UNFURL_JOB_NAME = 'crawl.unfurl_referral_link'

describe('bounded referral unfurl dispatch', () => {
  afterAll(() => unfurlReferralLinksQueue.close())

  it('resumes still-requested rows while excluding new requests from the fixed sweep', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const ownerCreatedAt = getDateFromUUIDv7(owner.id)
    if (!ownerCreatedAt) throw new Error('Expected owned native UUIDv7 anchor')
    const requestedAt = new Date(ownerCreatedAt.getTime() + 86_400_000).toISOString()
    const sweepStartedAt = requestedAt
    const urls = await Promise.all(Array.from({ length: 3 }, () => createTestUrlWithHostname()))
    const ids = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urls,
      requestedAt,
    })
    const [excluded] = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: [await createTestUrlWithHostname()],
      requestedAt,
    })
    const after = {
      requestedAt: new Date(new Date(requestedAt).getTime() - 1).toISOString(),
      id: ids[0],
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(referralUnfurlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      }),
    )
    const savedCursors: UnfurlDispatchCursor[] = []
    expect(
      await dispatchUnfurlReferralLinks(
        { sweepStartedAt, after },
        async next => {
          savedCursors.push(next)
        },
        { referralLinkIds: ids },
      ),
    ).toEqual({ count: 1, hasMore: true })
    const cursor = savedCursors.at(-1)!
    expect(cursor.after?.id).toBe(ids[0])
    const [later] = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: [await createTestUrlWithHostname()],
      requestedAt: new Date(new Date(requestedAt).getTime() + 1).toISOString(),
    })
    const options = { referralLinkIds: [...ids, later] }
    expect(await dispatchUnfurlReferralLinks(cursor, undefined, options)).toEqual({
      count: 1,
      hasMore: true,
    })
    expect(
      await dispatchUnfurlReferralLinks(
        { ...cursor, after: { requestedAt, id: ids[1] } },
        undefined,
        options,
      ),
    ).toEqual({
      count: 1,
      hasMore: false,
    })
    for (const parentLinkId of ids)
      expect(
        await unfurlReferralLinksQueue.searchJobs({
          name: UNFURL_JOB_NAME,
          data: { parentLinkId },
        }),
      ).toHaveLength(1)
    expect(
      await unfurlReferralLinksQueue.searchJobs({
        name: UNFURL_JOB_NAME,
        data: { parentLinkId: later },
      }),
    ).toEqual([])
    expect(
      await unfurlReferralLinksQueue.searchJobs({
        name: UNFURL_JOB_NAME,
        data: { parentLinkId: excluded },
      }),
    ).toEqual([])
  })
  it('uses the pending timestamp index for sparse due work among later requests on older links', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const base = (await insertTestUrlDirect(owner.id, `https://${mintUUIDv7()}.example.com/base`))!
    const urlIds = Array.from({ length: 6 }, () => mintUUIDv7())
    await insertTestCrawlDispatchPlanUrls({
      ids: urlIds,
      hostname: base.hostname.hostname,
      hostnameId: base.hostname.id,
      actorId: owner.id,
    })
    const baseCreatedAt = getDateFromUUIDv7(base.id)
    if (!baseCreatedAt) throw new Error('Expected owned native UUIDv7 anchor')
    const dueAt = new Date(baseCreatedAt.getTime() + 172_800_000).toISOString()
    const later = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(0, 3),
      requestedAt: new Date(new Date(dueAt).getTime() + 1).toISOString(),
    })
    const ids = await insertTestUnfurlDispatchPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(3),
      requestedAt: dueAt,
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(referralUnfurlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      }),
    )
    const captured = await withCapturedTestQueries(() =>
      dispatchUnfurlReferralLinks(
        {
          sweepStartedAt: dueAt,
          after: { requestedAt: new Date(new Date(dueAt).getTime() - 1).toISOString(), id: ids[0] },
        },
        undefined,
        { referralLinkIds: [...ids, ...later] },
      ),
    )
    expect(captured.result).toEqual({ count: 1, hasMore: true })
    expect(
      captured.queries.some(query => query.text.startsWith('/* dispatchUnfurlReferralLinks */')),
    ).toBe(true)
  })
})
