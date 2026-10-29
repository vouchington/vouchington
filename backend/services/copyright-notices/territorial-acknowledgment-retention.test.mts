import { describe, expect, it } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { createTestUser } from '@voucha/test-helpers'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { finishUkRetentionReplayDelivery } from '@voucha/test-helpers/entities/copyright-territorial-retention'
import { copyrightNoticeExists } from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import { readCopyrightRetentionCaseCreatedAt } from '@voucha/test-helpers/copyright-postroot-retention'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { receiveUkCopyrightNotice } from './uk-notice-receipt.mts'
import { acknowledgeUkCopyrightNotice } from './uk-acknowledgment.mts'
import { recordUkCopyrightReview } from './uk-review.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge.mts'

const WORK_PAGE_CAP = 128
const RETENTION_START = new Date('2029-10-23T00:00:00.000Z')

describe('territorial acknowledgment replay after case retention', () => {
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('keeps authorized live replays and returns 404 after the case root is purged', async () => {
    const [claimant, unrelated, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    await setClock(RETENTION_START)
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-retention-${crypto.randomUUID().slice(0, 8)}`,
    })
    const key = crypto.randomUUID()
    const request = {
      contact: `claimant-${crypto.randomUUID()}@example.test`,
      contentDescription: 'A photograph',
      grounds: 'The hosted use is not licensed.',
      hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
    }
    const requester = { user: claimant, identity: `user:${claimant.id}` }
    const first = await receiveUkCopyrightNotice(requester, key, request)
    // Production UUID issuance may remain ahead of this worker's reset Date clock.
    // Retain the real admission flow and age its recorded issuance fact independently.
    const createdAt = await readCopyrightRetentionCaseCreatedAt(first.notice_id)
    const lastActivity = new Date(Math.max(RETENTION_START.getTime(), createdAt.getTime()))
    const retentionEnd = shiftUtcCalendarMonths(lastActivity, 72)

    await expect(acknowledgeUkCopyrightNotice(unrelated, first.notice_id)).rejects.toMatchObject({
      status: 403,
    })
    const acknowledgment = await acknowledgeUkCopyrightNotice(claimant, first.notice_id)
    expect(acknowledgment).not.toHaveProperty('requester_user_id')
    await expect(acknowledgeUkCopyrightNotice(claimant, first.notice_id)).resolves.toEqual(
      acknowledgment,
    )
    await expect(acknowledgeUkCopyrightNotice(staff, first.notice_id)).resolves.toEqual(
      acknowledgment,
    )
    await expect(acknowledgeUkCopyrightNotice(unrelated, first.notice_id)).rejects.toMatchObject({
      status: 403,
    })

    const liveReplay = await receiveUkCopyrightNotice(requester, key, request)
    expect(liveReplay).toEqual({ ...first, is_duplicate: true })
    await recordUkCopyrightReview(staff, first.notice_id, {
      text: 'Reviewed and no restriction required.',
      publicExplanation: 'No action taken.',
      outcome: 'no_action',
      targets: [],
    })
    await finishUkRetentionReplayDelivery(first.notice_id)

    await setClock(retentionEnd)
    const erasurePages = await advanceCopyrightRetentionWorkPages(first.notice_id, WORK_PAGE_CAP)
    expect(erasurePages).toContain('erased')
    await expect(copyrightNoticeExists(first.notice_id)).resolves.toBe(true)

    await expect(
      purgeCopyrightMinimalRecord(first.notice_id, {
        now: retentionEnd,
        cutoff: lastActivity,
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('purged')
    await expect(copyrightNoticeExists(first.notice_id)).resolves.toBe(false)

    await expect(receiveUkCopyrightNotice(requester, key, request)).rejects.toMatchObject({
      status: 404,
    })
    await expect(acknowledgeUkCopyrightNotice(claimant, first.notice_id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(acknowledgeUkCopyrightNotice(staff, first.notice_id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(acknowledgeUkCopyrightNotice(unrelated, first.notice_id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
