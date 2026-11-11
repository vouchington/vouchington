import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightActionIntentRecord } from './types.mts'

const MAX_ATTEMPTS = 5
const RETRY_BASE_MS = 60 * 1000

export async function failCopyrightActionIntent(input: {
  leaseToken: string
  intentId: string
  failedAt: Date
  failureMessage: string
  beforeRelease?: () => Promise<void>
}): Promise<'retrying' | 'failed' | 'not_claimed'> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<Pick<CopyrightActionIntentRecord, 'attempt_count'>>(
    sql`/* failCopyrightActionIntent:lock */
      SELECT attempt_count
      FROM copyright_notice_action_work_items
      WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken} AND lease_expires_at > clock_timestamp()
    `,
  )
  const intent = rows[0]
  if (!intent) return 'not_claimed'
  // The lease-conditional UPDATE below rejects a worker whose lease lapsed during compensation.
  await input.beforeRelease?.()
  const failed = intent.attempt_count >= MAX_ATTEMPTS
  const { rows: released } = await transaction(sql`/* failCopyrightActionIntent */
    UPDATE copyright_notice_action_work_items
    SET
      completed_at = ${failed ? input.failedAt : null},
      completed_at_reason = ${failed ? 'failed' : null},
      failure_message = ${input.failureMessage.slice(0, 4096)},
      leased_at = CASE WHEN ${failed} THEN leased_at ELSE NULL END,
      available_at = ${
        failed
          ? null
          : new Date(input.failedAt.getTime() + RETRY_BASE_MS * 2 ** (intent.attempt_count - 1))
      }
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken} AND lease_expires_at > clock_timestamp()
    RETURNING id
  `)
  await transaction.commit()
  if (!released[0]) return 'not_claimed'
  return failed ? 'failed' : 'retrying'
}
