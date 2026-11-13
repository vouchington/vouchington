import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '../services/users/types.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import {
  insertTerritorialRedressRequest,
  insertTerritorialRedressDecision,
} from '../services/copyright-notices/territorial-redress-sql.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from '../services/copyright-notices/restoration-reversal.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../services/copyright-notices/staydown-registration.mts'
import { buildCopyrightClaimantDecisionDelivery } from '../services/copyright-notices/claimant-decision-notices.mts'
import { buildTerritorialRedressDecisionDelivery } from '../services/copyright-notices/territorial-redress-notices.mts'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from '../services/copyright-notices/statement-delivery.mts'

/** Complete committed complaint prerequisite, bound to the actual current territorial decision. */
export async function seedCommittedTerritorialRedress(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
  actor: PrivateUser,
  explanation: string,
  filedBy: 'notifier' | 'poster' | 'reviewer' = 'notifier',
) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    outcome: 'restrict' | 'no_action'
    assessment: string | null
  }>(sql`
    /* seedCommittedTerritorialRedress:parent */ SELECT current_territorial_decision_identity_id AS id,
      territorial_decision_outcome AS outcome, territorial_authorizing_assessment_identity_id AS assessment
    FROM copyright_notices WHERE id = ${noticeId}`)
  const parent = rows[0]
  if (!parent?.id) throw new Error('Owned territorial complaint has no decision')
  const key = crypto.randomUUID()
  const { rows: created } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      jurisdiction,
      noticeId,
      parent.id,
      parent.outcome,
      parent.assessment,
      actor.id,
      filedBy,
      key,
      encryptSecret(explanation, `${territorialLabels(jurisdiction).redressPurpose}:${key}`),
    ),
  )
  if (!created[0]) throw new Error('Owned territorial complaint was not inserted')
  await transaction(
    sql`/* seedCommittedTerritorialRedress:clock */ UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = ${noticeId}`,
  )
  await transaction.commit()
  return { id: created[0].id, is_duplicate: false }
}

/** Complete committed decision prerequisite for successor/projection/delivery subjects. */
export async function seedCommittedTerritorialRedressDecision(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
  redressId: string,
  staff: PrivateUser,
  input: { disposition: 'revoke' | 'maintain'; rationale: string },
) {
  await using transaction = await beginTransaction()
  const id = uuidv7()
  const rationale = encryptSecret(
    input.rationale,
    `${territorialLabels(jurisdiction).redressDecisionPurpose}:${redressId}`,
  )
  await transaction(
    sql`/* seedCommittedTerritorialRedressDecision:identity */ INSERT INTO copyright_territorial_redress_decision_identities (id, copyright_territorial_redress_request_id) VALUES (${id}, ${redressId})`,
  )
  const { rows } = await transaction<{ id: string; decided_at: Date; staff_disposition: string }>(
    insertTerritorialRedressDecision(id, redressId, staff.id, input.disposition, rationale),
  )
  if (!rows[0]) throw new Error('Owned territorial redress decision missing')
  await transaction(
    sql`/* seedCommittedTerritorialRedressDecision:current */ UPDATE copyright_territorial_redress_requests SET current_staff_decision_identity_id = ${id}, staff_disposition = ${input.disposition}, decided_at = ${rows[0].decided_at}, decided_by_id = ${staff.id}, rationale_ciphertext = ${rationale} WHERE id = ${redressId}`,
  )
  const deliveries: CopyrightStatementDeliveryInput[] = []
  if (input.disposition === 'revoke') {
    const { rows: restrictions } = await transaction<{ id: string }>(
      sql`/* seedCommittedTerritorialRedressDecision:restrictions */ SELECT restriction.id FROM copyright_territorial_redress_requests request JOIN copyright_restrictions restriction ON restriction.authorizing_assessment_id = request.authorizing_assessment_identity_id WHERE request.id = ${redressId} AND restriction.lifted_at IS NULL ORDER BY restriction.id`,
    )
    for (const restriction of restrictions) {
      await createCopyrightRestoreIntentForReversalInTransaction(restriction.id, transaction)
    }
    await applyCopyrightConfirmationConsequencesInTransaction(noticeId, transaction)
    const claimant = await buildCopyrightClaimantDecisionDelivery(
      { noticeId, event: 'reversed' },
      transaction,
    )
    if (claimant) deliveries.push(claimant)
  }
  const redress = await buildTerritorialRedressDecisionDelivery(
    { noticeId, redressId, disposition: input.disposition, rationale: input.rationale },
    transaction,
  )
  if (redress) deliveries.push(redress)
  await createCopyrightStatementDeliveriesInTransaction(deliveries, transaction)
  await transaction(
    sql`/* seedCommittedTerritorialRedressDecision:clock */ UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = ${noticeId}`,
  )
  await transaction.commit()
  return rows[0]
}
