import {
  actionIntent,
  createWithdrawalContinuation,
  completeWithdrawalContinuation,
  noticeRequest,
  euNoticeRequest,
  target,
} from '@voucha/test-helpers/copyright-withdrawal-owned-inputs'
import { assertRenewedTerritorialOutcome } from '@voucha/test-helpers/copyright-renewed-territorial-outcome'
import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import { seedCommittedTerritorialRedressDecision } from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { assertCommittedEuWithdrawalContinuity as assertTestEuWithdrawalContinuity } from '@voucha/test-helpers/copyright-eu-withdrawal-subject'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { prepareTestEuWithdrawalGuestCase } from '@voucha/test-helpers/copyright-eu-withdrawal-continuity'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import {
  acknowledgeEuCopyrightNotice,
  acknowledgeUkCopyrightNotice,
  processCopyrightActionIntent,
  getCopyrightJurisdictionAvailability,
  receiveEuCopyrightNotice,
  receiveUkCopyrightNotice,
  recordEuCopyrightAcknowledgmentFailure,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  recordEuCopyrightSupervisedComplaint,
  recordUkCopyrightRedressDecision,
  recordUkCopyrightReview,
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
  submitEuCopyrightRedress,
  submitUkCopyrightRedress,
} from './index.mts'
import { receiveTerritorialCopyrightNoticeInTransaction } from './territorial-notice-receipt.mts'
import {
  readCopyrightTerritorialContractShape,
  withRolledBackTerritorialTransaction,
} from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'

