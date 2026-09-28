import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ModeratorAction } from './types.mts'
import type { ModeratorActionType } from './config.mts'

export interface SearchModeratorActionsOptions extends QueryOptions {
  communityId?: string
  global?: boolean
  actorId?: string
  actionType?: ModeratorActionType
  limit?: number
  after?: string
}

export async function searchModeratorActions(
  options?: SearchModeratorActionsOptions,
): Promise<{ results: ModeratorAction[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 25
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* searchModeratorActions */
    SELECT
      ma.id,
      ma.community_id,
      ma.moderation_transparency_community_id,
      ma.actor_id,
      ma.action_type,
      ma.post_id,
      ma.target_user_id,
      ma.report_id,
      ma.review_dispute_id,
      ma.moderation_appeal_id,
      ma.community_application_id,
      ma.reason,
      COALESCE(fn_moderator_action_metadata(ma.id), '{}'::jsonb) AS metadata,
      ma.created_at
    FROM moderator_actions ma
    WHERE TRUE
  `

  if (options?.communityId !== undefined) {
    query.append(sql` AND ma.community_id = ${options.communityId}`)
  } else if (options?.global) {
    query.append(sql` AND ma.community_id IS NULL`)
  }

  if (options?.actorId !== undefined) {
    query.append(sql` AND ma.actor_id = ${options.actorId}`)
  }

  if (options?.actionType !== undefined) {
    query.append(sql` AND ma.action_type = ${options.actionType}`)
  }

  if (cursorId !== undefined) {
    query.append(sql` AND ma.id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY ma.id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: ModeratorAction[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as ModeratorAction)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({ id: results[results.length - 1]!.id })
          : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0]!.id }) : null,
    },
  }
}
