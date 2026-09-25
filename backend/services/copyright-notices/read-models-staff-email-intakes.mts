import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightStaffEmailIntakeQueueItem = {
  id: string
  received_at: Date
  parse_status: 'succeeded' | 'failed'
  recommendation_id: string | null
  review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
  linked_notice_id: string | null
}

// Names the `(received_at, id)` ascending keyset below; cursors encoded under another scope are
// rejected, so a cursor from a different list can never seek into this one.
export const copyrightStaffEmailIntakeQueueCursorScope =
  'copyright-email-intakes:staff-queue:received-at-asc-id-asc'

export async function searchCopyrightStaffEmailIntakes(
  currentUser: PrivateUser,
  options: { limit: number; after?: { timestamp: string; id: string } },
): Promise<{
  intakes: Array<CopyrightStaffEmailIntakeQueueItem & { cursor_received_at: string }>
  hasNextPage: boolean
}> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) {
    return { intakes: [], hasNextPage: false }
  }
  await using transaction = await beginTransaction()
  const query = sql`/* searchCopyrightStaffEmailIntakes */
    SELECT intake.id, intake.received_at, parse.status AS parse_status, recommendation.id AS recommendation_id,
      link.link_kind, link.copyright_notice_id AS linked_notice_id,
      to_char(
        intake.received_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_received_at,
      EXISTS (
        SELECT 1 FROM copyright_notice_email_thread_references reference
        WHERE reference.copyright_notice_email_intake_id = intake.id
          AND reference.reference_kind = 'reply_reference'
      ) AS has_reply_reference
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_parses parse ON parse.copyright_notice_email_intake_id = intake.id
    LEFT JOIN LATERAL (SELECT id FROM copyright_notice_email_intake_recommendations WHERE copyright_notice_email_intake_id = intake.id ORDER BY id DESC LIMIT 1) recommendation ON true
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    WHERE NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review WHERE review.copyright_notice_email_intake_id = intake.id)
      AND (
        link.link_kind IS NULL
        OR (
          link.link_kind = 'thread'
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_email_correspondence_reviews review
            WHERE review.copyright_notice_email_intake_id = intake.id
              AND review.action IN ('admitted', 'rejected')
          )
        )
      )
  `
  if (options.after) {
    query.append(sql`
      AND (intake.received_at, intake.id) > (${options.after.timestamp}::timestamptz, ${options.after.id})`)
  }
  query.append(sql`
    ORDER BY intake.received_at, intake.id
    LIMIT ${options.limit + 1}
  `)
  const { rows } = await transaction<{
    id: string
    received_at: Date
    parse_status: 'succeeded' | 'failed'
    recommendation_id: string | null
    link_kind: 'initial' | 'thread' | null
    linked_notice_id: string | null
    cursor_received_at: string
    has_reply_reference: boolean
  }>(query)
  await transaction.commit()
  return {
    intakes: rows.slice(0, options.limit).map(row => ({
      id: row.id,
      received_at: row.received_at,
      parse_status: row.parse_status,
      recommendation_id: row.recommendation_id,
      review_path:
        row.link_kind === 'thread'
          ? 'matched_thread'
          : row.has_reply_reference
            ? 'unresolved_thread'
            : 'initial',
      linked_notice_id: row.linked_notice_id,
      cursor_received_at: row.cursor_received_at,
    })),
    hasNextPage: rows.length > options.limit,
  }
}
