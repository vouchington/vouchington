import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

/** Explicit case lock shared with evidence erasure and the finite legal-record purge. */
async function lockWritableCase(query: TransactionQuery, noticeId: string): Promise<void> {
  const { rows } = await query<{ id: string }>(sql`/* lockCopyrightRetentionReviewCase */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
  assert(rows[0], 404, 'Copyright notice not found')
  const { rows: erased } = await query(sql`/* rejectErasedCopyrightRetentionReview */
    SELECT id FROM copyright_notice_retention_erasures WHERE copyright_notice_id = ${noticeId}`)
  assert(erased.length === 0, 410, 'Copyright case has expired')
}

/** A reviewer closes an escalation explicitly; acknowledging a notice does not silently close it. */
export async function closeCopyrightTerritorialEscalation(
  currentUser: PrivateUser,
  noticeId: string,
  escalationId: string,
): Promise<{ closed_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using query = await beginTransaction()
  await lockWritableCase(query, noticeId)
  const { rows } = await query<{ closed_at: Date }>(sql`/* closeCopyrightTerritorialEscalation */
    INSERT INTO copyright_territorial_escalation_closures (copyright_territorial_escalation_id, closed_by_id)
    SELECT id, ${currentUser.id} FROM copyright_territorial_escalations
    WHERE id = ${escalationId} AND copyright_notice_id = ${noticeId}
    ON CONFLICT (copyright_territorial_escalation_id) DO NOTHING
    RETURNING closed_at`)
  const result =
    rows[0] ??
    (
      await query<{ closed_at: Date }>(sql`/* readCopyrightEscalationClosure */
    SELECT closure.closed_at FROM copyright_territorial_escalation_closures closure
    JOIN copyright_territorial_escalations escalation ON escalation.id = closure.copyright_territorial_escalation_id
    WHERE escalation.id = ${escalationId} AND escalation.copyright_notice_id = ${noticeId}`)
    ).rows[0]
  assert(result, 404, 'Copyright escalation not found')
  await query.commit()
  return result
}

/** A supervised complaint remains a blocker independently of its escalation until resolved. */
export async function resolveCopyrightEuSupervisedComplaint(
  currentUser: PrivateUser,
  noticeId: string,
  complaintId: string,
): Promise<{ resolved_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using query = await beginTransaction()
  await lockWritableCase(query, noticeId)
  const { rows } = await query<{
    resolved_at: Date
  }>(sql`/* resolveCopyrightEuSupervisedComplaint */
    INSERT INTO copyright_eu_supervised_complaint_resolutions (copyright_eu_supervised_complaint_id, resolved_by_id)
    SELECT id, ${currentUser.id} FROM copyright_eu_supervised_complaints
    WHERE id = ${complaintId} AND copyright_notice_id = ${noticeId}
    ON CONFLICT (copyright_eu_supervised_complaint_id) DO NOTHING
    RETURNING resolved_at`)
  const result =
    rows[0] ??
    (
      await query<{ resolved_at: Date }>(sql`/* readCopyrightSupervisedComplaintResolution */
    SELECT resolution.resolved_at FROM copyright_eu_supervised_complaint_resolutions resolution
    JOIN copyright_eu_supervised_complaints complaint ON complaint.id = resolution.copyright_eu_supervised_complaint_id
    WHERE complaint.id = ${complaintId} AND complaint.copyright_notice_id = ${noticeId}`)
    ).rows[0]
  assert(result, 404, 'Copyright supervised complaint not found')
  await query.commit()
  return result
}

export async function placeCopyrightCasePreservationHold(
  currentUser: PrivateUser,
  noticeId: string,
  kind: 'litigation_threat' | 'regulator_request' | 'court_request',
): Promise<{ id: string }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  assert(
    ['litigation_threat', 'regulator_request', 'court_request'].includes(kind),
    422,
    'Invalid preservation reason',
  )
  await using query = await beginTransaction()
  await lockWritableCase(query, noticeId)
  const { rows } = await query<{ id: string }>(sql`/* placeCopyrightCasePreservationHold */
    INSERT INTO copyright_case_preservation_holds (copyright_notice_id, kind, placed_by_id)
    VALUES (${noticeId}, ${kind}::copyright_case_preservation_kinds, ${currentUser.id}) RETURNING id`)
  assert(rows[0], 500, 'Copyright preservation hold was not recorded')
  await query.commit()
  return rows[0]
}

export async function releaseCopyrightCasePreservationHold(
  currentUser: PrivateUser,
  noticeId: string,
  holdId: string,
): Promise<{ released_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using query = await beginTransaction()
  await lockWritableCase(query, noticeId)
  const { rows } = await query<{ released_at: Date }>(sql`/* releaseCopyrightCasePreservationHold */
    UPDATE copyright_case_preservation_holds SET released_at = CURRENT_TIMESTAMP, released_by_id = ${currentUser.id}
    WHERE id = ${holdId} AND copyright_notice_id = ${noticeId} AND released_at IS NULL RETURNING released_at`)
  assert(rows[0], 409, 'Copyright preservation hold is absent or already released')
  await query.commit()
  return rows[0]
}
