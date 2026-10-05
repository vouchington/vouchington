import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from './compliance.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from './claimant-decision-notices.mts'
import { enforceCopyrightAssessment } from './enforce-assessment.mts'
import { insertCopyrightNoticeTargetsInTransaction } from './notice-targets.mts'
import {
  resolveCopyrightImagePlacement,
  type CopyrightImageSelector,
} from './placement-resolution.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { assertBoundedText, type TerritorialCopyrightJurisdiction } from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'
import { territorialDecisionIsLiveSql } from './territorial-redress-sql.mts'

export type TerritorialCopyrightDecisionInput = {
  text: string
  publicExplanation: string
  outcome: 'restrict' | 'no_action'
  targets: Array<Extract<CopyrightImageSelector, { surfaceKind: 'post-image' }>>
}

export type TerritorialCopyrightDecision = {
  id: string
  decided_at: Date
  automation_disclosure: 'human'
  outcome: 'restrict' | 'no_action'
}

/** Records a scoped human decision and its authority before any restriction is applied. */
export async function recordTerritorialCopyrightDecision(
  actor: PrivateUser,
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  input: TerritorialCopyrightDecisionInput,
  dependencies: { enforceAssessment?: typeof enforceCopyrightAssessment } = {},
): Promise<TerritorialCopyrightDecision> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const labels = territorialLabels(jurisdiction)
  const text = assertBoundedText(input.text, 50_000, labels.decisionTextRequired)
  const publicExplanation = assertBoundedText(
    input.publicExplanation,
    2000,
    'public_explanation is required',
  )
  assert(input.outcome === 'restrict' || input.outcome === 'no_action', 422, 'outcome is required')
  assert(
    input.outcome === 'restrict' ? input.targets.length > 0 : input.targets.length === 0,
    422,
    'Decision targets do not match outcome',
  )
  assert(input.targets.length <= 20, 422, 'Too many territorial decision targets')
  assert(
    new Set(input.targets.map(target => `${target.postId}:${target.imageId}`)).size ===
      input.targets.length,
    422,
    'Territorial decision targets must be unique',
  )
  await using transaction = await beginTransaction()
  const { rows: receipts } = await transaction<{ id: string; received_at: Date }>(sql`
    /* recordTerritorialCopyrightDecision:receipt */
    SELECT id, received_at FROM copyright_territorial_notice_receipts
    WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${jurisdiction} FOR UPDATE
  `)
  const receipt = receipts[0]
  assert(receipt, 404, labels.noticeNotFound)
  const { rows: existing } = await transaction<{
    id: string
    outcome: 'restrict' | 'no_action'
    revoked: boolean
  }>(
    sql`/* recordTerritorialCopyrightDecision:existing */
      SELECT decision.id, decision.outcome, EXISTS (
        SELECT 1 FROM copyright_territorial_redress_requests request
        JOIN copyright_territorial_redress_decisions redress
          ON redress.copyright_territorial_redress_request_id = request.id
        WHERE request.copyright_territorial_decision_id = decision.id
          AND redress.staff_disposition = 'revoke'
      ) AS revoked
      FROM copyright_territorial_decisions decision
      WHERE decision.copyright_notice_id = ${noticeId} AND decision.jurisdiction = ${jurisdiction}
        AND `
      .append(territorialDecisionIsLiveSql())
      .append(sql` FOR UPDATE OF decision`),
  )
  const previous = existing[0]
  assert(
    !(previous?.outcome === 'no_action' && previous.revoked && input.outcome === 'no_action'),
    422,
    'A reopened notice needs a restrict decision',
  )
  assert(
    !previous ||
      (previous.outcome === 'no_action' && previous.revoked && input.outcome === 'restrict'),
    409,
    labels.decisionExists,
  )
  let assessmentId: string | null = null
  if (input.outcome === 'restrict') {
    const targets = []
    for (const selector of input.targets.toSorted(
      (a, b) => a.postId.localeCompare(b.postId) || a.imageId.localeCompare(b.imageId),
    )) {
      // oxlint-disable-next-line no-await-in-loop -- placement locks and snapshots need canonical order.
      targets.push(await resolveCopyrightImagePlacement(selector, transaction))
    }
    await insertCopyrightNoticeTargetsInTransaction(noticeId, targets, transaction)
    const submissionId = uuidv7()
    const { rows: submissions } = await transaction<{ id: string }>(sql`
      /* recordTerritorialCopyrightDecision:submission */
      INSERT INTO copyright_notice_submissions (
        id, copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${submissionId}, ${noticeId}, ${actor.id}, 'notice', ${receipt.received_at}, 'staff',
        ${encryptSecret(JSON.stringify({ territorialReceiptId: receipt.id, text }), copyrightSubmissionPurpose(submissionId))}
      ) RETURNING id
    `)
    const submission = submissions[0]
    assert(submission, 500, labels.decisionFailed)
    const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
      {
        submissionId: submission.id,
        assessedAt: new Date(),
        currentUser: actor,
        substantiallyCompliant: true,
      },
      transaction,
    )
    assessmentId = assessment.id
  }
  const { rows } = await transaction<TerritorialCopyrightDecision>(sql`
    /* recordTerritorialCopyrightDecision */
    INSERT INTO copyright_territorial_decisions (
      copyright_notice_id, jurisdiction, decided_by_id, outcome,
      copyright_notice_submission_assessment_id, supersedes_decision_id,
      automation_disclosure, rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${actor.id}, ${input.outcome}, ${assessmentId},
      ${previous?.id ?? null}, 'human',
      ${encryptSecret(text, `${labels.decisionPurpose}:${noticeId}`)},
      ${encryptSecret(publicExplanation, `${labels.publicExplanationPurpose}:${noticeId}`)}
    ) RETURNING id, decided_at, automation_disclosure, outcome
  `)
  const created = rows[0]
  assert(created, 500, labels.decisionFailed)
  if (input.outcome === 'no_action') {
    await createCopyrightClaimantDecisionNoticeInTransaction(
      { noticeId, event: 'not_accepted' },
      transaction,
    )
  }
  await transaction.commit()
  if (assessmentId)
    await (dependencies.enforceAssessment ?? enforceCopyrightAssessment)(assessmentId)
  return created
}
