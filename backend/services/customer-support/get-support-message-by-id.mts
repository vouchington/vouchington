import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportMessage } from './types.mts'

export async function getSupportThreadIdByEmailMessageId(
  emailMessageId: string,
  options?: QueryOptions,
): Promise<string | null> {
  return await getFirstSupportThreadIdByEmailMessageIds([emailMessageId], options)
}

export async function getFirstSupportThreadIdByEmailMessageIds(
  emailMessageIds: string[],
  options?: QueryOptions,
): Promise<string | null> {
  const normalizedEmailMessageIds = normalizeEmailMessageIds(emailMessageIds)
  if (normalizedEmailMessageIds.length === 0) return null

  const { rows } = await read(
    sql`/* getFirstSupportThreadIdByEmailMessageIds */
    WITH input AS (
      SELECT email_message_id, ord
      FROM UNNEST(${normalizedEmailMessageIds}::text[]) WITH ORDINALITY AS input(email_message_id, ord)
    ),
    matches AS (
      SELECT
        input.ord,
        registry.support_thread_id,
        0 AS source_priority,
        registry.completed_at AS matched_at,
        registry.support_message_id AS match_id
      FROM input
      JOIN support_inbound_email_message_ids registry
        ON registry.email_message_id = input.email_message_id
       AND registry.support_thread_id IS NOT NULL
      UNION ALL
      SELECT
        input.ord,
        messages.support_thread_id,
        1 AS source_priority,
        messages.created_at AS matched_at,
        messages.id AS match_id
      FROM input
      JOIN support_messages messages
        ON messages.email_message_id = input.email_message_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM support_inbound_email_message_ids registry
        WHERE registry.email_message_id = input.email_message_id
          AND registry.support_thread_id IS NOT NULL
      )
    )
    SELECT support_thread_id
    FROM matches
    ORDER BY ord, source_priority, matched_at DESC NULLS LAST, match_id DESC
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as { support_thread_id: string } | undefined)?.support_thread_id ?? null
}

function normalizeEmailMessageIds(emailMessageIds: string[]): string[] {
  return [...new Set(emailMessageIds.flatMap(id => (id.trim() ? [id.trim()] : [])))]
}

export async function getSupportMessageById(
  threadId: string,
  messageId: string,
): Promise<SupportMessage | null> {
  const { rows } = await read(sql`/* getSupportMessageById */
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
      AND id = ${messageId}
    LIMIT 1
  `)
  return (rows[0] as SupportMessage) ?? null
}
