import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import assert from 'http-assert'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'
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
  return conflictOnSerializationFailure(async () => {
  const admitted = await admitCopyrightEmailIntake(input).catch((err: unknown) => {
    const failure = err as { code?: string; message?: string } | null
    if (
      failure?.code === '40001' ||
      failure?.code === '40P01' ||
      (failure?.code === '23514' &&
        failure.message === 'erased copyright case cannot acquire an email intake')
    )
      throw copyrightEmailThreadChangedError(err)
    throw err
  })
  if (!admitted.evidenceErased) {
    try {
      await assessAndEnforceCopyrightEmailIntake(input, admitted)
    } catch (err) {
      if (!admitted.isDuplicate || !isErasedCaseConflict(err)) throw err
    }
  }
  return { noticeId: admitted.noticeId, submissionId: admitted.submissionId }
  }, 'Copyright email changed during promotion', COPYRIGHT_EMAIL_THREAD_CHANGED)
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
