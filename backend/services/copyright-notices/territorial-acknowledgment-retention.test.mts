import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { finishUkRetentionReplayDelivery } from '@voucha/test-helpers/entities/copyright-territorial-retention'
import { receiveUkCopyrightNotice } from './uk-notice-receipt.mts'
import { acknowledgeUkCopyrightNotice } from './uk-acknowledgment.mts'
import { recordUkCopyrightReview } from './uk-review.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import { eraseCopyrightRetentionCase } from './retention-erasure-case.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge-case.mts'

describe('territorial acknowledgment replay after case retention', () => {
  const configure = useCopyrightRetentionConfig()

  it('returns the same UK public receipt and acknowledgment after its case is purged', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const [claimant, unrelated, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
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
    const acknowledgment = await acknowledgeUkCopyrightNotice(claimant, first.notice_id)
    expect(await acknowledgeUkCopyrightNotice(claimant, first.notice_id)).toEqual(acknowledgment)
    expect(acknowledgment).not.toHaveProperty('requester_user_id')
    await recordUkCopyrightReview(staff, first.notice_id, {
      text: 'Reviewed and no restriction required.',
      publicExplanation: 'No action taken.',
      outcome: 'no_action',
      targets: [],
    })
    await finishUkRetentionReplayDelivery(first.notice_id)
    await expect(
      eraseCopyrightRetentionCase(first.notice_id, {
        now: new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1_000),
        cutoff: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1_000),
        retentionDays: 30,
      }),
    ).resolves.toBe('erased')
    const purgeNow = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1_000)
    const cutoff = new Date(purgeNow)
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3)
    const purgeOptions = { now: purgeNow, cutoff }
    const firstPage = await purgeCopyrightMinimalRecord(first.notice_id, purgeOptions)
    expect(firstPage).toBe('more')
    const resumedPages = [
      await purgeCopyrightMinimalRecord(first.notice_id, purgeOptions),
      await purgeCopyrightMinimalRecord(first.notice_id, purgeOptions),
      await purgeCopyrightMinimalRecord(first.notice_id, purgeOptions),
    ]
    expect(resumedPages.filter(outcome => outcome === 'purged')).toEqual(['purged'])

    const replay = await receiveUkCopyrightNotice(requester, key, request)
    const replayAcknowledgment = await acknowledgeUkCopyrightNotice(claimant, replay.notice_id)
    expect(replay).toEqual({ ...first, is_duplicate: true })
    expect(replayAcknowledgment).toEqual(acknowledgment)
    expect(replayAcknowledgment).not.toHaveProperty('requester_user_id')
    await expect(acknowledgeUkCopyrightNotice(unrelated, replay.notice_id)).rejects.toMatchObject({
      status: 403,
    })
  })
})
