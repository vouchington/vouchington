import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'
import { lockSupportThread } from './lock-support-thread.mts'

const STAFF_DRAFT_RESERVATION_LEASE_MS = 4 * 60 * 1000

export type SupportDraftGenerationReservation = {
  status: 'reserved'
  id: string
  idempotencyKey: string
  supportMessageId: string
}

export type SupportDraftGenerationReservationResult =
  | SupportDraftGenerationReservation
  | { status: 'no_inbound_message' | 'unavailable' }

export async function reserveSupportDraftGeneration(
  threadId: string,
  params: { modelName: AgentModel; modelProvider: AgentModelProvider },
): Promise<SupportDraftGenerationReservationResult> {
  await using query = await beginTransaction()

  const locked = await lockSupportThread(threadId, { query })
  if (!locked) {
    await query.commit()
    return { status: 'unavailable' }
  }
  const result = await write(
    sql`/* reserveSupportDraftGeneration */
    WITH locked_thread AS (
      SELECT id
      FROM support_threads
      WHERE id = ${threadId}
        AND resolved_at IS NULL
    ),
    reservation AS (
      SELECT uuidv7() AS id
    ),
    latest_inbound AS (
      SELECT id
      FROM support_messages
      WHERE support_thread_id = ${threadId}
        AND direction = 'inbound'
      ORDER BY support_thread_id DESC, id DESC
      LIMIT 1
    ),
    active_automatic_inbound_work AS (
      SELECT 1
      FROM support_inbound_email_receipts receipt
      JOIN latest_inbound ON latest_inbound.id = receipt.support_message_id
      WHERE receipt.support_thread_id = ${threadId}
        AND receipt.processed_at IS NOT NULL
        AND receipt.customer_support_completed_at IS NULL
      LIMIT 1
    ),
    active_automatic_inbound_run AS (
      SELECT 1
      FROM support_agent_runs run
      JOIN latest_inbound ON latest_inbound.id = run.support_message_id
      WHERE run.support_thread_id = ${threadId}
        AND run.staff_draft_requested_at IS NULL
        AND run.completed_at IS NULL
        AND (
          run.failed_at IS NULL
          OR run.input @> ${JSON.stringify({ source: 'member_thread' })}::jsonb
        )
      LIMIT 1
    ),
    unsent_draft AS (
      SELECT 1
      FROM support_messages
      WHERE support_thread_id = ${threadId}
        AND direction = 'outbound'
        AND drafted_at IS NOT NULL
        AND sent_at IS NULL
      LIMIT 1
    ),
    attempted_reservation AS (
      -- One locked thread can produce at most one reservation candidate; resolver cannot model its partial index.
      /* no-mistakes: deadlock-safe */
      INSERT INTO support_agent_runs (
        id,
        support_thread_id,
        support_message_id,
        idempotency_key,
        staff_draft_requested_at,
        model_name,
        model_provider,
        input
      )
      SELECT
        reservation.id,
        locked_thread.id,
        latest_inbound.id,
        reservation.id::TEXT,
        CURRENT_TIMESTAMP,
        ${params.modelName},
        ${params.modelProvider},
        ${JSON.stringify({ source: 'staff_draft_request' })}::jsonb
      FROM locked_thread
      CROSS JOIN reservation
      CROSS JOIN latest_inbound
      WHERE NOT EXISTS (SELECT 1 FROM unsent_draft)
        AND NOT EXISTS (SELECT 1 FROM active_automatic_inbound_work)
        AND NOT EXISTS (SELECT 1 FROM active_automatic_inbound_run)
      ON CONFLICT (support_thread_id)
        WHERE staff_draft_requested_at IS NOT NULL
          AND completed_at IS NULL
          AND failed_at IS NULL
      DO UPDATE
      SET support_message_id = EXCLUDED.support_message_id,
          staff_draft_requested_at = CURRENT_TIMESTAMP,
          model_name = EXCLUDED.model_name,
          model_provider = EXCLUDED.model_provider,
          input = EXCLUDED.input,
          output = NULL,
          error = NULL,
          termination_reason = NULL,
          started_at = CURRENT_TIMESTAMP,
          completed_at = NULL,
          failed_at = NULL
      WHERE support_agent_runs.started_at <=
          CURRENT_TIMESTAMP - ${STAFF_DRAFT_RESERVATION_LEASE_MS} * INTERVAL '1 millisecond'
        AND support_agent_runs.claim_token IS NULL
      RETURNING id, idempotency_key, support_message_id
    )
    SELECT 'reserved' AS status, id, idempotency_key, support_message_id
    FROM attempted_reservation
    UNION ALL
    SELECT 'no_inbound_message' AS status, NULL, NULL, NULL
    FROM locked_thread
    WHERE NOT EXISTS (SELECT 1 FROM latest_inbound)
  `,
    { query },
  )
  await query.commit()
  const rows = result.rows
  const reservation = rows[0] as
    | {
        status: 'reserved'
        id: string
        idempotency_key: string
        support_message_id: string
      }
    | { status: 'no_inbound_message'; id: null; idempotency_key: null; support_message_id: null }
    | undefined
  if (reservation?.status === 'reserved') {
    return {
      status: 'reserved',
      id: reservation.id,
      idempotencyKey: reservation.idempotency_key,
      supportMessageId: reservation.support_message_id,
    }
  }
  if (reservation?.status === 'no_inbound_message') return { status: reservation.status }
  return { status: 'unavailable' }
}
