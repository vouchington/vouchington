// This case changes the jurisdiction-wide approval gate and runs only in its own database.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withdrawAllTestTerritorialApprovals } from '@voucha/test-helpers/copyright-territorial-withdrawal'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import {
  acknowledgeEuCopyrightNotice,
  acknowledgeUkCopyrightNotice,
  processCopyrightActionIntent,
  receiveEuCopyrightNotice,
  receiveUkCopyrightNotice,
  recordEuCopyrightAcknowledgmentFailure,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  recordEuCopyrightSupervisedComplaint,
  recordUkCopyrightRedressDecision,
  recordUkCopyrightReview,
  recordCopyrightJurisdictionPolicyApproval,
  submitEuCopyrightRedress,
  submitUkCopyrightRedress,
} from './index.mts'
import { readCopyrightTerritorialContractShape } from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'

function noticeRequest() {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  }
}

function target(post: Awaited<ReturnType<typeof createHostedImagePost>>) {
  return {
    surfaceKind: 'post-image' as const,
    postId: post.postId,
    imageId: post.imageId,
    hostedUseUrl: `https://example.test/${post.postId}`,
  }
}

async function actionIntent(noticeId: string, action: 'withhold' | 'restore') {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const intent = aggregate?.actionIntents.find(row => row.action === action)
  if (!intent) throw new Error(`Missing ${action} intent for ${noticeId}`)
  return intent
}

describe('territorial approval withdrawal keeps received-case duties', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('gates new EU and UK intake while pending and decided notices continue', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-territorial-withdrawal') === 'parent') {
      await runIsolatedDatabaseCase('copyright-territorial-withdrawal')
      return
    }
    installTestMediaDeliveryEdge()
    const [administrator, staff, claimant, euAImage, euCImage, euDImage, ukImage] =
      await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser({ extraRoles: ['moderator'] }),
        createTestUser(),
        createHostedImagePost('public'),
        createHostedImagePost('public'),
        createHostedImagePost('public'),
        createHostedImagePost('public'),
      ])
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })

    const euA = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    const euB = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    const euC = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    const euD = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    const uk = await receiveUkCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
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
    await recordEuCopyrightStatementOfReasons(staff, euD.notice_id, {
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
    expect(await withdrawAllTestTerritorialApprovals(administrator, 'eu_dsa')).toBeGreaterThan(0)
    await expect(
      receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest()),
    ).rejects.toMatchObject({ status: 403, message: 'EU copyright notices are not available' })

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

    await recordEuCopyrightRedressDecision(staff, euD.notice_id, euDComplaint.id, {
      disposition: 'revoke',
      rationale: 'The no-action decision was unfounded.',
    })
    expect((await getCopyrightNoticePrivateAggregate(euD.notice_id))?.actionIntents).toHaveLength(0)
    await recordEuCopyrightStatementOfReasons(staff, euD.notice_id, {
      text: 'On renewed review the notice identifies infringement.',
      publicExplanation: 'The image reproduces the claimant’s work.',
      outcome: 'restrict',
      targets: [target(euDImage)],
    })
    await expect(readCopyrightTerritorialContractShape(euD.notice_id)).resolves.toMatchObject({
      eu_statement_count: 2,
      target_count: 1,
    })
    expect((await getCopyrightNoticePrivateAggregate(euD.notice_id))?.restrictions).toHaveLength(1)

    expect(await withdrawAllTestTerritorialApprovals(administrator, 'uk')).toBeGreaterThan(0)
    await expect(
      receiveUkCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest()),
    ).rejects.toMatchObject({ status: 403, message: 'UK copyright notices are not available' })
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
  }, 240_000)
})
