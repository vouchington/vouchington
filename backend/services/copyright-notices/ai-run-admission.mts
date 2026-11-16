import { enqueueCopyrightAppealRecommendation } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'
import { enqueueCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { enqueueCopyrightSubmissionGuidance } from '@queues/ai-agents/enqueues/copyright-submission-guidance'
import { admitCopyrightAppealRecommendationRun } from './appeal-recommendation-runs.mts'
import { admitCopyrightEmailRecommendationRun } from './email-recommendation-runs.mts'
import { admitCopyrightSubmissionGuidanceRun } from './submission-guidance-runs.mts'

/**
 * Each admission commits the run row first (idempotent: a subject with an active run returns it),
 * then enqueues after commit. Callers receive the run id clients follow; null means the subject no
 * longer accepts an AI run.
 */
export async function admitAndEnqueueCopyrightAppealRecommendation(
  submissionId: string,
): Promise<string | null> {
  const runId = await admitCopyrightAppealRecommendationRun(submissionId)
  if (runId) await enqueueCopyrightAppealRecommendation(submissionId, runId)
  return runId
}

export async function admitAndEnqueueCopyrightSubmissionGuidance(
  submissionId: string,
): Promise<string | null> {
  const runId = await admitCopyrightSubmissionGuidanceRun(submissionId)
  if (runId) await enqueueCopyrightSubmissionGuidance(submissionId, runId)
  return runId
}

export async function admitAndEnqueueCopyrightEmailIntake(
  intakeId: string,
): Promise<string | null> {
  const runId = await admitCopyrightEmailRecommendationRun(intakeId)
  if (runId) await enqueueCopyrightEmailIntake(intakeId, runId)
  return runId
}
