import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import {
  readCopyrightReplayRetentionGroup,
  readCopyrightReplayRetentionGroupId,
  tryDeleteCopyrightReplayIdentityAt,
} from '@voucha/test-helpers/copyright-replay-retention-window'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import { receiveUkCopyrightNotice } from './uk-notice-receipt.mts'
import { acknowledgeUkCopyrightNotice } from './uk-acknowledgment.mts'
import { recordUkCopyrightReview } from './uk-review.mts'
import { finishUkRetentionReplayDelivery } from '@voucha/test-helpers/entities/copyright-territorial-retention'
import { copyrightNoticeExists } from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge.mts'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'

const WORK_PAGE_CAP = 128
const RETENTION_START = new Date('2029-10-23T00:00:00.000Z')
const RETENTION_END = new Date('2035-10-23T00:00:00.000Z')
const LAST_REPLAY_AT = new Date('2036-02-01T00:00:00.000Z')

describe('copyright replay retention after minimal case purge', () => {
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('touches only authorized post-purge replays and expires from the later replay clock', async () => {
    const [claimant, unrelated, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    await setClock(RETENTION_START)
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-replay-window-${crypto.randomUUID().slice(0, 8)}`,
    })
    const idempotencyKey = crypto.randomUUID()
    const request = {
      contact: `claimant-${crypto.randomUUID()}@example.test`,
      contentDescription: 'A photograph',
      grounds: 'The hosted use is not licensed.',
      hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
    }
    const requester = { user: claimant, identity: `user:${claimant.id}` }
    const first = await receiveUkCopyrightNotice(requester, idempotencyKey, request)
    const acknowledgment = await acknowledgeUkCopyrightNotice(claimant, first.notice_id)
    await expect(acknowledgeUkCopyrightNotice(claimant, first.notice_id)).resolves.toEqual(
      acknowledgment,
    )
    await expect(acknowledgeUkCopyrightNotice(unrelated, first.notice_id)).rejects.toMatchObject({
      status: 403,
    })
    await recordUkCopyrightReview(staff, first.notice_id, {
      text: 'Reviewed and no restriction required.',
      publicExplanation: 'No action taken.',
      outcome: 'no_action',
      targets: [],
    })
    await finishUkRetentionReplayDelivery(first.notice_id)

    const groupId = await readCopyrightReplayRetentionGroupId(first.notice_id)
    if (!groupId) throw new Error('Replay retention group fixture missing')
    const beforePurge = await readCopyrightReplayRetentionGroup(groupId)
    expect(beforePurge).toMatchObject({
      case_purged_at: null,
      has_live_notice: true,
      receipt_count: 2,
      identities: expect.arrayContaining([
        expect.objectContaining({ family: 'territorial_notice', outcome_code: 'notice_received' }),
        expect.objectContaining({
          family: 'territorial_acknowledgment',
          outcome_code: 'acknowledgment_recorded',
        }),
      ]),
    })

    await setClock(RETENTION_END)
    expect(await advanceCopyrightRetentionWorkPages(first.notice_id)).toContain('erased')
    await expect(copyrightNoticeExists(first.notice_id)).resolves.toBe(true)
    await expect(
      purgeCopyrightMinimalRecord(first.notice_id, {
        now: RETENTION_END,
        cutoff: RETENTION_START,
        maxBatches: WORK_PAGE_CAP,
      }),
    ).resolves.toBe('purged')
    await expect(copyrightNoticeExists(first.notice_id)).resolves.toBe(false)
    const afterPurge = await readCopyrightReplayRetentionGroup(groupId)
    expect(afterPurge).toMatchObject({
      case_purged_at: RETENTION_END,
      has_live_notice: false,
      receipt_count: 0,
    })
    const acknowledgmentIdentity = afterPurge?.identities.find(
      identity => identity.family === 'territorial_acknowledgment',
    )
    if (!acknowledgmentIdentity) throw new Error('Acknowledgment replay identity was not retained')

    await setClock(new Date('2036-01-01T00:00:00.000Z'))
    await expect(acknowledgeUkCopyrightNotice(unrelated, first.notice_id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(readCopyrightReplayRetentionGroup(groupId)).resolves.toMatchObject({
      identities: expect.arrayContaining([
        expect.objectContaining({
          id: acknowledgmentIdentity.id,
          last_replayed_at: acknowledgmentIdentity.last_replayed_at,
        }),
      ]),
    })

    await setClock(LAST_REPLAY_AT)
    await expect(acknowledgeUkCopyrightNotice(claimant, first.notice_id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      receiveUkCopyrightNotice(requester, idempotencyKey, request),
    ).rejects.toMatchObject({
      status: 404,
    })
    const afterAuthorized404 = await readCopyrightReplayRetentionGroup(groupId)
    const touchedAcknowledgment = afterAuthorized404?.identities.find(
      identity => identity.family === 'territorial_acknowledgment',
    )
    expect(touchedAcknowledgment?.last_replayed_at).toEqual(LAST_REPLAY_AT)
    expect(
      afterAuthorized404?.identities.find(identity => identity.family === 'territorial_notice'),
    ).toMatchObject({ last_replayed_at: LAST_REPLAY_AT })

    const expiry = shiftUtcCalendarMonths(
      new Date(
        Math.max(
          afterAuthorized404!.case_purged_at!.getTime(),
          touchedAcknowledgment!.last_replayed_at.getTime(),
        ),
      ),
      120,
    )
    expect(
      await tryDeleteCopyrightReplayIdentityAt({
        identityId: touchedAcknowledgment!.id,
        groupId,
        purgeNow: new Date(expiry.getTime() - 1),
      }),
    ).toBe(false)
    expect(
      await tryDeleteCopyrightReplayIdentityAt({
        identityId: touchedAcknowledgment!.id,
        groupId,
        purgeNow: expiry,
      }),
    ).toBe(true)
    await expect(readCopyrightReplayRetentionGroup(groupId)).resolves.toMatchObject({
      has_live_notice: false,
      receipt_count: 0,
      identities: expect.not.arrayContaining([
        expect.objectContaining({ family: 'territorial_acknowledgment' }),
      ]),
    })
  })
})
