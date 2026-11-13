import { describe, expect, it } from 'vitest'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  enforceCopyrightAssessment,
  searchPendingCopyrightEnforcementAssessmentIds,
  searchRecoverableCopyrightFormReviewIntakeIds,
} from './index.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createErasedReviewScene,
  seedErasedReviewRestriction,
  rejectErasedReviewScene,
} from '@voucha/test-helpers/copyright-erased-review-scenes'
import { assertErasedReviewRecovery } from '@voucha/test-helpers/copyright-erased-review-subject'
import { seedCommittedErasedRecovery } from '@voucha/test-helpers/copyright-erased-review-completion'
import { readEffectiveReviewState } from '@voucha/test-helpers/copyright-effective-review-state'

describe('copyright rejected form-review recovery after actor erasure', () => {
  useAutomaticProvisionalWithholding()

  it('reverses an automated restriction after its detailed assessment history retired', async () => {
    const actual = await createErasedReviewScene(true)
    await seedErasedReviewRestriction(actual)
    await rejectErasedReviewScene(actual.notice.intake.id)
    await assertErasedReviewRecovery(actual)
    // This independent complete retired-history reversal always reaches the read and queue guards.
    const committed = await createErasedReviewScene(true)
    await seedErasedReviewRestriction(committed)
    await rejectErasedReviewScene(committed.notice.intake.id)
    await seedCommittedErasedRecovery(committed)
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchRecoverableCopyrightFormReviewIntakeIds,
        committed.notice.intake.id,
      ),
    ).resolves.toEqual([])
    const recovered = await getCopyrightNoticePrivateAggregate(
      committed.notice.intake.copyright_notice_id,
    )
    expect(recovered?.restrictions).toEqual([
      expect.objectContaining({ human_review_action: 'reverse', human_reviewed_by_id: null }),
    ])
    expect(recovered?.actionIntents).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'restore' })]),
    )
    expect(recovered?.assessments).toEqual([])
  })

  it('never enforces a pending automated assessment after the durable erased rejection', async () => {
    const scene = await createErasedReviewScene()
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchPendingCopyrightEnforcementAssessmentIds,
        scene.assessment.id,
      ),
    ).resolves.toEqual([scene.assessment.id])
    await rejectErasedReviewScene(scene.notice.intake.id)
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchPendingCopyrightEnforcementAssessmentIds,
        scene.assessment.id,
      ),
    ).resolves.toEqual([])
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchRecoverableCopyrightFormReviewIntakeIds,
        scene.notice.intake.id,
      ),
    ).resolves.toEqual([])
    const before = await readEffectiveReviewState(scene.notice.intake.copyright_notice_id, [
      scene.claimant.id,
    ])
    await expect(enforceCopyrightAssessment(scene.assessment.id)).resolves.toBeUndefined()
    expect(
      await readEffectiveReviewState(scene.notice.intake.copyright_notice_id, [scene.claimant.id]),
    ).toEqual(before)
    const recovered = await getCopyrightNoticePrivateAggregate(
      scene.notice.intake.copyright_notice_id,
    )
    expect(recovered?.restrictions).toEqual([])
  })
})
