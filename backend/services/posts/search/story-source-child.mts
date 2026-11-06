import createHttpError from 'http-errors'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { StoryCursor, StoryFeedBounds } from './story-source-types.mts'

/** A bound from DynamicConfig, inlined so a generic plan sees the same LIMIT as a custom plan. */
export function storyLimitLiteral(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 101) {
    throw new Error('story page limit is outside its configured bound')
  }
  return String(value)
}

export function appendChildLateral(
  query: SQLStatement,
  bounds: { published: SQLStatement | null; missingItemUpper: string | null },
  lookahead: number,
): void {
  query.append(sql`
      LEFT JOIN LATERAL (
        SELECT
          page.item_id,
          page.published_at,
          page.phase,
          ROW_NUMBER() OVER (
            ORDER BY page.published_at DESC NULLS LAST, page.item_id DESC
          ) AS child_rank
        FROM (
          (
            SELECT rss_feed_item_id AS item_id, published_at, 'published'::text AS phase
            FROM rss_feed_item_sources
            WHERE rss_feed_id = feed.id
              AND published_at IS NOT NULL`)
  if (bounds.published) {
    query.append(sql`
              AND (published_at, rss_feed_item_id) < (`)
    query.append(bounds.published)
    query.append(sql`)`)
  }
  query.append(sql`
            ORDER BY published_at DESC, rss_feed_item_id DESC
            LIMIT `)
  query.append(storyLimitLiteral(lookahead))
  query.append(sql`
          )
          UNION ALL
          (
            SELECT rss_feed_item_id, NULL::timestamptz, 'missing'::text
            FROM rss_feed_item_sources
            WHERE rss_feed_id = feed.id
              AND published_at IS NULL
              AND `)
  if (bounds.missingItemUpper) {
    query.append(sql`rss_feed_item_id < ${bounds.missingItemUpper}::uuid`)
  } else query.append(sql`TRUE`)
  query.append(sql`
            ORDER BY rss_feed_item_id DESC
            LIMIT `)
  query.append(storyLimitLiteral(lookahead))
  query.append(sql`
          )
        ) page
        ORDER BY page.published_at DESC NULLS LAST, page.item_id DESC
        LIMIT `)
  query.append(storyLimitLiteral(lookahead))
  query.append(sql`
      ) src ON TRUE`)
}

export function appendLaterFeedSlice(
  query: SQLStatement,
  cursor: StoryCursor | null,
  laterLimit: number,
  staff: boolean,
): void {
  if (staff) appendStaffFeedSlice(query, cursor, laterLimit)
  else appendPublicFeedSlice(query, cursor, laterLimit)
}

function appendPublicFeedSlice(
  query: SQLStatement,
  cursor: StoryCursor | null,
  laterLimit: number,
): void {
  query.append(sql`
        SELECT id
        FROM rss_feeds
        WHERE is_enabled
          AND is_discoverable
          AND deleted_at IS NULL
          AND `)
  appendFeedIdUpperBound(query, cursor)
  query.append(sql`
        ORDER BY id DESC
        LIMIT `)
  query.append(storyLimitLiteral(laterLimit))
}

function appendStaffFeedSlice(
  query: SQLStatement,
  cursor: StoryCursor | null,
  laterLimit: number,
): void {
  query.append(sql`
        SELECT id
        FROM (
          SELECT id
          FROM rss_feeds
          WHERE is_enabled = TRUE
            AND deleted_at IS NULL
            AND `)
  appendFeedIdUpperBound(query, cursor)
  query.append(sql`
          ORDER BY id DESC
          LIMIT `)
  query.append(storyLimitLiteral(laterLimit))
  query.append(sql`
        ) enabled_feeds
        UNION ALL
        SELECT id
        FROM (
          SELECT id
          FROM rss_feeds
          WHERE is_enabled = FALSE
            AND deleted_at IS NULL
            AND `)
  appendFeedIdUpperBound(query, cursor)
  query.append(sql`
          ORDER BY id DESC
          LIMIT `)
  query.append(storyLimitLiteral(laterLimit))
  query.append(sql`
        ) disabled_feeds
        ORDER BY id DESC
        LIMIT `)
  query.append(storyLimitLiteral(laterLimit))
}

function appendFeedIdUpperBound(query: SQLStatement, cursor: StoryCursor | null): void {
  if (cursor) query.append(sql`id < ${cursor.feed_id}::uuid`)
  else query.append(sql`TRUE`)
}

/** Newest visible feed at least as new as this one, then greatest item id, owns the story. */
export function appendOwningSource(query: SQLStatement, staff: boolean): void {
  query.append(sql`
      LEFT JOIN LATERAL (
        SELECT candidate.feed_id, candidate.item_id
        FROM (
          SELECT
            owner_src.rss_feed_id AS feed_id,
            owner_item.id AS item_id,
            (
              SELECT owner_feed.id
              FROM rss_feeds owner_feed
              WHERE owner_feed.id = owner_src.rss_feed_id
                AND owner_feed.deleted_at IS NULL`)
  if (!staff) {
    query.append(sql`
                AND owner_feed.is_enabled
                AND owner_feed.is_discoverable`)
  }
  query.append(sql`
            ) AS visible_feed_id
          -- no-mistakes-disable-next-line postgres-required-predicates: story_id is the indexed key across item id partitions; the feed lower bound is applied after that equality
          FROM rss_feed_items owner_item
          JOIN rss_feed_item_sources owner_src
            ON owner_src.rss_feed_item_id = owner_item.id
          WHERE owner_item.story_id = item.story_id
            AND owner_item.story_id IS NOT NULL
            AND owner_item.deleted_at IS NULL
            AND owner_src.rss_feed_id >= feed.id
        ) candidate
        WHERE candidate.visible_feed_id IS NOT NULL
        ORDER BY candidate.feed_id DESC, candidate.item_id DESC
        LIMIT 1
      ) owner ON story_posts.post_id IS NOT NULL`)
}

export function resumeBounds(cursor: StoryCursor): StoryFeedBounds & { published: SQLStatement } {
  if (!cursor.item_id) throw createHttpError(400, 'Invalid cursor')
  if (cursor.phase === 'missing') {
    return {
      published: sql`'-infinity'::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid`,
      missingItemUpper: cursor.item_id,
    }
  }
  if (!cursor.published_at) throw createHttpError(400, 'Invalid cursor')
  return {
    published: sql`${cursor.published_at}::timestamptz, ${cursor.item_id}::uuid`,
    missingItemUpper: null,
  }
}
