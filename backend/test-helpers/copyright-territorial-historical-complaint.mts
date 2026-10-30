import { beginTransaction } from '@data-stores/psql'
import { openCopyrightSecrets } from '../services/copyright-notices/encryption-keys.mts'
import sql from 'sql-template-strings'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'

export async function insertTestHistoricalTerritorialComplaint(input: {
  noticeId: string
  requesterUserId: string
  idempotencyKey: string
  receivedAt: Date
}): Promise<string> {
  await using transaction = await beginTransaction()
  await using secrets = await openCopyrightSecrets(
    { kind: 'notice', id: input.noticeId },
    transaction,
    'write',
  )
  const { encryptSecret } = secrets
  const { rows } = await transaction<{ id: string }>(sql`
    /* insertTestHistoricalTerritorialComplaint */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      challenged_decision_outcome, authorizing_assessment_identity_id,
      submitted_by_id, filed_by, idempotency_key, explanation_ciphertext, received_at
    ) SELECT ${input.noticeId}, 'eu_dsa', notice.current_territorial_decision_identity_id,
      notice.territorial_decision_outcome, notice.territorial_authorizing_assessment_identity_id,
      ${input.requesterUserId}, 'notifier',
      ${input.idempotencyKey},
      ${encryptSecret('Earlier complaint', `${territorialLabels('eu_dsa').redressPurpose}:${input.idempotencyKey}`)},
      ${input.receivedAt}
    FROM copyright_notices notice
    WHERE notice.id = ${input.noticeId} AND notice.jurisdiction = 'eu_dsa'
    RETURNING id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('Historical complaint was not inserted')
  await transaction.commit()
  return id
}