describe('territorial approval withdrawal keeps received-case duties', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('gates new EU and UK intake while pending and decided notices continue', async () => {
    installTestMediaDeliveryEdge()
    const [
      administrator,
      staff,
      claimant,
      euAImage,
      euCImage,
      euDImage,
      euContinuationImage,
      ukImage,
    ] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
      createHostedImagePost('public'),
      createHostedImagePost('public'),
      createHostedImagePost('public'),
      createHostedImagePost('public'),
    ])
    const euApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const ukApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    await expect(getCopyrightJurisdictionAvailability()).resolves.toEqual({
      eu_dsa: true,
      uk: true,
    })

    const euA = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    const euB = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    const euC = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    const euDRequest = euNoticeRequest()
    const euD = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euDRequest,
    )
    const uk = await receiveUkCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      noticeRequest(),
    )
    await acknowledgeEuCopyrightNotice(claimant, euA.notice_id)
    await acknowledgeEuCopyrightNotice(claimant, euC.notice_id)
    await acknowledgeEuCopyrightNotice(claimant, euD.notice_id)
    await acknowledgeUkCopyrightNotice(claimant, uk.notice_id)
    await recordEuCopyrightStatementOfReasons(staff, euA.notice_id, {
      text: 'The hosted image infringes the identified work.',
      publicExplanation: 'This post image contains the claimant’s protected work.',
      outcome: 'restrict',
      targets: [target(euAImage)],
    })
    await expect(
      processCopyrightActionIntent((await actionIntent(euA.notice_id, 'withhold')).id),
    ).resolves.toBe('applied')
    await seedCommittedTerritorialDecision('eu_dsa', staff, euD.notice_id, {
      text: 'The supplied evidence does not identify infringement.',
      publicExplanation: 'The notice did not establish that this image infringes.',
      outcome: 'no_action',
      targets: [],
    })
    const euDComplaint = await submitEuCopyrightRedress(
      claimant,
      euD.notice_id,
      crypto.randomUUID(),
      'Please reconsider the no-action decision.',
    )
    const { euContinuation, continuationComplaint } = await createWithdrawalContinuation(
      claimant,
      staff,
    )
    const euGuest = await prepareTestEuWithdrawalGuestCase()
    await withRolledBackTerritorialTransaction(async transaction => {
      await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id, {
        query: transaction,
      })
      await expect(
        receiveTerritorialCopyrightNoticeInTransaction(
          { user: claimant, identity: `user:${claimant.id}` },
          'eu_dsa',
          crypto.randomUUID(),
          euNoticeRequest(),
          transaction,
          [euApproval.id],
        ),
      ).rejects.toMatchObject({ status: 403, message: 'EU copyright notices are not available' })
    })
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id)
    await assertTestEuWithdrawalContinuity({
      staff,
      notifier: claimant,
      restrictedNoticeId: euA.notice_id,
      guest: euGuest,
    })

    const failure = await recordEuCopyrightAcknowledgmentFailure(staff, euB.notice_id)
    expect(failure.attempt_count).toBe(1)
    const acknowledgment = await acknowledgeEuCopyrightNotice(claimant, euB.notice_id)
    expect(acknowledgment.acknowledged_at).toBeInstanceOf(Date)
    await recordEuCopyrightStatementOfReasons(staff, euC.notice_id, {
      text: 'The notice identifies the work and the infringing hosted image.',
      publicExplanation: 'This post image reproduces the claimant’s work.',
      outcome: 'restrict',
      targets: [target(euCImage)],
    })
    const euCState = await getCopyrightNoticePrivateAggregate(euC.notice_id)
    expect(euCState?.restrictions).toHaveLength(1)
    expect(euCState?.actionIntents.some(row => row.action === 'withhold')).toBe(true)
    const euCNotices = await readTestCopyrightStatementIntents(euC.notice_id)
    expect(euCNotices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivery_kind: 'poster_restriction_notice',
          channel: 'in_app',
          recipient_user_id: euCImage.poster.id,
        }),
        expect.objectContaining({
          delivery_kind: 'poster_restriction_notice',
          channel: 'email',
          recipient_user_id: euCImage.poster.id,
        }),
        expect.objectContaining({
          delivery_kind: 'claimant_decision_notice',
          channel: 'in_app',
          recipient_user_id: claimant.id,
        }),
      ]),
    )
    await expect(
      recordEuCopyrightSupervisedComplaint(claimant, euC.notice_id, {
        idempotencyKey: crypto.randomUUID(),
        authorityReference: `DSC-${crypto.randomUUID()}`,
        explanation: 'The notified decision merits supervisory review.',
      }),
    ).resolves.toMatchObject({ escalation_id: expect.any(String) })

    const euAComplaint = await submitEuCopyrightRedress(
      claimant,
      euA.notice_id,
      crypto.randomUUID(),
      'The first image should be restored.',
    )
    await recordEuCopyrightRedressDecision(staff, euA.notice_id, euAComplaint.id, {
      disposition: 'revoke',
      rationale: 'The restriction is reversed after complaint review.',
    })
    const euARestore = await actionIntent(euA.notice_id, 'restore')
    await expect(processCopyrightActionIntent(euARestore.id)).resolves.toBe('applied')
    expect(
      (await getCopyrightNoticePrivateAggregate(euA.notice_id))?.restrictions[0]?.lifted_at,
    ).toBeInstanceOf(Date)

    await seedCommittedTerritorialRedressDecision('eu_dsa', euD.notice_id, euDComplaint.id, staff, {
      disposition: 'revoke',
      rationale: 'The no-action decision was unfounded.',
    })
    expect((await getCopyrightNoticePrivateAggregate(euD.notice_id))?.actionIntents).toHaveLength(0)
    await assertRenewedTerritorialOutcome(
      {
        staff,
        claimant,
        claimantContact: euDRequest.notifierEmail,
        noticeId: euD.notice_id,
        posts: [euDImage],
        targets: [target(euDImage)],
      },
      {
        text: 'On renewed review the notice identifies infringement.',
        publicExplanation: 'The image reproduces the claimant’s work.',
        outcome: 'restrict',
        targets: [target(euDImage)],
      },
    )
    await completeWithdrawalContinuation(
      staff,
      euContinuation.notice_id,
      continuationComplaint.id,
      euContinuationImage,
    )
    await expect(
      readCopyrightTerritorialContractShape(euContinuation.notice_id),
    ).resolves.toMatchObject({
      eu_statement_count: 2,
      target_count: 1,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(euContinuation.notice_id))?.restrictions,
    ).toHaveLength(1)

    await withRolledBackTerritorialTransaction(async transaction => {
      await withdrawCopyrightJurisdictionPolicyApproval(administrator, ukApproval.id, {
        query: transaction,
      })
      await expect(
        receiveTerritorialCopyrightNoticeInTransaction(
          { user: claimant, identity: `user:${claimant.id}` },
          'uk',
          crypto.randomUUID(),
          noticeRequest(),
          transaction,
          [ukApproval.id],
        ),
      ).rejects.toMatchObject({ status: 403, message: 'UK copyright notices are not available' })
    })
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, ukApproval.id)
    await recordUkCopyrightReview(staff, uk.notice_id, {
      text: 'The UK notice identifies an infringing image.',
      publicExplanation: 'This post image reproduces the protected work.',
      outcome: 'restrict',
      targets: [target(ukImage)],
    })
    expect((await getCopyrightNoticePrivateAggregate(uk.notice_id))?.restrictions).toHaveLength(1)
    await expect(
      processCopyrightActionIntent((await actionIntent(uk.notice_id, 'withhold')).id),
    ).resolves.toBe('applied')
    const ukComplaint = await submitUkCopyrightRedress(
      claimant,
      uk.notice_id,
      crypto.randomUUID(),
      'The UK restriction should be reversed.',
    )
    await recordUkCopyrightRedressDecision(staff, uk.notice_id, ukComplaint.id, {
      disposition: 'revoke',
      rationale: 'The UK restriction is reversed.',
    })
    await expect(
      processCopyrightActionIntent((await actionIntent(uk.notice_id, 'restore')).id),
    ).resolves.toBe('applied')
    expect(
      (await getCopyrightNoticePrivateAggregate(uk.notice_id))?.restrictions[0]?.lifted_at,
    ).toBeInstanceOf(Date)
  })
})
