import { lockCopyrightActionGenerationForWrite } from './action-delivery-generation.mts'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
export {
  completeCopyrightActionIntentInTransaction,
  hasCopyrightActionBlocker,
  hasOtherActiveCopyrightRestrictions,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
} from './action-delivery-locking.mts'
export { failCopyrightActionIntent } from './action-delivery-completion.mts'

export {
  claimCopyrightActionIntent,
  renewCopyrightActionIntentLease,
  type CopyrightClaimedActionIntent,
} from './action-delivery-claims.mts'

/** Pages the action intents that are due for delivery or whose claim lease expired at `now`. */
export function searchRecoverableCopyrightActionIntentIds(
  options: CopyrightSweepPageOptions & { now: Date },
): Promise<CopyrightSweepIdPage> {
  // `completed_at IS NULL` lets the planner prove the partial pending-intent index predicate.
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright action intent cursor',
    'searchRecoverableCopyrightActionIntentIds',
    'rowId',
    sql`/* searchRecoverableCopyrightActionIntentIds */
      SELECT id
      FROM copyright_notice_action_work_items
      WHERE completed_at IS NULL
        AND (
          (state = 'pending' AND available_at <= ${options.now})
          OR (state = 'claimed'
            AND lease_expires_at <= ${options.now})
        )`,
    statement => read(statement),
  )
}

export async function reopenCopyrightRestoreIntentInTransaction(
  intentId: string,
  query: TransactionQuery,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(sql`
    /* reopenCopyrightRestoreIntentInTransaction */
    WITH reopened AS (UPDATE copyright_notice_action_work_items intent
    SET attempt_count = 0, leased_at = NULL,
      completed_at = NULL, completed_at_reason = NULL, available_at = clock_timestamp(),
      failure_message = 'Reopened after the legal blocker was resolved.'
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.copyright_restriction_id = restriction.id
      AND intent.id = ${intentId}
      AND intent.action = 'restore'
      AND intent.state = 'blocked'
    RETURNING target.copyright_notice_id, intent.id)
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_action_intent_id
    )
    SELECT copyright_notice_id, 'copyright_action_replayed', id
    FROM reopened RETURNING id
  `)
  return rows.length === 1
}

/** Staff/operator recovery for a terminal provider outage. Unlike periodic reconciliation this is
 * explicit, so a poison AWS failure cannot churn indefinitely while a legal withhold remains
 * safely denied at the edge. */
export async function replayFailedCopyrightActionIntent(input: {
  intentId: string
  noticeId: string
  actorUserId: string
}): Promise<boolean> {
  await using transaction = await beginTransaction()
  const replayed = await recordCopyrightActionReplay(input, transaction)
  if (replayed) await transaction.commit()
  return replayed
}

async function recordCopyrightActionReplay(
  input: { intentId: string; noticeId: string; actorUserId: string },
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<boolean> {
  await lockCopyrightActionGenerationForWrite(input.noticeId, transaction)
  const { rows: events } = await transaction<{ id: string }>(sql`
    /* replayFailedCopyrightActionIntent:event */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id,
      copyright_notice_action_intent_id, replay_reason
    )
    SELECT target.copyright_notice_id, 'copyright_action_replayed', ${input.actorUserId},
      intent.id, 'operator_replay'
    FROM copyright_notice_action_work_items intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.id = ${input.intentId} AND target.copyright_notice_id = ${input.noticeId}
      AND intent.state = 'failed'
    RETURNING id
  `)
  if (events.length === 0) return false
  const { rowCount } = await transaction(sql`
    /* replayFailedCopyrightActionIntent */
    UPDATE copyright_notice_action_work_items
    SET attempt_count = 0, leased_at = NULL, completed_at = NULL,
      completed_at_reason = NULL, available_at = clock_timestamp(),
      failure_message = 'Explicit operator replay after external delivery failure.'
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE copyright_notice_action_work_items.id = ${input.intentId}
      AND copyright_notice_action_work_items.copyright_restriction_id = restriction.id
      AND target.copyright_notice_id = ${input.noticeId}
      AND copyright_notice_action_work_items.state = 'failed'
  `)
  // A competing replay may win after the event's source read. Discard the tentative audit and
  // notice clock with this owned transaction when its conditional work-item update loses.
  if (rowCount !== 1) return false
  return true
}
