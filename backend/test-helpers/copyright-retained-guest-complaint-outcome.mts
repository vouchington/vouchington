import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import {
  readRetainedGuestComplaintState,
  type RetainedComplaintEmail,
} from './copyright-retained-guest-complaint-state.mts'
import {
  expectedRetainedGuestComplaint,
  retainedComplaintRationale,
  retainedComplaintFallback,
} from './copyright-retained-guest-complaint-expected.mts'
import type { PrivateUser } from '../services/users/types.mts'

export function retainedGuestComplaintInput(staff: PrivateUser, intakeId: string) {
  return {
    currentUser: staff,
    intakeId,
    kind: 'complaint' as const,
    targetIds: [],
    structuredSubmission: { summary: 'Please reconsider the decision.' },
    rationale: retainedComplaintRationale,
    recommendationId: null,
    manualFallbackReason: retainedComplaintFallback,
  }
}
const conflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  causeCode: '40001',
}
/** The real guest email actor commits all review/redress/case facts or leaves every source/current row intact. */
export async function assertRetainedGuestComplaint(
  staff: PrivateUser,
  noticeId: string,
  intake: RetainedComplaintEmail,
) {
  const before = await readRetainedGuestComplaintState(noticeId, intake)
  const [result] = await Promise.allSettled([
    admitCopyrightEmailCorrespondence(retainedGuestComplaintInput(staff, intake.id)),
  ])
  const after = await readRetainedGuestComplaintState(noticeId, intake)
  const submission = after.state.aggregate.submissions.find(row => row.kind === 'complaint')
  const correspondence = after.state.aggregate.correspondence.find(
    row => row.copyright_notice_email_intake_id === intake.id,
  )
  expect([
    { outcome: conflict, state: before },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          noticeId,
          submissionId: submission?.id,
          correspondenceId: correspondence?.id,
          isDuplicate: false,
        },
      },
      state: expectedRetainedGuestComplaint(noticeId, intake, staff.id, before, after),
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  if (submission)
    expect(
      decryptSecret(submission.body_ciphertext, copyrightSubmissionPurpose(submission.id)),
    ).toBe(JSON.stringify({ summary: 'Please reconsider the decision.' }))
  if (correspondence)
    expect(
      decryptSecret(
        correspondence.body_ciphertext,
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      ),
    ).toBe('I ask staff to reconsider the decision.')
  const request = after.state.requests.find(row => row.idempotency_key === submission?.id)
  if (request)
    expect(
      decryptSecret(request.explanation_ciphertext, `copyright-eu-redress:${submission!.id}`),
    ).toBe('I ask staff to reconsider the decision.')
  expect(after.state.clock.at.getTime()).toBeGreaterThanOrEqual(before.state.clock.at.getTime())
}

/** A second real email remains entirely pending: either the precise one-per-decision guard or native SSI aborts it. */
export async function assertRetainedGuestComplaintDuplicate(
  staff: PrivateUser,
  noticeId: string,
  intake: RetainedComplaintEmail,
) {
  const before = await readRetainedGuestComplaintState(noticeId, intake)
  expect(before.state.requests).toHaveLength(1)
  const [result] = await Promise.allSettled([
    admitCopyrightEmailCorrespondence(retainedGuestComplaintInput(staff, intake.id)),
  ])
  const after = await readRetainedGuestComplaintState(noticeId, intake)
  expect([
    { outcome: conflict, state: before },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: undefined,
        message: 'A guest complaint already exists for this decision',
        causeCode: undefined,
      },
      state: before,
    },
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
}
