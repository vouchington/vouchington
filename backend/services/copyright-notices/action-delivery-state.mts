import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'
import type { CopyrightActionIntentRecord } from './types.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
export type { CopyrightActionDeliveryOutcome } from './action-delivery-state-types.mts'
export {
  completeCopyrightActionIntentInTransaction,
  getCopyrightActionPlacementKey,
  hasCopyrightActionBlocker,
  hasOtherActiveCopyrightRestrictions,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
  lockCopyrightActionDelivery,
} from './action-delivery-locking.mts'
export type { LockedCopyrightActionDelivery } from './action-delivery-locking.mts'
export { failCopyrightActionIntent } from './action-delivery-completion.mts'

const MAX_ATTEMPTS = 5
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

export type CopyrightClaimedActionIntent = CopyrightActionIntentRecord & {
  placement_id: string
  image_id: string
}

export async function claimCopyrightActionIntent(
  intentId: string,
  now: Date,
): Promise<CopyrightClaimedActionIntent | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightClaimedActionIntent>(sql`
    /* claimCopyrightActionIntent */
    WITH exhausted AS (
      UPDATE copyright_notice_action_intents intent
      SET state = 'failed', completed_at = ${now}, completed_at_reason = 'failed',
        failure_message = 'A claimed copyright action exceeded the maximum delivery attempts.',
        next_attempt_at = NULL
      WHERE intent.id = ${intentId}
        AND intent.state = 'claimed'
        AND intent.claimed_at <= ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)}
        AND intent.delivery_attempt_count >= ${MAX_ATTEMPTS}
    ), candidate AS (
      SELECT intent.id
      FROM copyright_notice_action_intents intent
      WHERE intent.id = ${intentId}
        AND (
          (intent.state = 'pending' AND (intent.next_attempt_at IS NULL OR intent.next_attempt_at <= ${now}))
          OR (intent.state = 'claimed' AND intent.claimed_at <= ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)})
        )
      FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE copyright_notice_action_intents intent
    SET state = 'claimed', delivery_attempt_count = intent.delivery_attempt_count + 1,
      claimed_at = ${now}, next_attempt_at = NULL, failure_message = NULL
    FROM candidate
    WHERE intent.id = candidate.id
      AND intent.delivery_attempt_count < ${MAX_ATTEMPTS}
      RETURNING intent.*
    )
    SELECT claimed.*, target.placement_id, target_image.image_id
    FROM claimed
    JOIN copyright_restrictions restriction ON restriction.id = claimed.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notice_target_images target_image
      ON target_image.copyright_notice_target_id = target.id
  `)
  await transaction.commit()
  return rows[0] ?? null
}

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
      FROM copyright_notice_action_intents
      WHERE completed_at IS NULL
        AND (
          (state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ${options.now}))
          OR (state = 'claimed'
            AND claimed_at <= ${new Date(options.now.getTime() - CLAIM_TIMEOUT_MS)})
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
    WITH reopened AS (UPDATE copyright_notice_action_intents intent
    SET state = 'pending', delivery_attempt_count = 0, claimed_at = NULL,
      completed_at = NULL, completed_at_reason = NULL, next_attempt_at = NULL,
      failure_message = 'Reopened after the legal blocker was resolved.'
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.copyright_restriction_id = restriction.id
      AND intent.id = ${intentId}
      AND intent.action = 'restore'
      AND intent.state = 'blocked'
    RETURNING target.copyright_notice_id, intent.id)
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, copyright_notice_action_intent_id
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
  const { rows: targets } = await transaction<{ placement_id: string }>(sql`
    /* replayFailedCopyrightActionIntent:identity */
    SELECT target.placement_id FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.id = ${input.intentId} AND target.copyright_notice_id = ${input.noticeId}
  `)
  if (!targets[0]) return false
  await transaction(sql`/* replayFailedCopyrightActionIntent:placementLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`image-placement:${targets[0].placement_id}`}, 0))
  `)
  const { rows } = await transaction<{ copyright_notice_id: string }>(sql`
    /* replayFailedCopyrightActionIntent */
    UPDATE copyright_notice_action_intents
    SET state = 'pending', delivery_attempt_count = 0, claimed_at = NULL, completed_at = NULL,
      completed_at_reason = NULL, next_attempt_at = NULL,
      failure_message = 'Explicit operator replay after external delivery failure.'
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE copyright_notice_action_intents.id = ${input.intentId}
      AND copyright_notice_action_intents.copyright_restriction_id = restriction.id
      AND target.copyright_notice_id = ${input.noticeId}
      AND copyright_notice_action_intents.state = 'failed'
    RETURNING target.copyright_notice_id
  `)
  const replayed = rows[0]
  if (replayed) {
    await transaction(sql`/* replayFailedCopyrightActionIntent:event */
      INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id,
        copyright_notice_action_intent_id, replay_reason)
      VALUES (${replayed.copyright_notice_id}, 'copyright_action_replayed', ${input.actorUserId},
        ${input.intentId}, 'operator_replay')
    `)
  }
  await transaction.commit()
  return replayed !== undefined
}
