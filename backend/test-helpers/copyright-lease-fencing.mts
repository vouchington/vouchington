import { createTestUser } from './index.mts'
import { createParsedCopyrightEmailIntake } from '../services/copyright-notices/email-intake-test-fixtures.mts'
import { rejectCopyrightEmailIntake } from '../services/copyright-notices/email-rejection.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { completeCopyrightActionIntentInTransaction } from '../services/copyright-notices/action-delivery-locking.mts'

export async function expireTestCopyrightEnforcementClaim(assessmentId: string): Promise<void> {
  await write(sql`/* expireTestCopyrightEnforcementClaim */
    UPDATE copyright_notice_enforcement_requests
    SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes'
    WHERE copyright_notice_submission_assessment_id = ${assessmentId} AND state = 'claimed'
  `)
}

export async function completeTestCopyrightActionClaim(
  intentId: string,
  leaseToken: string,
  now: Date,
): Promise<void> {
  await using transaction = await beginTransaction()
  await completeCopyrightActionIntentInTransaction({
    intentId,
    leaseToken,
    completedAt: now,
    outcome: 'completed',
    query: transaction,
  })
  await transaction.commit()
}

export async function createTestRejectedCopyrightResponse(): Promise<string> {
  const user = await createTestUser()
  const intake = await createParsedCopyrightEmailIntake()
  const { responseId } = await rejectCopyrightEmailIntake({
    currentUser: { ...user, roles: ['moderator'] },
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message lacks required declarations.',
    responseKind: 'rejected',
    responseMessage: null,
  })
  if (!responseId) throw new Error('Response was not created')
  return responseId
}
