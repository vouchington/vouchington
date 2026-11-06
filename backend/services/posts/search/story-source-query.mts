import { buildPostSearchCtes, appendCtes } from './query-builder/ctes.mts'
import { appendStorySourcePageFilters } from './query-builder/where-clause.mts'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions } from './types.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import { appendChildLateral, resumeBounds } from './story-source-child.mts'
import type { StoryCursor, StoryFeedBounds } from './story-source-types.mts'

export function buildStorySourcePageQuery(input: {
  currentUser: BasicUser | undefined
  options: PostSearchOptions
  cursor: StoryCursor | null
  hasSemanticSearch: boolean
  hasTextSearch: boolean
  pageSize: number
  childLimit: number
}): SQLStatement {
  const lookahead = input.childLimit + 1
  const resumeSlot = input.cursor?.feed_open ? 1 : 0
  const laterPage = input.pageSize - resumeSlot
  const laterLimit = laterPage + 1
  const filters: SQLStatement[] = []
  appendStorySourcePageFilters(filters, {
    currentUser: input.currentUser,
    hasSemanticSearch: input.hasSemanticSearch,
    hasTextSearch: input.hasTextSearch,
    options: input.options,
  })
  const ctes = buildPostSearchCtes({
    ...input.options,
    hasSemanticSearch: input.hasSemanticSearch,
    hasTextSearch: input.hasTextSearch,
  })
  const query = sql`/* listStorySourcePage */\n`
  appendCtes(query, ctes)
  query.append(ctes.length > 0 ? sql`,\n` : sql`WITH\n`)
  query.append(sql`later_feeds AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC)::int AS ord
      FROM (
        SELECT id
        FROM rss_feeds
        WHERE is_enabled
          AND is_discoverable
          AND deleted_at IS NULL
          AND `)
  if (input.cursor) query.append(sql`id < ${input.cursor.feed_id}::uuid`)
  else query.append(sql`TRUE`)
  query.append(sql`
        ORDER BY id DESC
        LIMIT ${laterLimit}
      ) sliced
    ),
    later_page AS (
      SELECT id, ord
      FROM later_feeds
      WHERE ord <= ${laterPage}
    ),
    stats AS (
      SELECT
        (SELECT COUNT(*) > ${laterPage} FROM later_feeds) AS parent_has_more,
        (SELECT id FROM later_feeds WHERE ord = ${laterPage + 1}) AS next_feed_id
    ),
    sources AS MATERIALIZED (`)
  if (input.cursor?.feed_open) {
    appendFeedArm(query, {
      fromSql: sql`rss_feeds feed`,
      whereSql: sql`WHERE feed.id = ${input.cursor.feed_id}::uuid
        AND feed.is_enabled
        AND feed.is_discoverable
        AND feed.deleted_at IS NULL`,
      ordSql: sql`0::int`,
      bounds: resumeBounds(input.cursor),
      lookahead,
    })
    query.append(sql`
      UNION ALL
      `)
  }
  appendFeedArm(query, {
    fromSql: sql`later_page feed`,
    whereSql: sql``,
    ordSql: sql`feed.ord`,
    bounds: { published: null, missingItemUpper: null },
    lookahead,
  })
  query.append(sql`
    )
    SELECT
      sources.feed_id,
      sources.feed_ord,
      sources.item_id,
      CASE
        WHEN sources.published_at IS NULL THEN NULL
        ELSE to_char(sources.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      END AS published_at,
      sources.phase,
      sources.child_rank,
      posts.id AS post_id,
      posts.post_type,
      CASE
        WHEN posts.id IS NULL THEN false
        ELSE (`)
  query.append(combineFilters(filters))
  query.append(sql`)
      END AS eligible,
      stats.parent_has_more,
      stats.next_feed_id
    FROM stats
    LEFT JOIN sources ON TRUE
    LEFT JOIN posts ON posts.id = sources.post_id`)
  appendSearchJoins(query, input)
  query.append(sql`
    ORDER BY sources.feed_ord NULLS LAST, sources.child_rank NULLS FIRST`)
  return query
}

function appendFeedArm(
  query: SQLStatement,
  arm: {
    fromSql: SQLStatement
    whereSql: SQLStatement
    ordSql: SQLStatement
    bounds: StoryFeedBounds
    lookahead: number
  },
): void {
  query.append(sql`
      SELECT
        feed.id AS feed_id,
        `)
  query.append(arm.ordSql)
  query.append(sql` AS feed_ord,
        src.item_id,
        src.published_at,
        src.phase,
        src.child_rank,
        story_posts.post_id
      FROM `)
  query.append(arm.fromSql)
  appendChildLateral(query, arm.bounds, arm.lookahead)
  query.append(sql`
      LEFT JOIN rss_feed_items item
        ON item.id = src.item_id
       AND item.deleted_at IS NULL
       AND item.story_id IS NOT NULL
      LEFT JOIN stories
        ON stories.id = item.story_id
       AND stories.deleted_at IS NULL
      LEFT JOIN story_posts ON story_posts.story_id = stories.id`)
  if (arm.whereSql.values.length > 0 || arm.whereSql.text.includes('WHERE')) {
    query.append(sql`\n`).append(arm.whereSql)
  }
}

function appendSearchJoins(
  query: SQLStatement,
  input: { hasSemanticSearch: boolean; hasTextSearch: boolean; options: PostSearchOptions },
): void {
  if (input.hasTextSearch) query.append(sql`\n    CROSS JOIN text_search_tsquery`)
  if (input.hasSemanticSearch) query.append(sql`\n    CROSS JOIN semantic_search_embedding`)
  if (input.options.similar_post_id) query.append(sql`\n    CROSS JOIN similar_post_embedding`)
  if (input.options.similar_topic_id) query.append(sql`\n    CROSS JOIN similar_topic_embedding`)
  if (input.options.similar_rss_feed_item_id) {
    query.append(sql`\n    CROSS JOIN similar_rss_feed_item_embedding`)
  }
}

function combineFilters(filters: SQLStatement[]): SQLStatement {
  const combined = sql``
  filters.forEach((filter, index) => {
    if (index > 0) combined.append(sql` AND `)
    combined
      .append(sql`(`)
      .append(filter)
      .append(sql`)`)
  })
  return combined
}
