import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

/** Staff view of a guest capability. The token and its hash never leave the database. */
type CopyrightGuestCapabilitySummary = {
  id: string
  issued_at: Date
  issued_by_id: string | null
  issued_by_username: string | null
  expires_at: Date
  revoked_at: Date | null
}

export function copyrightGuestCapabilityCursorScope(noticeId: string): string {
  return `copyright-guest-capabilities:${noticeId}`
}

export async function listCopyrightGuestCapabilities(input: {
  currentUser: PrivateUser
  noticeId: string
  limit: number
  afterId?: string
}): Promise<{ results: CopyrightGuestCapabilitySummary[]; hasNextPage: boolean }> {
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Only copyright staff can list guest capabilities',
  )
  const query = sql`/* listCopyrightGuestCapabilities */
    SELECT
      capability.id,
      capability.created_at AS issued_at,
      capability.issued_by_id,
      issuer.username AS issued_by_username,
      capability.expires_at,
      capability.revoked_at
    FROM copyright_notice_guest_capabilities capability
    LEFT JOIN users issuer ON issuer.id = capability.issued_by_id AND issuer.deleted_at IS NULL
    WHERE capability.copyright_notice_id = ${input.noticeId}`
  if (input.afterId) query.append(sql` AND capability.id < ${input.afterId}`)
  query.append(sql` ORDER BY capability.id DESC LIMIT ${input.limit + 1}`)
  // Read the primary so a capability issued a moment ago appears when staff reload the list.
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightGuestCapabilitySummary>(query)
  await transaction.commit()
  return { results: rows.slice(0, input.limit), hasNextPage: rows.length > input.limit }
}
