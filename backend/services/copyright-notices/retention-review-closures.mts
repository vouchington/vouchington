import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from './last-legal-activity.mts'

/** Explicit case lock shared with evidence erasure and the finite legal-record purge. */
async function lockWritableCase(query: TransactionQuery, noticeId: string) {
  const locked = await lockCopyrightNoticeForLegalWrite(query, noticeId)
  assert(locked, 404, 'Copyright notice not found')
  return locked
}

/** A reviewer closes an escalation explicitly; acknowledging a notice does not silently close it. */
export async function closeCopyrightTerritorialEscalation(
  currentUser: PrivateUser,
  noticeId: string,
  escalationId: string,
): Promise<{ closed_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using query = await beginTransaction()
  const locked = await lockWritableCase(query, noticeId)
  const { rows } = await query<{ closed_at: Date }>(sql`/* closeCopyrightTerritorialEscalation */
    UPDATE copyright_territorial_escalations SET closed_at = clock_timestamp(),
      closed_by_id = ${currentUser.id}
    WHERE id = ${escalationId} AND copyright_notice_id = ${noticeId} AND closed_at IS NULL
    RETURNING closed_at`)
  const result =
    rows[0] ??
    (
      await query<{ closed_at: Date }>(sql`/* readCopyrightEscalationClosure */
    SELECT closed_at FROM copyright_territorial_escalations
    WHERE id = ${escalationId} AND copyright_notice_id = ${noticeId}`)
    ).rows[0]
  assert(result, 404, 'Copyright escalation not found')
  if (rows[0]) await advanceCopyrightLastLegalActivityAt(query, locked)
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
  const locked = await lockWritableCase(query, noticeId)
  const { rows } = await query<{
    resolved_at: Date
  }>(sql`/* resolveCopyrightEuSupervisedComplaint */
    UPDATE copyright_eu_supervised_complaints SET resolved_at = clock_timestamp(),
      resolved_by_id = ${currentUser.id}
    WHERE id = ${complaintId} AND copyright_notice_id = ${noticeId} AND resolved_at IS NULL
    RETURNING resolved_at`)
  const result =
    rows[0] ??
    (
      await query<{ resolved_at: Date }>(sql`/* readCopyrightSupervisedComplaintResolution */
    SELECT resolved_at FROM copyright_eu_supervised_complaints
    WHERE id = ${complaintId} AND copyright_notice_id = ${noticeId}`)
    ).rows[0]
  assert(result, 404, 'Copyright supervised complaint not found')
  if (rows[0]) await advanceCopyrightLastLegalActivityAt(query, locked)
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
  const locked = await lockWritableCase(query, noticeId)
  const { rows } = await query<{ id: string }>(sql`/* placeCopyrightCasePreservationHold */
    INSERT INTO copyright_case_preservation_holds (copyright_notice_id, kind, placed_by_id)
    VALUES (${noticeId}, ${kind}::copyright_case_preservation_kinds, ${currentUser.id}) RETURNING id`)
  assert(rows[0], 500, 'Copyright preservation hold was not recorded')
  await advanceCopyrightLastLegalActivityAt(query, locked)
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
  const locked = await lockWritableCase(query, noticeId)
  const { rows } = await query<{ released_at: Date }>(sql`/* releaseCopyrightCasePreservationHold */
    UPDATE copyright_case_preservation_holds SET released_at = clock_timestamp(), released_by_id = ${currentUser.id}
    WHERE id = ${holdId} AND copyright_notice_id = ${noticeId} AND released_at IS NULL RETURNING released_at`)
  assert(rows[0], 409, 'Copyright preservation hold is absent or already released')
  await advanceCopyrightLastLegalActivityAt(query, locked)
  await query.commit()
  return rows[0]
}
