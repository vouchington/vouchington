import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  createTestCopyrightTrustedFlagger,
  readTestCopyrightTrustedFlaggerMatch,
  readTestTrustedFlaggerNoticeEffects,
  replayTestCopyrightTrustedFlaggerMatch,
} from '@voucha/test-helpers/copyright-trusted-flaggers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  approveJurisdictionPolicy,
  seedPendingTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import type { PrivateUser } from '@services/users/types'
import { receiveEuCopyrightNotice } from './eu-notice-receipt.mts'
import { recordCopyrightTrustedFlaggerChange } from './trusted-flaggers.mts'

async function fileEu(user: PrivateUser | null, key = crypto.randomUUID()) {
  const suffix = crypto.randomUUID()
  const request = {
    notifierName: `Notifier ${suffix}`,
    notifierEmail: `notifier-${suffix}@example.test`,
    goodFaithStatement: true as const,
    contact: `Contact ${suffix}`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/work/${suffix}`,
  }
  const requester = { user, identity: user ? `user:${user.id}` : `guest:${suffix}` }
  return {
    receipt: await receiveEuCopyrightNotice(requester, key, request),
    requester,
    key,
    request,
  }
}

describe('EU trusted-flagger receipt attribution', () => {
  useCopyrightIntakeEnvironment()

  it('captures an eligible match while priority is off, without a decision or restriction', async () => {
    const administrator = await createTestUser({ administrator: true })
    const claimant = await createTestUser()
    await approveJurisdictionPolicy(administrator, 'eu_dsa')
    const entry = await createTestCopyrightTrustedFlagger(administrator, claimant.id)
    const filing = await fileEu(claimant)
    expect(await readTestCopyrightTrustedFlaggerMatch(filing.receipt.notice_id)).toEqual({
      flaggerId: entry.id,
      inArea: true,
    })
    expect(await readTestTrustedFlaggerNoticeEffects(filing.receipt.notice_id)).toEqual({
      hasDecision: false,
      hasRestriction: false,
    })
    const replay = await receiveEuCopyrightNotice(filing.requester, filing.key, filing.request)
    expect(replay).toMatchObject({ notice_id: filing.receipt.notice_id, is_duplicate: true })
    await replayTestCopyrightTrustedFlaggerMatch(filing.receipt.notice_id)
    expect(await readTestCopyrightTrustedFlaggerMatch(filing.receipt.notice_id)).toEqual({
      flaggerId: entry.id,
      inArea: true,
    })
  })

  it('uses the latest pre-receipt change, rejects future awards and never backfills older notices', async () => {
    const administrator = await createTestUser({ administrator: true })
    const claimant = await createTestUser()
    await approveJurisdictionPolicy(administrator, 'eu_dsa')
    const beforeEntry = await fileEu(claimant)
    const entry = await createTestCopyrightTrustedFlagger(administrator, claimant.id)
    await replayTestCopyrightTrustedFlaggerMatch(beforeEntry.receipt.notice_id)
    expect(await readTestCopyrightTrustedFlaggerMatch(beforeEntry.receipt.notice_id)).toBeNull()

    await recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
      changeType: 'suspended',
      reason: 'Commission list shows a suspension',
    })
    expect(
      await readTestCopyrightTrustedFlaggerMatch((await fileEu(claimant)).receipt.notice_id),
    ).toBeNull()
    await recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
      changeType: 'reinstated',
      reason: 'Commission list shows reinstatement',
    })
    const reinstated = await fileEu(claimant)
    expect(await readTestCopyrightTrustedFlaggerMatch(reinstated.receipt.notice_id)).toEqual({
      flaggerId: entry.id,
      inArea: true,
    })
    await recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
      changeType: 'revoked',
      reason: 'Commission list shows revocation',
    })
    expect(
      await readTestCopyrightTrustedFlaggerMatch((await fileEu(claimant)).receipt.notice_id),
    ).toBeNull()
    await replayTestCopyrightTrustedFlaggerMatch(reinstated.receipt.notice_id)
    expect(
      (await readTestCopyrightTrustedFlaggerMatch(reinstated.receipt.notice_id))?.flaggerId,
    ).toBe(entry.id)
    const futureClaimant = await createTestUser()
    await createTestCopyrightTrustedFlagger(
      administrator,
      futureClaimant.id,
      'intellectual_property',
      {
        awardedAt: '2099-01-01',
      },
    )
    expect(
      await readTestCopyrightTrustedFlaggerMatch((await fileEu(futureClaimant)).receipt.notice_id),
    ).toBeNull()
  })

  it('records out-of-area history but counts only intellectual-property matches', async () => {
    const administrator = await createTestUser({ administrator: true })
    const claimant = await createTestUser()
    await approveJurisdictionPolicy(administrator, 'eu_dsa')
    const other = await createTestCopyrightTrustedFlagger(administrator, claimant.id, 'other')
    const first = await fileEu(claimant)
    expect(await readTestCopyrightTrustedFlaggerMatch(first.receipt.notice_id)).toEqual({
      flaggerId: other.id,
      inArea: false,
    })
    const intellectualProperty = await createTestCopyrightTrustedFlagger(administrator, claimant.id)
    const second = await fileEu(claimant)
    expect(await readTestCopyrightTrustedFlaggerMatch(second.receipt.notice_id)).toEqual({
      flaggerId: intellectualProperty.id,
      inArea: true,
    })
  })

  it('leaves guest, unrelated-account and UK notices unmatched', async () => {
    const administrator = await createTestUser({ administrator: true })
    const linked = await createTestUser()
    const unrelated = await createTestUser()
    await approveJurisdictionPolicy(administrator, 'eu_dsa')
    await approveJurisdictionPolicy(administrator, 'uk')
    await createTestCopyrightTrustedFlagger(administrator, linked.id)
    const guest = await fileEu(null)
    const unrelatedEu = await fileEu(unrelated)
    const ukNoticeId = await seedPendingTerritorialNotice('uk', linked)
    expect(await readTestCopyrightTrustedFlaggerMatch(guest.receipt.notice_id)).toBeNull()
    expect(await readTestCopyrightTrustedFlaggerMatch(unrelatedEu.receipt.notice_id)).toBeNull()
    expect(await readTestCopyrightTrustedFlaggerMatch(ukNoticeId)).toBeNull()
  })
})
