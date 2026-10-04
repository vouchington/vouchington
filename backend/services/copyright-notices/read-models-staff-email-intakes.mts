import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  observeSharedDbScope,
  sharedDbCursorScope,
} from '@data-stores/psql/shared-db-scope-observer'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakeAwaitingReviewSql } from './read-models-staff-email-intakes-sql.mts'

export type CopyrightStaffEmailIntakeQueueItem = {
  id: string
  received_at: Date
  // 'unparsed' until the SES worker records a parse; a stuck parse stays here for staff to see.
  parse_status: 'succeeded' | 'failed' | 'unparsed'
  recommendation_id: string | null
  review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
  linked_notice_id: string | null
  // Why staff see it: still unreviewed, or the reply to its declined intake failed or bounced.
  waiting_reason: 'awaiting_review' | 'reply_failed' | 'reply_bounced'
  // `received_at` while unreviewed; the time the reply failed or bounced otherwise.
  waiting_since: Date
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
  observeSharedDbScope('searchCopyrightStaffEmailIntakes', sharedDbCursorScope(options.after?.id))
  await using transaction = await beginTransaction()
  const query = sql`/* searchCopyrightStaffEmailIntakes */
    SELECT intake.id, intake.received_at, COALESCE(parse.status::text, 'unparsed') AS parse_status,
      recommendation.id AS recommendation_id, link.link_kind, link.copyright_notice_id AS linked_notice_id,
      reply.state AS reply_state, COALESCE(reply.bounced_at, reply.failed_at, reply.updated_at) AS reply_since,
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
    LEFT JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id
    LEFT JOIN LATERAL (SELECT id FROM copyright_notice_email_intake_recommendations WHERE copyright_notice_email_intake_id = intake.id ORDER BY id DESC LIMIT 1) recommendation ON true
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    LEFT JOIN copyright_notice_delivery_intents reply
      ON reply.copyright_notice_email_intake_id = intake.id
      AND reply.delivery_kind IN ('email_intake_rejected', 'email_intake_needs_information') AND reply.state IN ('failed', 'bounced')
    WHERE (`.append(copyrightEmailIntakeAwaitingReviewSql())
  query.append(sql` OR reply.id IS NOT NULL)`)
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
    parse_status: 'succeeded' | 'failed' | 'unparsed'
    recommendation_id: string | null
    link_kind: 'initial' | 'thread' | null
    linked_notice_id: string | null
    reply_state: 'failed' | 'bounced' | null
    reply_since: Date | null
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
      waiting_reason: row.reply_state ? `reply_${row.reply_state}` : 'awaiting_review',
      waiting_since: row.reply_since ?? row.received_at,
      cursor_received_at: row.cursor_received_at,
    })),
    hasNextPage: rows.length > options.limit,
  }
}
