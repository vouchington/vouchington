import { beginTransaction } from '@data-stores/psql'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { selectTerritorialParent } from './case-collection-parent.mts'
import {
  selectTerritorialStaffClaimants,
  territorialClaimantCursorScope,
} from './read-models-staff-territorial-claimants.mts'
import {
  selectTerritorialStaffPosters,
  territorialPosterCursorScope,
} from './read-models-staff-territorial-posters.mts'

/** One page of targets, with the posters to notify for each, for the notice's live decision. */
export async function listCopyrightTerritorialPosters(
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
  const scope = decisionId ? territorialPosterCursorScope(noticeId, decisionId) : ''
  const afterTargetId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const page =
    decisionId && decidedAt
      ? await selectTerritorialStaffPosters({ noticeId, decisionId, decidedAt }, transaction, {
          limit: options.limit,
          afterTargetId,
        })
      : { results: [], hasNextPage: false }
  await transaction.commit()
  return {
    results: page.results,
    page_info: buildPageInfo(page.results, {
      hasNextPage: page.hasNextPage,
      getCursor: item => ({ id: item.target_id, scope }),
    }),
  }
}

/** One page of the notifiers of the notice's live decision, from its filing receipts. */
export async function listCopyrightTerritorialClaimants(
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
  const scope = decisionId ? territorialClaimantCursorScope(noticeId, decisionId) : ''
  const afterReceiptId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const page =
    decisionId && decidedAt
      ? await selectTerritorialStaffClaimants({ noticeId, decidedAt }, transaction, {
          limit: options.limit,
          afterReceiptId,
        })
      : { results: [], hasNextPage: false }
  await transaction.commit()
  return {
    results: page.results,
    page_info: buildPageInfo(page.results, {
      hasNextPage: page.hasNextPage,
      getCursor: item => ({ id: item.receipt_id, scope }),
    }),
  }
}
