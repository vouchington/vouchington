import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** A fresh delivery can refer to evidence whose earlier verification already rejected it. */
export async function createTestMembershipVerificationForPriorEvidence(
  priorId: string,
): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* createTestMembershipVerificationForPriorEvidence */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_record_id, membership_provider_context_id
    )
    SELECT user_id, ${randomUUID()}, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_record_id, membership_provider_context_id
    FROM membership_verifications WHERE id = ${priorId}
    RETURNING id`)
  if (!rows[0]) throw new Error('Prior membership verification was not found')
  return rows[0].id
}
