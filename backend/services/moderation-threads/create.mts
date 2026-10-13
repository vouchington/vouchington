import type { QueryOptions } from '@data-stores/psql/types'
import createError from 'http-errors'
import {
  read,
  beginTransaction,
  withTransactionOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModInternalThread } from './types.mts'
import { getReportResolutionContext } from '@services/moderation-reports/resolve'
import { addModParticipants } from './participants.mts'

export async function openModInternalThread(
  currentUserId: string,
  options: {
    communityId: string
    reportId?: string | null
    postId?: string | null
  },
  queryOptions?: QueryOptions,
  dependencies: { clock?: () => Date } = {},
): Promise<ModInternalThread> {
  const { communityId, reportId, postId } = options
  const hasReport = !!reportId
  const hasPost = !!postId

  if (hasReport === hasPost) {
    throw createError(422, 'Exactly one of reportId or postId must be set')
  }

  const observedTime = observeModerationVacationTime(dependencies.clock)

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

  const run = (query: TransactionQuery) =>
    hasReport
      ? openModInternalThreadForReport(query, currentUserId, communityId, reportId!, observedTime)
      : openModInternalThreadForPost(query, currentUserId, communityId, postId!, observedTime)
  if (queryOptions?.query || queryOptions?.client) return withTransactionOptions(queryOptions, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

async function openModInternalThreadForReport(
  query: TransactionQuery,
  currentUserId: string,
  communityId: string,
  reportId: string,
  observedTime: Date | null,
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
    await addModParticipants(query, thread.id, communityId, observedTime)
  }

  await upsertCallerParticipant(query, thread.id, currentUserId)
  return thread
}

async function openModInternalThreadForPost(
  query: TransactionQuery,
  currentUserId: string,
  communityId: string,
  postId: string,
  observedTime: Date | null,
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
    await addModParticipants(query, thread.id, communityId, observedTime)
  }

  await upsertCallerParticipant(query, thread.id, currentUserId)
  return thread
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

function observeModerationVacationTime(clock: (() => Date) | undefined): Date | null {
  if (!clock) return null
  const observedTime = clock()
  const milliseconds = observedTime.getTime()
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError('Moderation vacation clock must return a valid Date')
  }
  return new Date(milliseconds)
}
