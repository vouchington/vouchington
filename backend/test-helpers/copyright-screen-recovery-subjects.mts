import { expect } from 'vitest'
import { applyNonSpamSignedInCopyrightFormScreening } from '../services/copyright-notices/form-screenings.mts'
import { enforceCopyrightAssessment } from '../services/copyright-notices/enforce-assessment.mts'
import { recoverRejectedCopyrightFormReviewEffect } from '../services/copyright-notices/form-reviews-recovery.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { readScreenRecoveryState } from './copyright-screen-recovery-state.mts'
import {
  screenAssessedState,
  screenRestrictedState,
  screenReversedState,
} from './copyright-screen-recovery-expected.mts'
import type { ScreenRecoveryScene } from './copyright-screen-recovery-fixtures.mts'

/** An assessment commit and each imposition commit are exact independent recoverable stages. */
export async function assertScreenEffectRecovery(
  scene: ScreenRecoveryScene,
  options: {
    assessmentId?: string
    index?: number
    enforcementOnly?: boolean
    noop?: boolean
  } = {},
) {
  const before = await readScreenRecoveryState(scene)
  const [result] = await Promise.allSettled([
    options.enforcementOnly
      ? enforceCopyrightAssessment(options.assessmentId!)
      : applyNonSpamSignedInCopyrightFormScreening(
          scene.notice.intake.copyright_notice_submission_id,
        ),
  ])
  const after = await readScreenRecoveryState(scene)
  const id =
    options.assessmentId ?? after.assessments.find(row => row.screening === scene.screeningId)?.id
  const assessed = options.assessmentId ? before : screenAssessedState(before, scene, id)
  const targetId = before.effective.state.targets[options.index ?? 0]!.id
  const restrictionId = after.effective.state.restrictions.find(
    row => row.target === targetId && row.lifted === null,
  )?.id
  const complete = options.noop
    ? before
    : screenRestrictedState(assessed, scene, id, restrictionId, options.index)
  expect([
    { outcome: { status: 'fulfilled' }, state: complete },
    { outcome: nativeCopyrightSerializationConflict, state: before },
    ...(options.noop ? [] : [{ outcome: nativeCopyrightSerializationConflict, state: assessed }]),
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
  })
}

/** A durable rejected review remains authoritative through assessment and reversal crash windows. */
export async function assertRejectedScreenRecovery(scene: ScreenRecoveryScene, replay = false) {
  const before = await readScreenRecoveryState(scene)
  const [result] = await Promise.allSettled([
    recoverRejectedCopyrightFormReviewEffect(scene.notice.intake.id),
  ])
  const after = await readScreenRecoveryState(scene)
  const id = after.assessments.find(row => row.reviewer === scene.moderator.id)?.id
  const rejected = replay ? before : screenAssessedState(before, scene, id, true)
  const complete = replay ? before : screenReversedState(rejected, scene)
  expect([
    { outcome: { status: 'fulfilled' }, state: complete },
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: rejected },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
  })
}
