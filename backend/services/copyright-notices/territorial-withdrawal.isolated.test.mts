import { assertWithdrawalWithhold } from '@voucha/test-helpers/copyright-withdrawal-action-duties'
import { assertWithdrawalAcknowledgment } from '@voucha/test-helpers/copyright-withdrawal-ack-outcome'
import { assertWithdrawalSupervisedComplaint } from '@voucha/test-helpers/copyright-withdrawal-supervised-outcome'
import {
  prepareEuWithdrawalDuties,
  assertEuWithdrawalNoticeDuties,
  assertEuWithdrawalRedressActors,
  completeEuWithdrawalRestoration,
} from '@voucha/test-helpers/copyright-withdrawal-eu-duties'
import { seedCommittedTerritorialAcknowledgment } from '@voucha/test-helpers/copyright-territorial-acknowledged-fixture'
import {
  noticeRequest,
  euNoticeRequest,
  target,
} from '@voucha/test-helpers/copyright-withdrawal-owned-inputs'
import { assertRenewedTerritorialOutcome } from '@voucha/test-helpers/copyright-renewed-territorial-outcome'
import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { assertCommittedEuWithdrawalContinuity as assertTestEuWithdrawalContinuity } from '@voucha/test-helpers/copyright-eu-withdrawal-subject'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { prepareTestEuWithdrawalGuestCase } from '@voucha/test-helpers/copyright-eu-withdrawal-continuity'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  getCopyrightJurisdictionAvailability,
  receiveEuCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
} from './index.mts'
import { receiveTerritorialCopyrightNoticeInTransaction } from './territorial-notice-receipt.mts'
import { withRolledBackTerritorialTransaction } from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'

describe('territorial approval withdrawal keeps received-case duties', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('gates EU and UK intake after withdrawal and acknowledges a received EU notice', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
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

    const euB = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
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
    await assertWithdrawalAcknowledgment(staff, euB.notice_id, true)
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
  })

  it('keeps EU participant, dispute-settlement and guest-email duties after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, euAImage] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
    ])
    const euApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const euA = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    await seedCommittedTerritorialAcknowledgment('eu_dsa', euA.notice_id)
    await seedCommittedTerritorialDecision('eu_dsa', staff, euA.notice_id, {
      text: 'The hosted image infringes the identified work.',
      publicExplanation: 'This post image contains the claimant’s protected work.',
      outcome: 'restrict',
      targets: [target(euAImage)],
    })
    await assertWithdrawalWithhold(euA.notice_id, euAImage.poster.id)
    const euGuest = await prepareTestEuWithdrawalGuestCase()
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id)
    const participantOutcome = await assertTestEuWithdrawalContinuity({
      staff,
      notifier: claimant,
      restrictedNoticeId: euA.notice_id,
      guest: euGuest,
    })
    expect(participantOutcome).toBe('restrict')
  })

  it('allows a first EU decision on a received notice after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, euCImage] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
    ])
    const euApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const euCRequest = euNoticeRequest()
    const euC = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euCRequest,
    )
    await seedCommittedTerritorialAcknowledgment('eu_dsa', euC.notice_id)
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id)
    const outcome = await assertRenewedTerritorialOutcome(
      {
        staff,
        claimant,
        claimantContact: euCRequest.notifierEmail,
        noticeId: euC.notice_id,
        posts: [euCImage],
        targets: [target(euCImage)],
      },
      {
        text: 'The notice identifies the work and the infringing hosted image.',
        publicExplanation: 'This post image reproduces the claimant’s work.',
        outcome: 'restrict',
        targets: [target(euCImage)],
      },
    )
    expect(outcome.allowedOutcomes).toContainEqual(outcome.observed)
  })

  it('allows renewed EU review after revoking a no-action decision after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, euDImage] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
    ])
    const euApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const euDRequest = euNoticeRequest()
    const euD = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euDRequest,
    )
    await seedCommittedTerritorialAcknowledgment('eu_dsa', euD.notice_id)
    await seedCommittedTerritorialDecision('eu_dsa', staff, euD.notice_id, {
      text: 'The supplied evidence does not identify infringement.',
      publicExplanation: 'The notice did not establish that this image infringes.',
      outcome: 'no_action',
      targets: [],
    })
    const euDComplaint = await seedCommittedTerritorialRedress(
      'eu_dsa',
      euD.notice_id,
      claimant,
      'Please reconsider the no-action decision.',
    )
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id)
    await seedCommittedTerritorialRedressDecision('eu_dsa', euD.notice_id, euDComplaint.id, staff, {
      disposition: 'revoke',
      rationale: 'The no-action decision was unfounded.',
    })
    expect((await getCopyrightNoticePrivateAggregate(euD.notice_id))?.actionIntents).toHaveLength(0)
    const outcome = await assertRenewedTerritorialOutcome(
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
    expect(outcome.allowedOutcomes).toContainEqual(outcome.observed)
  })

  it('keeps EU notification, supervision, redress and restoration duties after withdrawal', async () => {
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, euAImage] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createHostedImagePost('public'),
    ])
    const euApproval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const euA = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    await seedCommittedTerritorialAcknowledgment('eu_dsa', euA.notice_id)
    await seedCommittedTerritorialDecision('eu_dsa', staff, euA.notice_id, {
      text: 'The hosted image infringes the identified work.',
      publicExplanation: 'This post image contains the claimant’s protected work.',
      outcome: 'restrict',
      targets: [target(euAImage)],
    })
    const euDuties = await prepareEuWithdrawalDuties(claimant, staff)
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, euApproval.id)
    await assertWithdrawalAcknowledgment(claimant, euDuties.failedNoticeId, false)
    expect(euDuties.notification.acknowledgment.acknowledged_at).toBeInstanceOf(Date)
    await assertEuWithdrawalNoticeDuties(euDuties)
    await assertWithdrawalSupervisedComplaint(claimant, euDuties.notification.noticeId)
    await assertEuWithdrawalRedressActors(euDuties, euA.notice_id)
    await completeEuWithdrawalRestoration(euDuties)
  })
})
