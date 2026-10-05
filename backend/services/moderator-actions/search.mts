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

  // Restriction ids are child rows, not stored metadata; rebuild `restriction_ids` (activate)
  // and `restriction_id` (lift) so the returned metadata keeps its shape.
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
      ma.topic_claim_id,
      ma.report_integrity_flag_id,
      ma.report_abuse_penalty_id,
      ma.vote_integrity_flag_id,
      ma.vote_weight_penalty_id,
      ma.agent_moderation_id,
      ma.oauth_client_id,
      ma.user_moderator_note_id,
      ma.crawler_id,
      ma.topic_id,
      ma.operation_request_id,
      ma.queue_name,
      ma.scheduled_job_key,
      ma.backfill_key,
      ma.rss_category_text,
      ma.admin_import_batch_id,
      ma.reason,
      ma.metadata || CASE ma.action_type
        WHEN 'activate_restriction' THEN jsonb_build_object('restriction_ids', COALESCE((
          SELECT jsonb_agg(restriction.id ORDER BY restriction.restriction_type, restriction.id)
          FROM moderator_action_community_restrictions link
          JOIN community_restrictions restriction ON restriction.id = link.community_restriction_id
          WHERE link.moderator_action_id = ma.id
        ), '[]'::jsonb))
        WHEN 'lift_restriction' THEN jsonb_build_object('restriction_id', (
          SELECT link.community_restriction_id
          FROM moderator_action_community_restrictions link
          WHERE link.moderator_action_id = ma.id
          ORDER BY link.community_restriction_id
          LIMIT 1
        ))
        ELSE '{}'::jsonb
      END AS metadata,
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
