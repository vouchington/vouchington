import onError from '@modules/on-error'
import type { PrivateUser } from '@services/users/types'
import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import { enqueueCopyrightSubmissionGuidanceAndWait } from '@queues/ai-agents/enqueues/copyright-submission-guidance'
import { assertCopyrightIntakeEnabled } from './activation.mts'
import { parseCopyrightNoticeForm } from './http-input.mts'
import { resolveCopyrightImagePlacement } from './placement-resolution.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import {
  admitCopyrightEmailCorrespondence,
  rejectCopyrightEmailCorrespondence,
} from './email-correspondence-admission.mts'

/** The common REST/MCP decision after each surface has validated and parsed its input. */
export async function approveCopyrightEmailIntakeDecision(
  currentUser: PrivateUser,
  intakeId: string,
  input: ReturnType<typeof parseCopyrightNoticeForm>,
  recommendationId: string | null,
  manualFallbackReason: string | null,
  rationale: string,
) {
  assertCopyrightIntakeEnabled()
  const targets = await Promise.all(
    input.targets.map(target => resolveCopyrightImagePlacement(target)),
  )
  const promoted = await promoteCopyrightEmailIntake({
    currentUser,
    intakeId,
    recommendationId,
    manualFallbackReason,
    jurisdiction: input.jurisdiction,
    claimantDisplayName: input.claimantDisplayName,
    claimantContact: input.claimantContact,
    claimantEmail: input.claimantEmail,
    workDescription: input.workDescription,
    goodFaithBelief: input.goodFaithBelief,
    accuracyAuthorityUnderPenaltyOfPerjury: input.accuracyAuthorityUnderPenaltyOfPerjury,
    electronicSignature: input.electronicSignature,
    targets,
    rationale,
  })
  return {
    copyright_notice: { id: promoted.noticeId },
    copyright_submission: { id: promoted.submissionId },
  }
}

export async function rejectCopyrightEmailIntakeDecision(
  input: Parameters<typeof rejectCopyrightEmailIntake>[0],
) {
  const rejected = await rejectCopyrightEmailIntake(input)
  if (rejected.responseId) void enqueueSendCopyrightNoticeEmail(rejected.responseId)
  return { reply_queued: rejected.replyQueued }
}

/** The admission write commits before this best-effort queue; a queue outage cannot undo a filing. */
export async function admitCopyrightEmailCorrespondenceDecision(
  input: Parameters<typeof admitCopyrightEmailCorrespondence>[0],
) {
  const admitted = await admitCopyrightEmailCorrespondence(input)
  if (
    !admitted.isDuplicate &&
    (input.kind === 'counter_notice' || input.kind === 'court_or_ccb_hold')
  ) {
    try {
      await enqueueCopyrightSubmissionGuidanceAndWait(admitted.submissionId)
    } catch (err) {
      onError(
        err instanceof Error
          ? err
          : new Error('Failed to enqueue copyright submission guidance', {
              cause: err,
            }),
      )
    }
  }
  return {
    copyright_notice: { id: admitted.noticeId },
    copyright_submission: { id: admitted.submissionId },
    copyright_correspondence: { id: admitted.correspondenceId },
    is_duplicate: admitted.isDuplicate,
  }
}

export async function rejectCopyrightEmailCorrespondenceDecision(
  input: Parameters<typeof rejectCopyrightEmailCorrespondence>[0],
) {
  const rejected = await rejectCopyrightEmailCorrespondence(input)
  return {
    copyright_notice: { id: rejected.noticeId },
    is_duplicate: rejected.isDuplicate,
  }
}
