import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { getImagePlacementKey } from '@services/images/placements'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  assertBoundedText,
  assertIdempotencyKey,
  assertStaffDisposition,
  type CopyrightStaffDisposition,
  type TerritorialCopyrightJurisdiction,
} from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from './claimant-decision-notices.mts'
import {
  applyCopyrightConfirmationConsequencesInTransaction,
  enqueueCopyrightStaydownHashes,
} from './staydown-registration.mts'
import {
  insertTerritorialRedressDecision,
  insertTerritorialRedressRequest,
  selectExistingTerritorialRedressDecision,
  selectExistingTerritorialRedressRequest,
  selectTerritorialRedressParent,
  selectTerritorialRedressRequest,
} from './territorial-redress-sql.mts'

export type TerritorialCopyrightRedressRequest = { id: string; is_duplicate: boolean }
export type TerritorialCopyrightRedressDecision = {
  id: string
  decided_at: Date
  staff_disposition: CopyrightStaffDisposition
}

export async function submitTerritorialCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightRedressRequest> {
  const labels = territorialLabels(jurisdiction)
  assertIdempotencyKey(idempotencyKey)
  const text = assertBoundedText(explanation, 50_000, 'explanation is required')
  await using transaction = await beginTransaction()
  const { rows: parents } = await transaction<{
    id: string
    requester_user_id: string | null
  }>(selectTerritorialRedressParent(jurisdiction, noticeId))
  const parent = parents[0]
  assert(parent, 404, labels.decisionNotFound)
  assert(
    actor.id === parent.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: existing } = await transaction<{ id: string; copyright_notice_id: string }>(
    selectExistingTerritorialRedressRequest(jurisdiction, noticeId, actor.id, idempotencyKey),
  )
  if (existing[0]) {
    assert(existing[0].copyright_notice_id === noticeId, 409, 'Idempotency-Key was reused')
    await transaction.commit()
    return { id: existing[0].id, is_duplicate: true }
  }
  const { rows } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      jurisdiction,
      noticeId,
      parent.id,
      actor.id,
      idempotencyKey,
      encryptSecret(text, `${labels.redressPurpose}:${idempotencyKey}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, labels.redressFailed)
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}

export async function recordTerritorialCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightRedressDecision> {
  const labels = territorialLabels(jurisdiction)
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const disposition = assertStaffDisposition(input.disposition)
  const rationale = assertBoundedText(input.rationale, 50_000, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: requests } = await transaction<{ id: string; decision_is_live: boolean }>(
    selectTerritorialRedressRequest(jurisdiction, redressId, noticeId),
  )
  assert(requests[0], 404, labels.redressNotFound)
  assert(requests[0].decision_is_live, 409, 'The decision was superseded')
  const { rows: placements } = await transaction<{ placement_id: string }>(sql`
    /* recordTerritorialCopyrightRedressDecision:placementLocks */
    SELECT DISTINCT target.placement_id
    FROM copyright_territorial_redress_requests request
    JOIN copyright_territorial_decisions decision
      ON decision.id = request.copyright_territorial_decision_id
    JOIN copyright_notice_targets target ON target.copyright_notice_id = decision.copyright_notice_id
    WHERE request.id = ${redressId}
      AND decision.copyright_notice_submission_assessment_id IS NOT NULL
    ORDER BY target.placement_id
  `)
  for (const placement of placements) {
    // oxlint-disable-next-line no-await-in-loop -- advisory locks use canonical placement order.
    await transaction(sql`/* recordTerritorialCopyrightRedressDecision:placementAdvisoryLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${getImagePlacementKey(placement.placement_id)}, 0))
    `)
  }
  await transaction(sql`/* recordTerritorialCopyrightRedressDecision:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const { rows: currentRequests } = await transaction<{ decision_is_live: boolean }>(
    selectTerritorialRedressRequest(jurisdiction, redressId, noticeId),
  )
  assert(currentRequests[0]?.decision_is_live, 409, 'The decision was superseded')
  const { rows: existing } = await transaction<{ id: string }>(
    selectExistingTerritorialRedressDecision(redressId),
  )
  assert(!existing[0], 409, labels.redressDecisionExists)
  const { rows } = await transaction<TerritorialCopyrightRedressDecision>(
    insertTerritorialRedressDecision(
      redressId,
      actor.id,
      disposition,
      encryptSecret(rationale, `${labels.redressDecisionPurpose}:${redressId}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, labels.redressDecisionFailed)
  const restoreIntentIds: string[] = []
  let staydownImageIds: string[] = []
  if (disposition === 'revoke') {
    const { rows: restrictions } = await transaction<{ id: string }>(sql`
      /* recordTerritorialCopyrightRedressDecision:restrictions */
      SELECT restriction.id
      FROM copyright_territorial_redress_requests request
      JOIN copyright_territorial_decisions decision
        ON decision.id = request.copyright_territorial_decision_id
      JOIN copyright_restrictions restriction
        ON restriction.authorizing_assessment_id = decision.copyright_notice_submission_assessment_id
      WHERE request.id = ${redressId} AND restriction.lifted_at IS NULL
      ORDER BY restriction.id
    `)
    for (const restriction of restrictions) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction owns each durable restore intent.
      const intent = await createCopyrightRestoreIntentForReversalInTransaction(
        restriction.id,
        transaction,
      )
      restoreIntentIds.push(intent.id)
    }
    staydownImageIds = await applyCopyrightConfirmationConsequencesInTransaction(
      noticeId,
      transaction,
    )
    await createCopyrightClaimantDecisionNoticeInTransaction(
      { noticeId, event: 'reversed' },
      transaction,
    )
  }
  await transaction.commit()
  for (const intentId of restoreIntentIds) void enqueueApplyCopyrightAction(intentId)
  enqueueCopyrightStaydownHashes(staydownImageIds)
  return created
}
