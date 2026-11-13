import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import {
  lockTerritorialAcknowledgmentQuery,
  updateTerritorialAcknowledgmentQuery,
} from '../services/copyright-notices/territorial-acknowledgment-sql.mts'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from '../services/copyright-notices/last-legal-activity.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import { insertTerritorialConstraintDecision } from './copyright-territorial-decision-fixture.mts'

/** Complete acknowledged/no-action prerequisite for redress request and read subjects. */
export async function seedCommittedTerritorialNoAction(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
  staffId: string,
) {
  await using transaction = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
  if (!notice) throw new Error('Owned territorial notice disappeared')
  const { rows } = await transaction<{ id: string; acknowledged_at: Date | null }>(
    lockTerritorialAcknowledgmentQuery(jurisdiction, noticeId),
  )
  const acknowledgment = rows[0]
  if (!acknowledgment || acknowledgment.acknowledged_at)
    throw new Error('Owned territorial acknowledgment was not pending')
  await transaction(updateTerritorialAcknowledgmentQuery(acknowledgment.id, 'acknowledged'))
  const labels = territorialLabels(jurisdiction)
  await insertTerritorialConstraintDecision(
    transaction,
    noticeId,
    jurisdiction,
    staffId,
    encryptSecret(`Staff reasons ${crypto.randomUUID()}`, `${labels.decisionPurpose}:${noticeId}`),
    encryptSecret(
      'We reviewed the notice and took no action.',
      `${labels.publicExplanationPurpose}:${noticeId}`,
    ),
  )
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId, event: 'not_accepted' },
    transaction,
  )
  await advanceCopyrightLastLegalActivityAt(transaction, notice)
  await transaction.commit()
}
