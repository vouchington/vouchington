import { expect } from 'vitest'
import { promoteCopyrightEmailIntake } from '../services/copyright-notices/email-promotion.mts'
import {
  readCopyrightPromotionScene,
  type PromotionScene,
} from './copyright-email-promotion-scene-state.mts'
import {
  copyrightPromotionResult,
  copyrightPromotionAdmissionAbort,
  copyrightPromotionAssessmentAbort,
  copyrightPromotionEnforcementAbort,
} from './copyright-email-promotion-outcomes.mts'

/** The existing case and blocked descendant graph stay identical on successful replay or native abort. */
export async function assertCommittedCopyrightGraphReplay(scene: PromotionScene, noticeId: string) {
  const before = await readCopyrightPromotionScene(scene)
  const parent = before.parents.find(row => row.id === noticeId)?.aggregate
  const submissionId = parent?.submissions.find(
    row => row.kind === 'notice' && row.source_kind !== 'staff',
  )?.id
  if (!submissionId) throw new Error('Owned committed graph replay has no initial submission')
  const [result] = await Promise.allSettled([promoteCopyrightEmailIntake(scene.input)])
  expect([
    { outcome: { status: 'fulfilled', value: { noticeId, submissionId } }, state: before },
    { outcome: copyrightPromotionAdmissionAbort, state: before },
    { outcome: copyrightPromotionAssessmentAbort, state: before },
    { outcome: copyrightPromotionEnforcementAbort, state: before },
  ]).toContainEqual({
    outcome: copyrightPromotionResult(result!),
    state: await readCopyrightPromotionScene(scene),
  })
}
