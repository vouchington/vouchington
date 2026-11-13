import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { insertTerritorialRedressRequest } from '../services/copyright-notices/territorial-redress-sql.mts'
import { insertTerritorialConstraintDecision } from './copyright-territorial-decision-fixture.mts'
import {
  seedPendingTerritorialNotice,
  type TerritorialJurisdiction,
  type TerritorialActors,
} from './services/copyright-notices/territorial-routes.mts'

/** Canonical acknowledged/no-action state for request-validation subjects, not a decision workflow. */
export async function seedDeterminedTerritorialNoticeForValidation(
  jurisdiction: TerritorialJurisdiction,
  actors: Pick<TerritorialActors, 'claimant' | 'staff'>,
): Promise<string> {
  const noticeId = await seedPendingTerritorialNotice(jurisdiction, actors.claimant)
  const labels = territorialLabels(jurisdiction)
  await using transaction = await beginTransaction()
  const { rowCount } = await transaction(sql`/* seedTerritorialValidationAcknowledgment */
    UPDATE copyright_territorial_notice_acknowledgments acknowledgment
    SET attempt_count = 1, last_attempt_at = clock_timestamp(), acknowledged_at = clock_timestamp()
    FROM copyright_territorial_notice_receipts receipt
    WHERE receipt.id = acknowledgment.copyright_territorial_notice_receipt_id
      AND receipt.copyright_notice_id = ${noticeId}`)
  if (rowCount !== 1) throw new Error('Owned territorial acknowledgment missing')
  await insertTerritorialConstraintDecision(
    transaction,
    noticeId,
    jurisdiction,
    actors.staff.id,
    encryptSecret('Staff reasons for no action.', `${labels.decisionPurpose}:${noticeId}`),
    encryptSecret(
      'We reviewed the notice and took no action.',
      `${labels.publicExplanationPurpose}:${noticeId}`,
    ),
  )
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId, event: 'not_accepted' },
    transaction,
  )
  await transaction.commit()
  return noticeId
}

/** A determined territorial notice and canonical claimant redress state for other subjects. */
export async function seedTerritorialRedress(
  jurisdiction: TerritorialJurisdiction,
  actors: Pick<TerritorialActors, 'claimant' | 'staff'>,
): Promise<{ noticeId: string; redressId: string }> {
  const noticeId = await seedDeterminedTerritorialNoticeForValidation(jurisdiction, actors)
  const key = crypto.randomUUID()
  await using transaction = await beginTransaction()
  const { rows: notices } = await transaction<{
    decision_id: string
  }>(sql`/* seedTerritorialRedressParent */
    SELECT current_territorial_decision_identity_id AS decision_id FROM copyright_notices
    WHERE id = ${noticeId}`)
  if (!notices[0]) throw new Error('Owned territorial decision missing')
  const { rows } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      jurisdiction,
      noticeId,
      notices[0].decision_id,
      'no_action',
      null,
      actors.claimant.id,
      'notifier',
      key,
      encryptSecret(
        'Please review this restriction',
        `${territorialLabels(jurisdiction).redressPurpose}:${key}`,
      ),
    ),
  )
  if (!rows[0]) throw new Error('Owned territorial redress missing')
  await transaction(sql`/* seedTerritorialRedressClock */
    UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp())
    WHERE id = ${noticeId}`)
  await transaction.commit()
  return { noticeId, redressId: rows[0].id }
}
