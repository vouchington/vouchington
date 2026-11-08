import createError from 'http-errors'
import { write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModmailThread } from './types.mts'
import { admitConversationParticipants } from '@services/messaging/participant-admission'

export async function openModmailThread(
  currentUserId: string,
  communityId: string,
  subjectUserId: string,
): Promise<ModmailThread> {
  await using query = await beginTransaction()
  const { rows: convRows } = await query<ModmailThread>(sql`/* openModmailThread */
      INSERT INTO conversations (
        channel_type, title, community_id, subject_user_id, created_by_id
      )
      VALUES ('modmail', '', ${communityId}, ${subjectUserId}, ${currentUserId})
      ON CONFLICT (community_id, subject_user_id)
        WHERE channel_type = 'modmail' AND resolved_at IS NULL AND deleted_at IS NULL
      DO NOTHING
      RETURNING
        id, channel_type, title, community_id, subject_user_id,
        assigned_moderator_user_id, assigned_at, resolved_at, resolved_by_id,
        created_by_id, created_at, updated_at
    `)

  let thread: ModmailThread

  // If no row was returned, an open thread already exists — fetch it.
  if (convRows.length === 0) {
    const { rows: existingRows } = await query<ModmailThread>(sql`/* openModmailThread:existing */
        SELECT
          id, channel_type, title, community_id, subject_user_id,
          assigned_moderator_user_id, assigned_at, resolved_at, resolved_by_id,
          created_by_id, created_at, updated_at
        FROM conversations
        WHERE channel_type = 'modmail'
          AND community_id = ${communityId}
          AND subject_user_id = ${subjectUserId}
          AND resolved_at IS NULL
          AND deleted_at IS NULL
        LIMIT 1
      `)
    // Race: the conflicting thread was resolved between INSERT and SELECT.
    if (!existingRows[0])
      throw createError(409, 'Modmail thread was resolved concurrently — please try again')
    thread = existingRows[0]
  } else {
    thread = convRows[0]
    await admitConversationParticipants(query, thread.id, [
      { userId: subjectUserId, role: 'member' },
      ...(currentUserId === subjectUserId
        ? []
        : [{ userId: currentUserId, role: 'admin' as const }]),
    ])
  }

  await query.commit()
  return thread
}

/** Each of the three updates below returns the thread as the write left it, or null if it is gone. */
export async function assignModmailThread(
  conversationId: string,
  modUserId: string,
): Promise<ModmailThread | null> {
  const { rows } = await write<ModmailThread>(sql`/* assignModmailThread */
    UPDATE conversations
    SET last_activity_at = CURRENT_TIMESTAMP, assigned_moderator_user_id = ${modUserId},
        assigned_at = CURRENT_TIMESTAMP
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
    RETURNING
      id, channel_type, title, community_id, subject_user_id,
      assigned_moderator_user_id, assigned_at, resolved_at, resolved_by_id,
      created_by_id, created_at, updated_at
  `)
  return rows[0] ?? null
}

export async function resolveModmailThread(
  conversationId: string,
  resolvedBy: string,
): Promise<ModmailThread | null> {
  const { rows } = await write<ModmailThread>(sql`/* resolveModmailThread */
    UPDATE conversations
    SET last_activity_at = CURRENT_TIMESTAMP, resolved_at = CURRENT_TIMESTAMP,
        resolved_by_id = ${resolvedBy}
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
    RETURNING
      id, channel_type, title, community_id, subject_user_id,
      assigned_moderator_user_id, assigned_at, resolved_at, resolved_by_id,
      created_by_id, created_at, updated_at
  `)
  return rows[0] ?? null
}

export async function unresolveModmailThread(
  conversationId: string,
): Promise<ModmailThread | null> {
  const { rows } = await write<ModmailThread>(sql`/* unresolveModmailThread */
    UPDATE conversations
    SET last_activity_at = CURRENT_TIMESTAMP, resolved_at = NULL,
        resolved_by_id = NULL
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
    RETURNING
      id, channel_type, title, community_id, subject_user_id,
      assigned_moderator_user_id, assigned_at, resolved_at, resolved_by_id,
      created_by_id, created_at, updated_at
  `)
  return rows[0] ?? null
}
