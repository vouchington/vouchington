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
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { createTerritorialConstraintDecision } from './copyright-territorial-decision-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'

/** Committed acknowledgment and human decision dependencies for participant/report projections. */
export async function seedCommittedTerritorialDecision(
  jurisdiction: 'eu_dsa' | 'uk',
  staff: PrivateUser,
  noticeId: string,
  input: TerritorialCopyrightDecisionInput,
  restrictionCount = input.targets.length,
) {
  const labels = territorialLabels(jurisdiction)
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
      /* seedCommittedTerritorialDecision:receipt */
      SELECT id, received_at FROM copyright_territorial_notice_receipts
      WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${jurisdiction}`)
    const receipt = receipts[0]
    if (!receipt) throw new Error('Owned EU receipt missing')
    await transaction(sql`/* seedCommittedTerritorialDecision:submission */
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
  const { rows: predecessors } = await transaction<{ id: string | null }>(sql`
    /* seedCommittedTerritorialDecision:predecessor */ SELECT current_territorial_decision_identity_id AS id
    FROM copyright_notices WHERE id = ${noticeId}`)
  await createTerritorialConstraintDecision(transaction, {
    noticeId,
    jurisdiction,
    actorId: staff.id,
    outcome: input.outcome,
    assessmentId,
    predecessorId: predecessors[0]?.id ?? null,
    rationaleCiphertext: encryptSecret(input.text, `${labels.decisionPurpose}:${noticeId}`),
    explanation: encryptSecret(
      input.publicExplanation,
      `${labels.publicExplanationPurpose}:${noticeId}`,
    ),
  })
  await transaction(sql`/* seedCommittedTerritorialDecision:clock */
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
    for (const target of aggregate.targets.slice(0, restrictionCount)) {
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
