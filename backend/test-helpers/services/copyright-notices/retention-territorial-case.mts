import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { receiveEuCopyrightNotice } from '../../../services/copyright-notices/eu-notice-receipt.mts'
import { recordCopyrightJurisdictionPolicyApproval } from '../../../services/copyright-notices/jurisdiction-policy.mts'
import { receiveUkCopyrightNotice } from '../../../services/copyright-notices/uk-notice-receipt.mts'
import { createTestUser } from '../../index.mts'

/**
 * An EU DSA or UK notice, received under a freshly approved jurisdiction policy. Nothing in the
 * staff queue holds it open. Optional history covers the separate territorial erasure tables.
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
    const { rows: decisions } = await query<{
      id: string
    }>(sql`/* seedRetentionTerritorialDecision */
      INSERT INTO copyright_territorial_decisions (
        copyright_notice_id, jurisdiction, outcome, automation_disclosure,
        rationale_ciphertext, public_explanation_ciphertext
      ) VALUES (${receipt.notice_id}, ${jurisdiction}, 'no_action', 'human',
        'private rationale', 'private explanation') RETURNING id`)
    const decisionId = decisions[0]!.id
    const { rows: requests } = await query<{ id: string }>(sql`/* seedRetentionTerritorialRedress */
      INSERT INTO copyright_territorial_redress_requests (
        copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
        submitted_by_id, filed_by, idempotency_key, explanation_ciphertext
      ) VALUES (${receipt.notice_id}, ${jurisdiction}, ${decisionId}, ${claimant.id},
        'notifier', ${randomUUID()}, 'private redress') RETURNING id`)
    await query(sql`/* seedRetentionTerritorialRedressDecision */
      INSERT INTO copyright_territorial_redress_decisions (
        copyright_territorial_redress_request_id, staff_disposition, rationale_ciphertext
      ) VALUES (${requests[0]!.id}, 'maintain', 'private decision')`)
    if (jurisdiction === 'eu_dsa')
      await query(sql`/* seedRetentionEuComplaint */
        INSERT INTO copyright_eu_supervised_complaints (
          copyright_notice_id, jurisdiction, authority_reference, explanation_ciphertext
        ) VALUES (${receipt.notice_id}, 'eu_dsa', ${randomUUID()}, 'private complaint')`)
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
    await query.commit()
  }
  return { noticeId: receipt.notice_id }
}
