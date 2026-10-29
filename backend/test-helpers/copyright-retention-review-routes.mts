import { beginTransaction, read } from '@data-stores/psql'
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

/** Marks a unique test case as already erased, exercising the same immutable marker readers see. */
export async function markCopyrightReviewCaseExpired(noticeId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* markCopyrightReviewCaseExpired */
    INSERT INTO copyright_notice_retention_erasures (
      copyright_notice_id, retention_days, erased_object_count, legal_clock_at
    ) VALUES (${noticeId}, 1, 0, CURRENT_TIMESTAMP)`)
  await query.commit()
}

/** Read the append-only outcomes to prove a cross-case request did not mutate its source case. */
export async function readCopyrightRetentionReviewOutcomes(noticeId: string) {
  await using query = await beginTransaction()
  const { rows } = await query<{ closure_count: number; resolution_count: number }>(sql`
    /* readCopyrightRetentionReviewOutcomes */
    SELECT
      (SELECT COUNT(*)::integer FROM copyright_territorial_escalation_closures closure
        JOIN copyright_territorial_escalations escalation
          ON escalation.id = closure.copyright_territorial_escalation_id
        WHERE escalation.copyright_notice_id = ${noticeId}) AS closure_count,
      (SELECT COUNT(*)::integer FROM copyright_eu_supervised_complaint_resolutions resolution
        JOIN copyright_eu_supervised_complaints complaint
          ON complaint.id = resolution.copyright_eu_supervised_complaint_id
        WHERE complaint.copyright_notice_id = ${noticeId}) AS resolution_count`)
  await query.commit()
  return rows[0] ?? { closure_count: 0, resolution_count: 0 }
}

/** Read the retained receipt's one current hold and monotone release clock. */
export async function readCopyrightReceiptPreservationState(receiptId: string) {
  const { rows } = await read<{
    current_preservation_hold_token: string | null
    preservation_hold_kind: string | null
    preservation_hold_placed_at: Date | null
    preservation_hold_placed_by_id: string | null
    preservation_hold_released_at: Date | null
    preservation_hold_released_by_id: string | null
    last_preservation_hold_released_at: Date | null
  }>(sql`/* readCopyrightReceiptPreservationState */
    SELECT current_preservation_hold_token, preservation_hold_kind,
      preservation_hold_placed_at, preservation_hold_placed_by_id,
      preservation_hold_released_at, preservation_hold_released_by_id,
      last_preservation_hold_released_at
    FROM copyright_notice_email_intake_receipts WHERE id = ${receiptId}`)
  return rows[0] ?? null
}
