import {
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportMessage } from './types.mts'
import { assertSupportMessageBody } from './body-validation.mts'

export async function createIdempotentSupportDraftMessage(
  threadId: string,
  params: {
    bodyText: string
    bodyHtml?: string
    agentRunId: string
  },
  options: QueryOptions = {},
): Promise<SupportMessage> {
  assertSupportMessageBody(params.bodyText, params.bodyHtml)

  const run = async (query: TransactionQuery): Promise<SupportMessage> => {
    const { rows: insertedRows } = await query(sql`/* createIdempotentSupportDraftMessage */
      WITH lifecycle_change_id AS (
        SELECT uuidv7() AS id
      ),
      inserted_message AS (
        -- One agent_run_id is supplied per draft; lifecycle_change_id produces one source row.
        /* no-mistakes: deadlock-safe */
        INSERT INTO support_messages (
          support_thread_id,
          direction,
          body_text,
          body_html,
          drafted_at,
          latest_lifecycle_change_id,
          agent_run_id
        )
        SELECT
          ${threadId},
          'outbound',
          ${params.bodyText},
          ${params.bodyHtml ?? ''},
          NOW(),
          lifecycle_change_id.id,
          ${params.agentRunId}
        FROM lifecycle_change_id
        ON CONFLICT (agent_run_id) WHERE agent_run_id IS NOT NULL DO NOTHING
        RETURNING
          id,
          support_thread_id,
          direction,
          body_text,
          body_html,
          created_at,
          created_by_id,
          updated_at,
          email_message_id,
          email_subject,
          email_from,
          email_to,
          drafted_at,
          edited_at,
          edited_by_id,
          approved_at,
          approved_by_id,
          sent_at
      ),
      recorded_change AS (
        INSERT INTO support_message_lifecycle_changes (
          id,
          support_thread_id,
          support_message_id,
          change_type,
          metadata,
          drafted_at,
          edited_at,
          edited_by_id,
          approved_at,
          approved_by_id,
          sent_at
        )
        SELECT
          lifecycle_change_id.id,
          inserted_message.support_thread_id,
          inserted_message.id,
          'create_draft',
          ${JSON.stringify({ agentRunId: params.agentRunId })}::jsonb,
          inserted_message.drafted_at,
          inserted_message.edited_at,
          inserted_message.edited_by_id,
          inserted_message.approved_at,
          inserted_message.approved_by_id,
          inserted_message.sent_at
        FROM inserted_message
        CROSS JOIN lifecycle_change_id
      )
      SELECT *
      FROM inserted_message
    `)

    const insertedMessage = insertedRows[0] as SupportMessage | undefined
    if (insertedMessage) return insertedMessage

    const { rows: existingRows } = await query(sql`/* createIdempotentSupportDraftMessageExisting */
      SELECT
        id,
        support_thread_id,
        direction,
        body_text,
        body_html,
        created_at,
        created_by_id,
        updated_at,
        email_message_id,
        email_subject,
        email_from,
        email_to,
        drafted_at,
        edited_at,
        edited_by_id,
        approved_at,
        approved_by_id,
        sent_at
      FROM support_messages
      WHERE support_thread_id = ${threadId}
        AND agent_run_id = ${params.agentRunId}
      LIMIT 1
    `)

    const message = existingRows[0] as SupportMessage | undefined
    if (!message) throw new Error('Agent run is already bound to a draft in another support thread')
    return message
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const message = await run(transaction)
  await transaction.commit()
  return message
}
