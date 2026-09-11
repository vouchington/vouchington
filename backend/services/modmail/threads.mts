import createError from 'http-errors'
import { write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModmailThread } from './types.mts'

export async function openModmailThread(
  currentUserId: string,
  communityId: string,
  subjectUserId: string,
): Promise<ModmailThread> {
  await using query = await beginTransaction()
  const { rows: convRows } = await query(sql`/* openModmailThread */
      INSERT INTO conversations (
        channel_type, title, community_id, subject_user_id, created_by_id
      )
      VALUES ('modmail', '', ${communityId}, ${subjectUserId}, ${currentUserId})
      ON CONFLICT (community_id, subject_user_id)
        WHERE channel_type = 'modmail' AND resolved_at IS NULL AND deleted_at IS NULL
      DO NOTHING
      RETURNING
        id, channel_type, title, community_id, subject_user_id,
        assigned_mod_id, assigned_at, resolved_at, resolved_by_id,
        created_by_id, created_at, updated_at
    `)

  let thread: ModmailThread

  // If no row was returned, an open thread already exists — fetch it.
  if (convRows.length === 0) {
    const { rows: existingRows } = await query(sql`/* openModmailThread:existing */
        SELECT
          id, channel_type, title, community_id, subject_user_id,
          assigned_mod_id, assigned_at, resolved_at, resolved_by_id,
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
    thread = existingRows[0] as ModmailThread
  } else {
    thread = convRows[0] as ModmailThread

    // Add subject user as member participant
    await query(sql`/* openModmailThread:subjectParticipant */
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (${thread.id}, ${subjectUserId}, 'member')
      `)

    // Add all active moderators and owners as admin participants
    const { rows: modRows } = await query(sql`/* openModmailThread:mods */
        SELECT user_id
        FROM community_members
        WHERE community_id = ${communityId}
          AND role IN ('owner', 'moderator')
          AND removed_at IS NULL
      `)

    if (modRows.length > 0) {
      const typedModRows = modRows as Array<{ user_id: string }>
      await query(sql`/* openModmailThread:modParticipants */
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        SELECT ${thread.id}::uuid AS conversation_id, user_id, 'admin'
        FROM unnest(${typedModRows.map(row => row.user_id)}::uuid[]) AS input(user_id)
        ORDER BY conversation_id ASC NULLS LAST, user_id ASC NULLS LAST
        ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL AND removed_at IS NULL
        DO NOTHING
      `)
    }
  }

  // Upsert the caller as an admin participant so staff who open or view modmail can also reply.
  // This is a no-op if currentUserId is already a participant (e.g. a community mod).
  if (currentUserId !== subjectUserId) {
    await query(sql`/* openModmailThread:callerParticipant */
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (${thread.id}, ${currentUserId}, 'admin')
        ON CONFLICT DO NOTHING
      `)
  }

  await query.commit()
  return thread
}

export async function upsertModmailStaffParticipant(
  conversationId: string,
  userId: string,
): Promise<void> {
  await write(sql`/* upsertModmailStaffParticipant */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (${conversationId}, ${userId}, 'admin')
    ON CONFLICT DO NOTHING
  `)
}

export async function assignModmailThread(
  conversationId: string,
  modUserId: string,
): Promise<void> {
  await write(sql`/* assignModmailThread */
    UPDATE conversations
    SET assigned_mod_id = ${modUserId},
        assigned_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
  `)
}

export async function resolveModmailThread(
  conversationId: string,
  resolvedBy: string,
): Promise<void> {
  await write(sql`/* resolveModmailThread */
    UPDATE conversations
    SET resolved_at = CURRENT_TIMESTAMP,
        resolved_by_id = ${resolvedBy},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
  `)
}

export async function unresolveModmailThread(conversationId: string): Promise<void> {
  await write(sql`/* unresolveModmailThread */
    UPDATE conversations
    SET resolved_at = NULL,
        resolved_by_id = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${conversationId}
      AND channel_type = 'modmail'
      AND deleted_at IS NULL
  `)
}
