import { beginTransaction } from '@data-stores/psql'
import {
  receiveEuCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
} from '../services/copyright-notices/index.mts'
import { recordEuCopyrightSupervisedComplaint } from '../services/copyright-notices/eu-supervised-complaint.mts'
import { createTestUser } from './entities/users.mts'
import sql from 'sql-template-strings'

/** A real EU case plus the complaint and escalation it produced through the service contracts. */
export async function createRetentionReviewComplaintCase() {
  const [claimant, reviewer, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `retention-${crypto.randomUUID()}`,
  })
  const suffix = crypto.randomUUID()
  const notice = await receiveEuCopyrightNotice(
    { user: claimant, identity: `user:${claimant.id}` },
    crypto.randomUUID(),
    {
      contact: `claimant-${suffix}@example.test`,
      contentDescription: `Work ${suffix}`,
      grounds: `Grounds ${suffix}`,
      hostedUseUrl: `https://example.test/${suffix}`,
      notifierName: `Notifier ${suffix}`,
      notifierEmail: `notifier-${suffix}@example.test`,
      goodFaithStatement: true,
    },
  )
  const complaint = await recordEuCopyrightSupervisedComplaint(claimant, notice.notice_id, {
    idempotencyKey: crypto.randomUUID(),
    authorityReference: `authority-${suffix}`,
    explanation: `Complaint ${suffix}`,
  })
  return {
    noticeId: notice.notice_id,
    complaintId: complaint.id,
    escalationId: complaint.escalation_id,
    claimant,
    reviewer,
  }
}

/** Marks a unique test case as already erased. */
export async function markCopyrightReviewCaseExpired(noticeId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* markCopyrightReviewCaseExpired */
    UPDATE copyright_notices SET evidence_erased_at = clock_timestamp()
    WHERE id = ${noticeId}`)
  await query.commit()
}

/** Read the append-only outcomes to prove a cross-case request did not mutate its source case. */
export async function readCopyrightRetentionReviewOutcomes(noticeId: string) {
  await using query = await beginTransaction()
  const { rows } = await query<{ closure_count: number; resolution_count: number }>(sql`
    /* readCopyrightRetentionReviewOutcomes */
    SELECT
      (SELECT COUNT(*)::integer FROM copyright_territorial_escalations
        WHERE copyright_notice_id = ${noticeId} AND closed_at IS NOT NULL) AS closure_count,
      (SELECT COUNT(*)::integer FROM copyright_eu_supervised_complaints
        WHERE copyright_notice_id = ${noticeId} AND resolved_at IS NOT NULL) AS resolution_count`)
  await query.commit()
  return rows[0] ?? { closure_count: 0, resolution_count: 0 }
}
