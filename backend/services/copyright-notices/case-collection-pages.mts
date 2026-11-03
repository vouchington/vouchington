import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedAliasCursor, decodeScopedUuidCursor } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  euSettlementCursorScope,
  selectEuParticipantSettlements,
  selectEuStaffSettlements,
} from './read-models-eu-settlements.mts'
import { getCopyrightNoticeViewerRole } from './read-models.mts'
import {
  selectTerritorialStaffComplaints,
  territorialComplaintCursorScope,
} from './read-models-staff-territorial-complaints.mts'
import {
  selectTerritorialStaffRecipients,
  territorialRecipientAlias,
  territorialRecipientCursorScope,
} from './read-models-staff-territorial-recipients.mts'

type TerritorialParent = {
  jurisdiction: 'eu_dsa' | 'uk'
  decision_id: string | null
  decided_at: Date | null
}

async function selectTerritorialParent(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<TerritorialParent> {
  const { rows } =
    await transaction<TerritorialParent>(sql`/* listCopyrightTerritorialComplaints:case */
    SELECT notice.jurisdiction,
      notice.current_territorial_decision_identity_id AS decision_id,
      notice.territorial_decided_at AS decided_at
    FROM copyright_notices notice
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = notice.id AND receipt.jurisdiction = notice.jurisdiction
    WHERE notice.id = ${noticeId} AND notice.jurisdiction IN ('eu_dsa', 'uk')`)
  assert(rows[0], 404, 'Territorial copyright notice not found')
  return rows[0]
}

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

/** One page of the recipients of the notice's live decision, for staff. */
export async function listCopyrightTerritorialRecipients(
  currentUser: PrivateUser,
  noticeId: string,
  options: { limit: number; after?: string },
) {
  assertNotSuspended(currentUser)
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Copyright review staff required')
  await using transaction = await beginTransaction()
  const { decision_id: decisionId, decided_at: decidedAt } = await selectTerritorialParent(
    noticeId,
    transaction,
  )
  if (options.after) assert(decisionId, 400, 'Invalid cursor format')
  const scope = decisionId ? territorialRecipientCursorScope(noticeId, decisionId) : ''
  const after = options.after
    ? parseRecipientAlias(
        decodeScopedAliasCursor(options.after, scope, 'Invalid cursor format').alias,
      )
    : undefined
  const page =
    decisionId && decidedAt
      ? await selectTerritorialStaffRecipients({ noticeId, decisionId, decidedAt }, transaction, {
          limit: options.limit,
          after,
        })
      : { results: [], hasNextPage: false }
  await transaction.commit()
  return {
    results: page.results,
    page_info: buildPageInfo(page.results, {
      hasNextPage: page.hasNextPage,
      getCursor: item => ({ alias: territorialRecipientAlias(item), scope }),
    }),
  }
}

function parseRecipientAlias(alias: string): { role: string; userId: string | null } {
  const [role, userId = ''] = alias.split(':')
  assert(role === 'claimant' || role === 'poster', 400, 'Invalid cursor format')
  assert(userId === '' || isUUID(userId), 400, 'Invalid cursor format')
  return { role, userId: userId || null }
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
