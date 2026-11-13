import { expectedEmailWithdrawal } from './copyright-withdrawal-email-expected.mts'
import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { readWithdrawalState } from './copyright-withdrawal-state.mts'
import { readRetainedGuestComplaintState } from './copyright-retained-guest-complaint-state.mts'
import type { WithdrawalCapabilityScene } from './copyright-withdrawal-capability-fixture.mts'
import type { createWithdrawalEmailSource } from './copyright-withdrawal-email-source.mts'

export function withdrawalEmailInput(scene: WithdrawalCapabilityScene, intakeId: string) {
  return {
    currentUser: scene.staff,
    intakeId,
    kind: 'withdrawal' as const,
    targetIds: [],
    structuredSubmission: { summary: 'The claimant withdraws the notice.' },
    rationale: 'The claimant withdrew the notice by email.',
    recommendationId: null,
    manualFallbackReason: 'Agent output is unavailable.',
  }
}
/** The complete email admission and every live-token revocation share one transaction. */
export async function assertEmailWithdrawal(
  scene: WithdrawalCapabilityScene,
  intake: Awaited<ReturnType<typeof createWithdrawalEmailSource>>,
) {
  const read = async () => {
    const [cases, email] = await Promise.all([
      readWithdrawalState([scene.noticeId, scene.otherNoticeId]),
      readRetainedGuestComplaintState(scene.noticeId, intake),
    ])
    return {
      cases,
      email: {
        links: email.links,
        reviews: email.reviews,
        receipts: email.receipts,
        parses: email.parses,
      },
    }
  }
  const input = withdrawalEmailInput(scene, intake.id)
  const before = await read()
  const [result] = await Promise.allSettled([admitCopyrightEmailCorrespondence(input)])
  const after = await read()
  const { complete, submission, correspondence, submissionId, correspondenceId } =
    expectedEmailWithdrawal(scene, intake, input, before, after)
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
    {
      outcome: {
        status: 'fulfilled',
        value: { noticeId: scene.noticeId, submissionId, correspondenceId, isDuplicate: false },
      },
      state: complete,
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  for (const [index, row] of after.cases.entries())
    expect(row.clock.at.getTime()).toBeGreaterThanOrEqual(before.cases[index]!.clock.at.getTime())
  if (submission)
    expect(
      decryptSecret(submission.body_ciphertext, copyrightSubmissionPurpose(submission.id)),
    ).toBe(JSON.stringify(input.structuredSubmission))
  if (correspondence)
    expect(
      decryptSecret(
        correspondence.body_ciphertext,
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      ),
    ).toBe('I withdraw my copyright notice.')
}
