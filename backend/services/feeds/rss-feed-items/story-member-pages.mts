import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { itemHasDiscoverableSourceSql } from '@modules/feed-query-builders/discoverability-sql'
import type { BasicUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'
import sql, { type SQLStatement } from 'sql-template-strings'
import assert from 'http-assert'
import { appendRssFeedItemViewerCTEs } from './get-ids/relation-ctes.mts'
import {
  appendRssFeedItemViewerEligibilityFilters,
  buildRssFeedItemSourceMuteFilter,
} from './get-ids/viewer-eligibility.mts'

export type StoryMemberRequest = {
  story_id: string
  exclude_item_id?: string
  after?: string
}
export type StoryMemberPage = { item_ids: string[]; page_info: PageInfo }
type PreparedRequest = StoryMemberRequest & { scope: string; after_id?: string }

export async function getStoryMemberPagesBatch(
  currentUser: BasicUser | null,
  requests: readonly StoryMemberRequest[],
  { limit }: { limit: number },
  options: QueryOptions = {},
): Promise<Record<string, StoryMemberPage>> {
  assert(Number.isInteger(limit) && limit >= 1 && limit <= 25, 400, 'Invalid story member limit')
  assert(
    new Set(requests.map(request => request.story_id)).size === requests.length,
    400,
    'Duplicate story request',
  )
  if (requests.length === 0) return {}
  const prepared = requests.map(request => prepareRequest(currentUser, request))
  const query = appendRssFeedItemViewerCTEs(
    sql`/* getStoryMemberPagesBatch */ WITH `,
    currentUser?.id,
  ).append(sql` `)
  const first = prepared.filter(request => !request.after_id)
  const continuation = prepared.filter(request => request.after_id)
  if (first.length) query.append(buildMemberSelection(first, limit, false))
  if (first.length && continuation.length) query.append(sql` UNION ALL `)
  if (continuation.length) query.append(buildMemberSelection(continuation, limit, true))
  const { rows } = await read<{ story_id: string; id: string }>(query, options)
  const idsByStory = new Map<string, string[]>()
  for (const row of rows) {
    const ids = idsByStory.get(row.story_id) ?? []
    ids.push(row.id)
    idsByStory.set(row.story_id, ids)
  }
  return Object.fromEntries(
    prepared.map(request => {
      const selected = (idsByStory.get(request.story_id) ?? []).toSorted().reverse()
      const item_ids = selected.slice(0, limit)
      const has_next_page = selected.length > limit
      return [
        request.story_id,
        {
          item_ids,
          page_info: {
            has_next_page,
            start_cursor: item_ids[0] ? encodeScopedUuidCursor(item_ids[0], request.scope) : null,
            end_cursor: has_next_page
              ? encodeScopedUuidCursor(item_ids.at(-1)!, request.scope)
              : null,
          },
        },
      ]
    }),
  )
}

function prepareRequest(
  currentUser: BasicUser | null,
  request: StoryMemberRequest,
): PreparedRequest {
  const scope = JSON.stringify({
    resource: 'story-members',
    story_id: request.story_id,
    viewer_id: currentUser?.id ?? null,
    access: currentUser?.roles.includes('administrator') ? 'administrator' : 'public',
    order: 'id_desc',
    exclude_item_id: request.exclude_item_id ?? null,
  })
  const after_id = request.after
    ? decodeScopedUuidCursor(request.after, scope, 'Invalid story member cursor').id
    : undefined
  return { ...request, scope, after_id }
}

function buildMemberSelection(
  requests: PreparedRequest[],
  limit: number,
  hasAfter: boolean,
): SQLStatement {
  const query = sql`SELECT input.story_id, member.id
    FROM UNNEST(
      ${requests.map(request => request.story_id)}::uuid[],
      ${requests.map(request => request.exclude_item_id ?? null)}::uuid[],
      ${requests.map(request => request.after_id ?? null)}::uuid[]
    ) AS input(story_id, exclude_item_id, after_id)
    CROSS JOIN LATERAL (
      SELECT rss_feed_items.id FROM rss_feed_items
      CROSS JOIN LATERAL (
        SELECT 1 WHERE `.append(
    itemHasDiscoverableSourceSql('rss_feed_items.id', buildRssFeedItemSourceMuteFilter()),
  )
  appendRssFeedItemViewerEligibilityFilters(
    query,
    sql`rss_feed_items.id`,
    sql`rss_feed_items.url_id`,
  )
  query.append(sql` LIMIT 1
      ) eligible
      WHERE rss_feed_items.story_id = input.story_id
        AND rss_feed_items.deleted_at IS NULL
        AND rss_feed_items.id IS DISTINCT FROM input.exclude_item_id`)
  // Compare (story_id, id) so continuation uses the story membership index when
  // that story owns the newest ids in the partition.
  if (hasAfter) {
    query.append(
      sql` AND (rss_feed_items.story_id, rss_feed_items.id) < (input.story_id, input.after_id)`,
    )
  }
  return query.append(sql` ORDER BY rss_feed_items.id DESC LIMIT ${limit + 1}
    ) member`)
}
