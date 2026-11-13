import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '../services/users/types.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'
import { resolveCopyrightPostImagePlacements } from '../services/copyright-notices/placement-resolution.mts'
import { insertCopyrightNoticeTargetsInTransaction } from '../services/copyright-notices/notice-targets.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import {
  lockTerritorialAcknowledgmentQuery,
  updateTerritorialAcknowledgmentQuery,
} from '../services/copyright-notices/territorial-acknowledgment-sql.mts'
import { createTerritorialConstraintDecision } from './copyright-territorial-decision-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'

/** Committed acknowledgment and human decision dependencies for participant/report projections. */
export async function seedCommittedEuParticipantDecision(
  staff: PrivateUser,
  noticeId: string,
  input: TerritorialCopyrightDecisionInput,
) {
  await seedCommittedEuAcknowledgment(noticeId)
  await using transaction = await beginTransaction()
  let assessmentId: string | null = null
  if (input.outcome === 'restrict') {
    const targets = await resolveCopyrightPostImagePlacements(
      input.targets.toSorted(
        (a, b) => a.postId.localeCompare(b.postId) || a.imageId.localeCompare(b.imageId),
      ),
      transaction,
    )
    await insertCopyrightNoticeTargetsInTransaction(noticeId, targets, transaction)
    const submissionId = uuidv7()
    const { rows: receipts } = await transaction<{ id: string; received_at: Date }>(sql`
      /* seedCommittedEuParticipantDecision:receipt */
      SELECT id, received_at FROM copyright_territorial_notice_receipts
      WHERE copyright_notice_id = ${noticeId} AND jurisdiction = 'eu_dsa'`)
    const receipt = receipts[0]
    if (!receipt) throw new Error('Owned EU receipt missing')
    await transaction(sql`/* seedCommittedEuParticipantDecision:submission */
      INSERT INTO copyright_notice_submissions
        (id, copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext)
      VALUES (${submissionId}, ${noticeId}, ${staff.id}, 'notice', ${receipt.received_at}, 'staff',
        ${encryptSecret(JSON.stringify({ territorialReceiptId: receipt.id, text: input.text }), copyrightSubmissionPurpose(submissionId))})`)
    const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
      { submissionId, assessedAt: new Date(), currentUser: staff, substantiallyCompliant: true },
      transaction,
    )
    assessmentId = assessment.id
  }
  await createTerritorialConstraintDecision(transaction, {
    noticeId,
    jurisdiction: 'eu_dsa',
    actorId: staff.id,
    outcome: input.outcome,
    assessmentId,
    rationaleCiphertext: encryptSecret(input.text, `copyright-eu-statement:${noticeId}`),
    explanation: encryptSecret(
      input.publicExplanation,
      `copyright-eu-public-explanation:${noticeId}`,
    ),
  })
  await transaction(sql`/* seedCommittedEuParticipantDecision:clock */
    UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp())
    WHERE id = ${noticeId}`)
  if (input.outcome === 'no_action')
    await createCopyrightClaimantDecisionNoticeInTransaction(
      { noticeId, event: 'not_accepted' },
      transaction,
    )
  await transaction.commit()
  if (assessmentId) {
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    if (!aggregate) throw new Error('Owned EU decision disappeared')
    for (const target of aggregate.targets) {
      await seedCopyrightStatementRestriction({
        noticeId,
        targetId: target.id,
        assessmentId,
        revision: target.placement_revision,
        moderatorId: staff.id,
      })
    }
  }
}

/** A committed acknowledgment dependency, not the acknowledgment request under test. */
export async function seedCommittedEuAcknowledgment(noticeId: string) {
  await using transaction = await beginTransaction()
  const { rows: acknowledgments } = await transaction<{ id: string }>(
    lockTerritorialAcknowledgmentQuery('eu_dsa', noticeId),
  )
  const acknowledgment = acknowledgments[0]
  if (!acknowledgment) throw new Error('Owned EU acknowledgment missing')
  await transaction(updateTerritorialAcknowledgmentQuery(acknowledgment.id, 'acknowledged'))
  await transaction(sql`/* seedCommittedEuAcknowledgment:clock */
    UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp())
    WHERE id = ${noticeId}`)
  await transaction.commit()
}
