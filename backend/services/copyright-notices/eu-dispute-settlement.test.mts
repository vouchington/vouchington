import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import {
  deleteTestEuDisputeSettlementOutcome,
  eraseTestEuDisputeSettlementReferralActors,
  eraseTestEuDisputeSettlementOutcomeRecorder,
  deleteTestEuDisputeSettlementReferral,
  insertTestEuDisputeSettlementEarlyOutcome,
  prematurelyImplementTestEuDisputeSettlementOutcome,
  rewriteTestEuDisputeSettlementOutcome,
  rewriteTestEuDisputeSettlementReferral,
} from '@voucha/test-helpers/copyright-eu-dispute-settlement'
import { recordEuCopyrightStatementOfReasons } from './eu-reasons.mts'
import {
  recordEuDisputeSettlementReferral,
  recordEuDisputeSettlementOutcome,
  recordEuDisputeSettlementImplementation,
} from './eu-dispute-settlement.mts'

async function decidedScene() {
  const scene = await createTestTerritorialRestrictionScene('eu_dsa')
  await recordEuCopyrightStatementOfReasons(scene.staff, scene.noticeId, {
    text: 'The photographed work is reproduced on this post.',
    publicExplanation: 'The image reproduces the protected photograph.',
    outcome: 'restrict',
    targets: scene.targets,
  })
  return scene
}

const referralInput = (userId: string) => ({
  bodyName: 'Independent Dispute Body',
  referredAt: new Date(),
  referredByParty: 'poster' as const,
  referredByUserId: userId,
})

describe('EU out-of-court dispute settlement record', () => {
  it('records a poster referral, one outcome, and a later implementation without changing the decision', async () => {
    const scene = await decidedScene()
    const posterId = scene.posts[0]!.poster.id
    const referral = await recordEuDisputeSettlementReferral(
      scene.staff,
      scene.noticeId,
      referralInput(posterId),
    )
    const decidedAt = new Date(Date.now() + 1_000)
    const outcome = await recordEuDisputeSettlementOutcome(
      scene.staff,
      scene.noticeId,
      referral.id,
      {
        result: 'decided_for_recipient',
        decidedAt,
      },
    )
    expect(outcome.implemented_at).toBeNull()
    await expect(
      recordEuDisputeSettlementOutcome(scene.staff, scene.noticeId, referral.id, {
        result: 'decided_for_platform',
        decidedAt,
      }),
    ).rejects.toMatchObject({ status: 409 })
    const implementedAt = new Date(decidedAt.getTime() + 1_000)
    const implemented = await recordEuDisputeSettlementImplementation(
      scene.staff,
      scene.noticeId,
      referral.id,
      implementedAt,
    )
    expect(implemented.implemented_at).toEqual(implementedAt)
    await expect(
      recordEuDisputeSettlementImplementation(
        scene.staff,
        scene.noticeId,
        referral.id,
        implementedAt,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('requires staff, a decision, and a real poster of this notice', async () => {
    const scene = await createTestTerritorialRestrictionScene('eu_dsa')
    const stranger = await createTestUser()
    await expect(
      recordEuDisputeSettlementReferral(
        stranger,
        scene.noticeId,
        referralInput(scene.posts[0]!.poster.id),
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      recordEuDisputeSettlementReferral(
        scene.staff,
        scene.noticeId,
        referralInput(scene.posts[0]!.poster.id),
      ),
    ).rejects.toMatchObject({ status: 404 })
    await recordEuCopyrightStatementOfReasons(scene.staff, scene.noticeId, {
      text: 'The photograph is reproduced on this post.',
      publicExplanation: 'The image reproduces the protected photograph.',
      outcome: 'restrict',
      targets: scene.targets,
    })
    await expect(
      recordEuDisputeSettlementReferral(scene.staff, scene.noticeId, referralInput(stranger.id)),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects an early outcome and implementation of a platform-favorable outcome', async () => {
    const scene = await decidedScene()
    const referredAt = new Date()
    const referral = await recordEuDisputeSettlementReferral(scene.staff, scene.noticeId, {
      ...referralInput(scene.posts[0]!.poster.id),
      referredAt,
    })
    const earlier = new Date(referredAt.getTime() - 1_000)
    await expect(
      recordEuDisputeSettlementOutcome(scene.staff, scene.noticeId, referral.id, {
        result: 'decided_for_recipient',
        decidedAt: earlier,
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      insertTestEuDisputeSettlementEarlyOutcome(referral.id, earlier),
    ).rejects.toMatchObject({ code: '23514' })
    await recordEuDisputeSettlementOutcome(scene.staff, scene.noticeId, referral.id, {
      result: 'decided_for_platform',
      decidedAt: new Date(referredAt.getTime() + 1_000),
    })
    await expect(
      recordEuDisputeSettlementImplementation(
        scene.staff,
        scene.noticeId,
        referral.id,
        new Date(referredAt.getTime() + 2_000),
      ),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('retains both records and allows only a recipient-favorable implementation update', async () => {
    const scene = await decidedScene()
    const referredAt = new Date()
    const referral = await recordEuDisputeSettlementReferral(scene.staff, scene.noticeId, {
      ...referralInput(scene.posts[0]!.poster.id),
      referredAt,
    })
    const decidedAt = new Date(referredAt.getTime() + 1_000)
    const outcome = await recordEuDisputeSettlementOutcome(
      scene.staff,
      scene.noticeId,
      referral.id,
      {
        result: 'decided_for_recipient',
        decidedAt,
      },
    )
    await expect(rewriteTestEuDisputeSettlementReferral(referral.id)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(deleteTestEuDisputeSettlementReferral(referral.id)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(rewriteTestEuDisputeSettlementOutcome(outcome.id)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(deleteTestEuDisputeSettlementOutcome(outcome.id)).rejects.toMatchObject({
      code: '23514',
    })
    await eraseTestEuDisputeSettlementReferralActors(referral.id)
    await eraseTestEuDisputeSettlementOutcomeRecorder(outcome.id)
    await expect(
      prematurelyImplementTestEuDisputeSettlementOutcome(
        outcome.id,
        new Date(decidedAt.getTime() - 1_000),
      ),
    ).rejects.toMatchObject({ code: '23514' })
    await recordEuDisputeSettlementImplementation(
      scene.staff,
      scene.noticeId,
      referral.id,
      new Date(decidedAt.getTime() + 1_000),
    )
  })
})
