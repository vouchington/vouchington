import { expect } from 'vitest'
import { recordUkCopyrightReview } from '../services/copyright-notices/uk-review.mts'
import { receiveUkCopyrightNotice } from '../services/copyright-notices/uk-notice-receipt.mts'
import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { submitUkCopyrightRedress } from '../services/copyright-notices/uk-redress.mts'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import {
  readTerritorialDecisionState,
  type TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import { territorialDecisionPlacements } from './copyright-territorial-decision-outcomes.mts'
import { territorialDecisionStages } from './copyright-territorial-decision-stages.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import { seedCommittedTerritorialRedressDecision } from './copyright-territorial-committed-redress.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { actionIntent, noticeRequest, target } from './copyright-withdrawal-owned-inputs.mts'
import type { PrivateUser } from '../services/users/types.mts'

const review = (post: Awaited<ReturnType<typeof createHostedImagePost>>) => ({
  text: 'The UK notice identifies an infringing image.',
  publicExplanation: 'This post image reproduces the protected work.',
  outcome: 'restrict' as const,
  targets: [target(post)],
})

/** Existing received-case authority survives policy withdrawal; each failed phase is fully atomic. */
export async function assertUkWithdrawalReview(scene: TerritorialRestrictionScene) {
  const input = review(scene.posts[0]!)
  const before = await readTerritorialDecisionState('uk', scene)
  const placements = await territorialDecisionPlacements(scene)
  const [result] = await Promise.allSettled([
    recordUkCopyrightReview(scene.staff, scene.noticeId, input),
  ])
  const after = await readTerritorialDecisionState('uk', scene)
  const stages = territorialDecisionStages(
    'uk',
    scene,
    input,
    before,
    after,
    placements,
    await isCopyrightStaydownMatchingEnabled(),
  )
  const conflict = {
    status: 'rejected',
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    causeCode: '40001',
  }
  expect([
    { outcome: conflict, state: before },
    ...stages.slice(0, -1).map(state => ({ outcome: conflict, state })),
    {
      outcome: {
        status: 'fulfilled',
        value: {
          id: after.decisions.at(-1)?.id,
          reviewed_at: expect.any(Date),
          automation_disclosure: 'human',
        },
      },
      state: stages.at(-1),
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
}

/** A separate committed received-case restriction keeps all downstream UK obligations executable. */
export async function prepareUkWithdrawalContinuation(claimant: PrivateUser, staff: PrivateUser) {
  const post = await createHostedImagePost('public')
  const notice = await receiveUkCopyrightNotice(
    { user: claimant, identity: `user:${claimant.id}` },
    crypto.randomUUID(),
    noticeRequest(),
  )
  await seedCommittedTerritorialAcknowledgment('uk', notice.notice_id)
  await seedCommittedTerritorialDecision('uk', staff, notice.notice_id, review(post))
  return { post, noticeId: notice.notice_id, claimant, staff }
}

export async function completeUkWithdrawalContinuation(
  scene: Awaited<ReturnType<typeof prepareUkWithdrawalContinuation>>,
) {
  expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions).toHaveLength(1)
  await expect(
    processCopyrightActionIntent((await actionIntent(scene.noticeId, 'withhold')).id),
  ).resolves.toBe('applied')
  const complaint = await submitUkCopyrightRedress(
    scene.claimant,
    scene.noticeId,
    crypto.randomUUID(),
    'The UK restriction should be reversed.',
  )
  await seedCommittedTerritorialRedressDecision('uk', scene.noticeId, complaint.id, scene.staff, {
    disposition: 'revoke',
    rationale: 'The UK restriction is reversed.',
  })
  await expect(
    processCopyrightActionIntent((await actionIntent(scene.noticeId, 'restore')).id),
  ).resolves.toBe('applied')
  expect(
    (await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions[0]?.lifted_at,
  ).toBeInstanceOf(Date)
}
