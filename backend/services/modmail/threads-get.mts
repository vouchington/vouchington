import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModmailThread } from './types.mts'

type TimestampCursor = { timestamp: string; id: string }

export async function getCommunityModmailInbox(
  communityId: string,
  options?: { after?: TimestampCursor; limit?: number },
): Promise<Array<ModmailThread & { cursor_timestamp: string }>> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
  const query = sql`/* getCommunityModmailInbox */
    SELECT
      id, channel_type, title, community_id, subject_user_id,
      assigned_mod_id, assigned_at, resolved_at, resolved_by_id,
      created_by_id, created_at, updated_at,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp
    FROM conversations
    WHERE channel_type = 'modmail'
      AND community_id = ${communityId}
      AND deleted_at IS NULL
  `
  if (options?.after) {
    query.append(
      sql` AND (updated_at, id) < (${options.after.timestamp}::timestamptz, ${options.after.id})`,
    )
  }
  query.append(sql` ORDER BY updated_at DESC, id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  return rows as Array<ModmailThread & { cursor_timestamp: string }>
}

export async function getMyModmailThreads(
  userId: string,
  options?: { communityId?: string; after?: TimestampCursor; limit?: number },
): Promise<Array<ModmailThread & { cursor_timestamp: string }>> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
  const query = sql`/* getMyModmailThreads */
    SELECT
      id, channel_type, title, community_id, subject_user_id,
      assigned_mod_id, assigned_at, resolved_at, resolved_by_id,
      created_by_id, created_at, updated_at,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp
    FROM conversations
    WHERE channel_type = 'modmail'
      AND subject_user_id = ${userId}
      AND deleted_at IS NULL
  `
  if (options?.communityId) {
    query.append(sql` AND community_id = ${options.communityId}`)
  }
  if (options?.after) {
    query.append(
      sql` AND (updated_at, id) < (${options.after.timestamp}::timestamptz, ${options.after.id})`,
    )
  }
  query.append(sql` ORDER BY updated_at DESC, id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  return rows as Array<ModmailThread & { cursor_timestamp: string }>
}

export async function hasOpenModmailThread(
  communityId: string,
  subjectUserId: string,
  excludeConversationId?: string,
): Promise<boolean> {
  const query = sql`/* hasOpenModmailThread */
    SELECT 1 FROM conversations
    WHERE channel_type = 'modmail'
      AND community_id = ${communityId}
      AND subject_user_id = ${subjectUserId}
      AND resolved_at IS NULL
      AND deleted_at IS NULL`
  if (excludeConversationId) {
    query.append(sql` AND id != ${excludeConversationId}`)
  }
  query.append(sql` LIMIT 1`)
  const { rows } = await read(query)
  return rows.length > 0
}

export async function getModmailThread(conversationId: string): Promise<ModmailThread | null> {
  const { rows } = await read(sql`/* getModmailThread */
    SELECT
      id, channel_type, title, community_id, subject_user_id,
      assigned_mod_id, assigned_at, resolved_at, resolved_by_id,
      created_by_id, created_at, updated_at
    FROM conversations
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as ModmailThread | undefined) ?? null
}
