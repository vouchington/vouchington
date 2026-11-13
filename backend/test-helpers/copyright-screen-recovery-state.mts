import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { readTestPendingCopyrightAgentDispatches } from './services/copyright-notices/pending-agent-dispatches.mts'
import { readTestOwnedCopyrightSweepIds } from './services/copyright-notices/sweep-ids.mts'
import { searchRecoverableCopyrightFormReviewIntakeIds } from '../services/copyright-notices/form-reviews-recovery.mts'
import { searchPendingCopyrightEnforcementAssessmentIds } from '../services/copyright-notices/enforcement-pending.mts'
import type { ScreenRecoveryScene } from './copyright-screen-recovery-fixtures.mts'

/** Legal, current screen, provenance and all owning queues are read under this scene's ids. */
export async function readScreenRecoveryState(scene: ScreenRecoveryScene) {
  const noticeId = scene.notice.intake.copyright_notice_id
  const [
    observed,
    { rows: screenings },
    { rows: assessments },
    { rows: decisions },
    { rows: misuse },
    formEffects,
    reviewRecovery,
  ] = await Promise.all([
    readEffectiveReviewState(noticeId, [scene.poster.id]),
    write<{
      id: string
      recommendation: string
      current: boolean
    }>(sql`/* readScreenRecoveryState:screenings */
    SELECT screening.id, screening.recommendation,
      fn_current_copyright_form_screening(${scene.notice.intake.copyright_notice_submission_id}, screening.id) AS current
    FROM copyright_notice_form_screenings screening WHERE copyright_notice_form_intake_id = ${scene.notice.intake.id}
    ORDER BY screening.id`),
    write<{
      id: string
      reviewer: string | null
      screening: string | null
    }>(sql`/* readScreenRecoveryState:assessments */
    SELECT id, assessed_by_id AS reviewer, copyright_notice_form_screening_id AS screening
    FROM copyright_notice_submission_assessments WHERE copyright_notice_submission_id = ${scene.notice.intake.copyright_notice_submission_id}
    ORDER BY id`),
    write<{
      key: string
    }>(sql`/* readScreenRecoveryState:decisions */
    SELECT idempotency_key AS key FROM copyright_notice_delivery_work_items
    WHERE copyright_notice_id = ${noticeId} AND delivery_kind = 'claimant_decision_notice' ORDER BY idempotency_key`),
    write<{
      outcome: string
      assessment: string | null
      restriction: string | null
    }>(sql`/* readScreenRecoveryState:misuse */
    SELECT outcome, copyright_notice_submission_assessment_identity_id AS assessment, copyright_restriction_id AS restriction
    FROM copyright_claimant_misuse_events WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
    readTestPendingCopyrightAgentDispatches(scene.notice.intake.copyright_notice_submission_id),
    readTestOwnedCopyrightSweepIds(
      searchRecoverableCopyrightFormReviewIntakeIds,
      scene.notice.intake.id,
    ),
  ])
  const effectiveMisuse: { restriction: string | null; outcome: string }[] = observed.misuse
  const effective = { ...observed, misuse: effectiveMisuse }
  const pending = await Promise.all(
    effective.state.identities.map(id =>
      readTestOwnedCopyrightSweepIds(searchPendingCopyrightEnforcementAssessmentIds, id),
    ),
  )
  return {
    effective,
    screenings,
    assessments,
    decisions: decisions.map(row => row.key),
    misuse,
    formEffects,
    reviewRecovery,
    enforcement: pending.flat(),
  }
}
export type ScreenRecoveryState = Awaited<ReturnType<typeof readScreenRecoveryState>>
