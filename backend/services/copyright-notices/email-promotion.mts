import assert from 'http-assert'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { admitCopyrightEmailIntake } from './email-promotion-admission.mts'
import {
  assertStatutoryEmailFields,
  type PromoteCopyrightEmailIntakeInput,
} from './email-promotion-input.mts'
import { enforceCopyrightAssessment } from './enforce-assessment.mts'

export type { PromoteCopyrightEmailIntakeInput } from './email-promotion-input.mts'

/** A moderator supplies the declarations; advisory extraction is retained only as provenance. */
export async function promoteCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
): Promise<{ noticeId: string; submissionId: string }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertStatutoryEmailFields(input)
  const admitted = await admitCopyrightEmailIntake(input)
  if (!admitted.evidenceErased) {
    try {
      await assessAndEnforceCopyrightEmailIntake(input, admitted)
    } catch (err) {
      if (!admitted.isDuplicate || !isErasedCaseConflict(err)) throw err
    }
  }
  return { noticeId: admitted.noticeId, submissionId: admitted.submissionId }
}

async function assessAndEnforceCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
  admitted: { noticeId: string; submissionId: string },
): Promise<void> {
  const assessment = await getOrCreateEmailAssessment(input.currentUser, admitted)
  await enforceCopyrightAssessment(assessment.id)
}

function isErasedCaseConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { status?: unknown }).status === 410 &&
    (error as { message?: unknown }).message === 'Copyright case evidence was erased'
  )
}
