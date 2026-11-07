import { beginTransaction } from '@data-stores/psql'
import { decodeScopedUuidCursor } from '@modules/pagination'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { selectTerritorialParent } from './case-collection-parent.mts'
import {
  euSettlementCursorScope,
  selectEuParticipantSettlements,
  selectEuStaffSettlements,
} from './read-models-eu-settlements.mts'
import { getCopyrightNoticeViewerRole } from './read-models-participant.mts'
import {
  selectTerritorialStaffComplaints,
  territorialComplaintCursorScope,
} from './read-models-staff-territorial-complaints.mts'

export async function listCopyrightTerritorialComplaints(
  currentUser: PrivateUser,
  noticeId: string,
  options: { limit: number; after?: string },
) {
  assertNotSuspended(currentUser)
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Copyright review staff required')
  await using transaction = await beginTransaction()
  const parent = await selectTerritorialParent(noticeId, transaction)
  if (options.after) assert(parent.decision_id, 400, 'Invalid cursor format')
  const afterId = options.after
    ? decodeScopedUuidCursor(
        options.after,
        territorialComplaintCursorScope(noticeId, parent.decision_id!),
        'Invalid cursor format',
      ).id
    : undefined
  const page = await selectTerritorialStaffComplaints(
    noticeId,
    parent.decision_id,
    parent.decided_at,
    parent.jurisdiction,
    transaction,
    { limit: options.limit, afterId },
  )
  await transaction.commit()
  return page
}

export function listCopyrightEuSettlements(
  currentUser: PrivateUser,
  noticeId: string,
  options: { limit: number; after?: string },
  staffAudit: true,
): Promise<Awaited<ReturnType<typeof selectEuStaffSettlements>>>
export function listCopyrightEuSettlements(
  currentUser: PrivateUser,
  noticeId: string,
  options: { limit: number; after?: string },
  staffAudit?: false,
): Promise<Awaited<ReturnType<typeof selectEuParticipantSettlements>>>
export async function listCopyrightEuSettlements(
  currentUser: PrivateUser,
  noticeId: string,
  options: { limit: number; after?: string },
  staffAudit = false,
) {
  assertNotSuspended(currentUser)
  await using transaction = await beginTransaction()
  const { rows: parents } = await transaction<{ id: string }>(sql`
    /* listCopyrightEuSettlements:case */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} AND jurisdiction = 'eu_dsa'
  `)
  assert(parents[0], 404, 'EU copyright notice not found')
  if (staffAudit) {
    assert(
      currentUserCanReviewCopyrightNotices(currentUser),
      403,
      'Copyright review staff required',
    )
    const afterId = options.after
      ? decodeScopedUuidCursor(
          options.after,
          euSettlementCursorScope(noticeId, 'staff-audit'),
          'Invalid cursor format',
        ).id
      : undefined
    const page = await selectEuStaffSettlements(noticeId, transaction, {
      limit: options.limit,
      afterId,
    })
    await transaction.commit()
    return page
  }
  const role = await getCopyrightNoticeViewerRole(noticeId, currentUser)
  assert(role, 403, 'You are not a participant in this copyright notice')
  const staff = role === 'staff'
  const afterId = options.after
    ? decodeScopedUuidCursor(
        options.after,
        euSettlementCursorScope(
          noticeId,
          staff ? 'staff-participant' : 'participant',
          currentUser.id,
        ),
        'Invalid cursor format',
      ).id
    : undefined
  const page = await selectEuParticipantSettlements(noticeId, currentUser.id, staff, transaction, {
    limit: options.limit,
    afterId,
  })
  await transaction.commit()
  return page
}
