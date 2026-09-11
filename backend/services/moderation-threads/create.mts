import createError from 'http-errors'
import { read, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModInternalThread } from './types.mts'
import { getReportResolutionContext } from '@services/moderation-reports/resolve'

export async function openModInternalThread(
  currentUserId: string,
  options: {
    communityId: string
    reportId?: string | null
    postId?: string | null
  },
): Promise<ModInternalThread> {
  const { communityId, reportId, postId } = options
  const hasReport = !!reportId
  const hasPost = !!postId

  if (hasReport === hasPost) {
    throw createError(422, 'Exactly one of reportId or postId must be set')
  }

  if (reportId) {
    const context = await getReportResolutionContext(reportId, communityId)
    if (!context) throw createError(404, 'Report not found')
    if (!context.is_in_community_scope) throw createError(403, 'Forbidden')
  }

  if (postId) {
    const { rows } = await read(sql`/* openModInternalThread:assert_post_scope */
      SELECT 1 FROM community_post_reviews
      WHERE post_id = ${postId}
        AND community_id = ${communityId}
      LIMIT 1
    `)
    if (rows.length === 0) throw createError(404, 'Post not found in this community')
  }

  if (hasReport) {
    await using transaction = await beginTransaction()
    const result = await openModInternalThreadForReport(
      transaction,
      currentUserId,
      communityId,
      reportId!,
    )
    await transaction.commit()
    return result
  }
  await using transaction = await beginTransaction()
  const result = await openModInternalThreadForPost(
    transaction,
    currentUserId,
    communityId,
    postId!,
  )
  await transaction.commit()
  return result
}

async function openModInternalThreadForReport(
  query: TransactionQuery,
  currentUserId: string,
  communityId: string,
  reportId: string,
): Promise<ModInternalThread> {
  const { rows: convRows } = await query(sql`/* openModInternalThread:report */
    INSERT INTO conversations (
      channel_type, community_id, moderation_report_id, created_by_id
    )
    VALUES ('mod_internal', ${communityId}, ${reportId}, ${currentUserId})
    ON CONFLICT (moderation_report_id)
      WHERE channel_type = 'mod_internal' AND moderation_report_id IS NOT NULL
        AND resolved_at IS NULL AND deleted_at IS NULL
    DO NOTHING
    RETURNING
      id, channel_type, community_id, moderation_report_id, post_id,
      created_by_id, created_at, updated_at, resolved_at, resolved_by_id
  `)

  let thread: ModInternalThread

  if (convRows.length === 0) {
    const { rows: existingRows } = await query(sql`/* openModInternalThread:existing_report */
      SELECT
        id, channel_type, community_id, moderation_report_id, post_id,
        created_by_id, created_at, updated_at, resolved_at, resolved_by_id
      FROM conversations
      WHERE channel_type = 'mod_internal'
        AND moderation_report_id = ${reportId}
        AND resolved_at IS NULL
        AND deleted_at IS NULL
      LIMIT 1
    `)
    /* v8 ignore next 3 -- race: thread resolved between INSERT DO NOTHING and SELECT */
    if (!existingRows[0]) {
      throw createError(409, 'Mod internal thread was resolved concurrently — please try again')
    }
    thread = existingRows[0] as ModInternalThread
  } else {
    thread = convRows[0] as ModInternalThread
    await addModParticipants(query, thread.id, communityId)
  }

  await upsertCallerParticipant(query, thread.id, currentUserId)
  return thread
}

async function openModInternalThreadForPost(
  query: TransactionQuery,
  currentUserId: string,
  communityId: string,
  postId: string,
): Promise<ModInternalThread> {
  const { rows: convRows } = await query(sql`/* openModInternalThread:post */
    INSERT INTO conversations (
      channel_type, community_id, post_id, created_by_id
    )
    VALUES ('mod_internal', ${communityId}, ${postId}, ${currentUserId})
    ON CONFLICT (post_id)
      WHERE channel_type = 'mod_internal' AND post_id IS NOT NULL
        AND resolved_at IS NULL AND deleted_at IS NULL
    DO NOTHING
    RETURNING
      id, channel_type, community_id, moderation_report_id, post_id,
      created_by_id, created_at, updated_at, resolved_at, resolved_by_id
  `)

  let thread: ModInternalThread

  if (convRows.length === 0) {
    const { rows: existingRows } = await query(sql`/* openModInternalThread:existing_post */
      SELECT
        id, channel_type, community_id, moderation_report_id, post_id,
        created_by_id, created_at, updated_at, resolved_at, resolved_by_id
      FROM conversations
      WHERE channel_type = 'mod_internal'
        AND post_id = ${postId}
        AND resolved_at IS NULL
        AND deleted_at IS NULL
      LIMIT 1
    `)
    /* v8 ignore next 3 -- race: thread resolved between INSERT DO NOTHING and SELECT */
    if (!existingRows[0]) {
      throw createError(409, 'Mod internal thread was resolved concurrently — please try again')
    }
    thread = existingRows[0] as ModInternalThread
  } else {
    thread = convRows[0] as ModInternalThread
    await addModParticipants(query, thread.id, communityId)
  }

  await upsertCallerParticipant(query, thread.id, currentUserId)
  return thread
}

async function addModParticipants(
  query: TransactionQuery,
  conversationId: string,
  communityId: string,
): Promise<void> {
  const { rows: modRows } = await query(sql`/* openModInternalThread:mods */
    SELECT cm.user_id
    FROM community_members cm
    WHERE cm.community_id = ${communityId}
      AND cm.role IN ('owner', 'moderator')
      AND cm.removed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM community_member_vacations v
        WHERE v.community_id = cm.community_id
          AND v.user_id      = cm.user_id
          AND v.starts_at   <= now()
          AND (v.ends_at IS NULL OR v.ends_at > now())
      )
  `)

  if (modRows.length === 0) return

  const typedModRows = modRows as Array<{ user_id: string }>
  await query(sql`/* openModInternalThread:modParticipants */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT ${conversationId}::uuid AS conversation_id, user_id, 'admin'
    FROM unnest(${typedModRows.map(row => row.user_id)}::uuid[]) AS input(user_id)
    ORDER BY conversation_id ASC NULLS LAST, user_id ASC NULLS LAST
    ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL AND removed_at IS NULL
    DO NOTHING
  `)
}

async function upsertCallerParticipant(
  query: TransactionQuery,
  conversationId: string,
  userId: string,
): Promise<void> {
  await query(sql`/* openModInternalThread:callerParticipant */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (${conversationId}, ${userId}, 'admin')
    ON CONFLICT DO NOTHING
  `)
}
