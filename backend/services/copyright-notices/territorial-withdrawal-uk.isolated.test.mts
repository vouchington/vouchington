import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { seedCommittedTerritorialAcknowledgment } from '@voucha/test-helpers/copyright-territorial-acknowledged-fixture'
import {
  assertUkWithdrawalReview,
  prepareUkWithdrawalContinuation,
  completeUkWithdrawalContinuation,
} from '@voucha/test-helpers/copyright-uk-withdrawal-outcome'
import { noticeRequest, target } from '@voucha/test-helpers/copyright-withdrawal-owned-inputs'
import {
  receiveUkCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
} from './index.mts'

describe('UK approval withdrawal keeps received-case duties', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('allows UK review on a received notice after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, ukImage] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
    ])
    const ukApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const ukRequest = noticeRequest()
    const uk = await receiveUkCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      ukRequest,
    )
    await seedCommittedTerritorialAcknowledgment('uk', uk.notice_id)
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, ukApproval.id)
    const outcome = await assertUkWithdrawalReview({
      staff,
      claimant,
      claimantContact: ukRequest.contact,
      noticeId: uk.notice_id,
      posts: [ukImage],
      targets: [target(ukImage)],
    })
    expect(outcome.allowedOutcomes).toContainEqual(outcome.observed)
  })

  it('keeps UK redress and physical restoration duties after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    const ukApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const ukContinuation = await prepareUkWithdrawalContinuation(claimant, staff)
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, ukApproval.id)
    expect(
      (await getCopyrightNoticePrivateAggregate(ukContinuation.noticeId))?.restrictions,
    ).toHaveLength(1)
    await completeUkWithdrawalContinuation(ukContinuation)
  })
})
