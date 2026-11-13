import { expect } from 'vitest'
import { enforceCopyrightAssessment } from '../services/copyright-notices/enforce-assessment.mts'
import { interceptCopyrightImpositionForTest } from './copyright-imposition-intercept.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import type { createCopyrightRestorationHoldFixture } from './copyright-restoration-hold-fixtures.mts'

/** The durable current tip wins even when an earlier enforcer had already selected this target. */
export async function assertEnforcementSupersession(
  scene: Awaited<ReturnType<typeof createCopyrightRestorationHoldFixture>>,
) {
  const before = await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])
  let superseding: string | undefined
  interceptCopyrightImpositionForTest(scene.notice.id, async () => {
    const assessment = await seedCopyrightSubmissionAssessment({
      submissionId: scene.aggregate.submissions[0]!.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: scene.moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: scene.assessment.id,
    })
    superseding = assessment.id
    await expect(enforceCopyrightAssessment(scene.assessment.id)).resolves.toBeUndefined()
  })
  const [result] = await Promise.allSettled([enforceCopyrightAssessment(scene.assessment.id)])
  expect(superseding).toEqual(expect.any(String))
  const success = {
    ...before,
    misuse: [...before.misuse, { restriction: null, outcome: 'notice_rejected' }],
    state: {
      ...before.state,
      assessments: [
        ...before.state.assessments,
        { id: superseding, supersedes: scene.assessment.id, compliant: false },
      ],
      identities: [...before.state.identities, superseding].toSorted((a, b) =>
        String(a).localeCompare(String(b)),
      ),
      pointers: before.state.pointers.map(row =>
        row.id === scene.aggregate.submissions[0]!.id
          ? { ...row, assessment: superseding, compliant: false }
          : row,
      ),
      events: [...before.state.events, 'submission_assessed'].toSorted(),
      correspondence: [...before.state.correspondence, 'decision_notice'].toSorted(),
      deliveries: [
        ...before.state.deliveries,
        `claimant_decision_notice:email:${scene.claimant.id}`,
        `claimant_decision_notice:in_app:${scene.claimant.id}`,
      ].toSorted(),
    },
  }
  expect([
    { outcome: { status: 'fulfilled' }, state: success },
    { outcome: nativeCopyrightSerializationConflict, state: success },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: await readEffectiveReviewState(scene.notice.id, [scene.claimant.id]),
  })
}
