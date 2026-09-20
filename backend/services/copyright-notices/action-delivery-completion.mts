import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightActionIntentRecord } from './types.mts'
import type { CopyrightActionDeliveryOutcome } from './action-delivery-state.mts'

const MAX_ATTEMPTS = 5
const RETRY_BASE_MS = 60 * 1000

export async function completeCopyrightActionIntent(input: {
  intentId: string
  outcome: CopyrightActionDeliveryOutcome
  completedAt: Date
  failureMessage?: string
}): Promise<boolean> {
  const { rowCount } = await write(sql`/* completeCopyrightActionIntent */
    UPDATE copyright_notice_action_intents
    SET state = ${input.outcome}, completed_at = ${input.completedAt},
      completed_at_reason = ${input.outcome}, failure_message = ${input.failureMessage ?? null},
      next_attempt_at = NULL
    WHERE id = ${input.intentId} AND state = 'claimed'
  `)
  return rowCount === 1
}

export async function failCopyrightActionIntent(input: {
  intentId: string
  failedAt: Date
  failureMessage: string
}): Promise<'retrying' | 'failed' | 'not_claimed'> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<Pick<CopyrightActionIntentRecord, 'delivery_attempt_count'>>(
    sql`/* failCopyrightActionIntent:lock */
      SELECT delivery_attempt_count
      FROM copyright_notice_action_intents
      WHERE id = ${input.intentId} AND state = 'claimed'
      FOR UPDATE
    `,
  )
  const intent = rows[0]
  if (!intent) return 'not_claimed'
  const failed = intent.delivery_attempt_count >= MAX_ATTEMPTS
  await transaction(sql`/* failCopyrightActionIntent */
    UPDATE copyright_notice_action_intents
    SET state = ${failed ? 'failed' : 'pending'},
      completed_at = ${failed ? input.failedAt : null},
      completed_at_reason = ${failed ? 'failed' : null},
      failure_message = ${input.failureMessage.slice(0, 4096)},
      claimed_at = CASE WHEN ${failed} THEN claimed_at ELSE NULL END,
      next_attempt_at = ${
        failed
          ? null
          : new Date(
              input.failedAt.getTime() + RETRY_BASE_MS * 2 ** (intent.delivery_attempt_count - 1),
            )
      }
    WHERE id = ${input.intentId} AND state = 'claimed'
  `)
  await transaction.commit()
  return failed ? 'failed' : 'retrying'
}
