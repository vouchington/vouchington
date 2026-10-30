import { openCopyrightSecrets } from '../../../services/copyright-notices/encryption-keys.mts'
import { territorialLabels } from '../../../services/copyright-notices/territorial-labels.mts'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { receiveEuCopyrightNotice } from '../../../services/copyright-notices/eu-notice-receipt.mts'
import { recordCopyrightJurisdictionPolicyApproval } from '../../../services/copyright-notices/jurisdiction-policy.mts'
import { receiveUkCopyrightNotice } from '../../../services/copyright-notices/uk-notice-receipt.mts'
import { createTestUser } from '../../index.mts'
import { v7 as uuidv7 } from 'uuid'

/**
 * An EU DSA or UK notice, received under a freshly approved jurisdiction policy. Optional unresolved
 * history covers the separate territorial erasure tables; eligibility fixtures must settle it.
 */
export async function createRetentionTerritorialCase(
  jurisdiction: 'eu_dsa' | 'uk',
  withHistory = false,
) {
  const [claimant, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ administrator: true }),
  ])
  await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction,
    policyVersion: `${jurisdiction}-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  })
  const suffix = randomUUID()
  const notice = {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  }
  const requester = { user: claimant, identity: `user:${claimant.id}` }
  const receipt =
    jurisdiction === 'eu_dsa'
      ? await receiveEuCopyrightNotice(requester, randomUUID(), {
          ...notice,
          notifierName: 'Retention notifier',
          notifierEmail: notice.contact,
          goodFaithStatement: true,
        })
      : await receiveUkCopyrightNotice(requester, randomUUID(), notice)
  if (withHistory) {
    await using query = await beginTransaction()
    {
      await using secrets = await openCopyrightSecrets(
        { kind: 'notice', id: receipt.notice_id },
        query,
        'write',
      )
      const { encryptSecret } = secrets
      const labels = territorialLabels(jurisdiction)
      const redressKey = randomUUID()
      const authorityReference = randomUUID()
      const decisionId = uuidv7()
      const rationale = encryptSecret(
        'private rationale',
        `${labels.decisionPurpose}:${receipt.notice_id}`,
      )
      const publicExplanation = encryptSecret(
        'private explanation',
        `${labels.publicExplanationPurpose}:${receipt.notice_id}`,
      )
      await query(sql`/* seedRetentionTerritorialDecisionIdentity */
        INSERT INTO copyright_territorial_decision_identities
          (id, copyright_notice_id, jurisdiction)
        VALUES (${decisionId}, ${receipt.notice_id}, ${jurisdiction})`)
      await query(sql`/* seedRetentionTerritorialDecisionOwner */
        UPDATE copyright_notices SET current_territorial_decision_identity_id = ${decisionId},
          territorial_decision_outcome = 'no_action', territorial_decided_at = CURRENT_TIMESTAMP,
          territorial_decided_by_id = ${administrator.id},
          territorial_rationale_ciphertext = ${rationale},
          territorial_public_explanation_ciphertext = ${publicExplanation}
        WHERE id = ${receipt.notice_id}`)
      await query(sql`/* seedRetentionTerritorialDecision */
      INSERT INTO copyright_territorial_decisions (
        id, copyright_notice_id, jurisdiction, decided_by_id, outcome, automation_disclosure,
        rationale_ciphertext, public_explanation_ciphertext
      ) VALUES (${decisionId}, ${receipt.notice_id}, ${jurisdiction}, ${administrator.id},
        'no_action', 'human', ${rationale}, ${publicExplanation})`)
      const { rows: requests } = await query<{
        id: string
      }>(sql`/* seedRetentionTerritorialRedress */
      INSERT INTO copyright_territorial_redress_requests (
        copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
        challenged_decision_outcome,
        submitted_by_id, filed_by, idempotency_key, explanation_ciphertext
      ) VALUES (${receipt.notice_id}, ${jurisdiction}, ${decisionId}, 'no_action', ${claimant.id},
        'notifier', ${redressKey}, ${encryptSecret('private redress', `${labels.redressPurpose}:${redressKey}`)}) RETURNING id`)
      const redressDecisionId = uuidv7()
      const redressRationale = encryptSecret(
        'private decision',
        `${labels.redressDecisionPurpose}:${requests[0]!.id}`,
      )
      await query(sql`/* seedRetentionTerritorialRedressDecisionIdentity */
        INSERT INTO copyright_territorial_redress_decision_identities
          (id, copyright_notice_id, copyright_territorial_redress_request_id)
        VALUES (${redressDecisionId}, ${receipt.notice_id}, ${requests[0]!.id})`)
      await query(sql`/* seedRetentionTerritorialRedressDecisionOwner */
        UPDATE copyright_territorial_redress_requests
        SET staff_disposition = 'maintain', current_staff_decision_identity_id = ${redressDecisionId},
          decided_at = CURRENT_TIMESTAMP, decided_by_id = ${administrator.id},
          rationale_ciphertext = ${redressRationale}
        WHERE id = ${requests[0]!.id}`)
      await query(sql`/* seedRetentionTerritorialRedressDecision */
      INSERT INTO copyright_territorial_redress_decisions (
        id, copyright_notice_id, jurisdiction, copyright_territorial_redress_request_id,
        decided_by_id, staff_disposition, rationale_ciphertext
      ) VALUES (${redressDecisionId}, ${receipt.notice_id}, ${jurisdiction}, ${requests[0]!.id},
        ${administrator.id}, 'maintain', ${redressRationale})`)
      if (jurisdiction === 'eu_dsa')
        await query(sql`/* seedRetentionEuComplaint */
        INSERT INTO copyright_eu_supervised_complaints (
          copyright_notice_id, jurisdiction, recorded_by_id, idempotency_key, authority_reference, explanation_ciphertext
        ) VALUES (${receipt.notice_id}, 'eu_dsa', ${administrator.id}, ${randomUUID()}, ${authorityReference},
          ${encryptSecret('private complaint', `copyright-eu-supervised:${receipt.notice_id}:${authorityReference}`)})`)
      if (jurisdiction === 'eu_dsa')
        await query(sql`/* finishRetentionEuDeliveries */
        UPDATE copyright_notice_delivery_work_items
        SET leased_at = NULL,
          delivery_attempted_at = COALESCE(delivery_attempted_at, CURRENT_TIMESTAMP),
          failed_at = CURRENT_TIMESTAMP,
          available_at = NULL,
          attempt_count = GREATEST(attempt_count, 5)
        WHERE copyright_notice_id = ${receipt.notice_id}
          AND state IN ('pending', 'claimed')`)
    }
    await query.commit()
  }
  return { noticeId: receipt.notice_id }
}
