import {
  TOPIC_ALIAS_UNLINK_PHASES,
  type TopicAliasUnlinkPage,
  type TopicAliasUnlinkPhase,
} from '@queues/rss-feed-maintenance/types'

const FINALIZE_CURSOR = 'finalize'

type NextRow = { phase: string; page_cursor: string }

export type TopicAliasUnlinkSql = <T extends Record<string, unknown>>(
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: T[] }>

/**
 * The first remaining child, or finalize when every child page is drained.
 * Hashtag aliases keep authored source rows, so that phase is skipped.
 */
export async function selectTopicAliasUnlinkNextPage(
  query: TopicAliasUnlinkSql,
  topicAliasId: string,
  preservesHashtag: boolean,
): Promise<TopicAliasUnlinkPage> {
  const { rows } = await query<NextRow>(
    `/* selectTopicAliasUnlinkNextPage */
    SELECT candidate.phase, candidate.page_cursor
    FROM (
      (
        SELECT 'post_sources' AS phase, source.id::text AS page_cursor, 1 AS ord
        FROM post_topic_alias_sources source
        WHERE source.topic_alias_id = $1::uuid
          AND NOT $2::boolean
        ORDER BY source.post_id DESC, source.id DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 'post_relations' AS phase, relation.id::text AS page_cursor, 2 AS ord
        -- no-mistakes-disable-next-line postgres-required-predicates: unlink drains soft-deleted alias edges before the alias row can go
        FROM relation__post__category__topic_alias relation
        WHERE relation.object_id = $1::uuid
        ORDER BY relation.subject_id, relation.id
        LIMIT 1
      )
      UNION ALL
      (
        SELECT
          'rss_item_categories' AS phase,
          category.rss_feed_item_id::text || '_' || category.category_identity_id::text AS page_cursor,
          3 AS ord
        FROM rss_feed_item_categories category
        WHERE category.topic_alias_id = $1::uuid
        ORDER BY category.rss_feed_item_id DESC, category.category_identity_id
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 'rss_item_relations' AS phase, relation.id::text AS page_cursor, 4 AS ord
        -- no-mistakes-disable-next-line postgres-required-predicates: unlink drains soft-deleted alias edges before the alias row can go
        FROM relation__rss_feed_item__category__topic_alias relation
        WHERE relation.object_id = $1::uuid
        ORDER BY relation.subject_id, relation.id
        LIMIT 1
      )
    ) candidate
    ORDER BY candidate.ord
    LIMIT 1`,
    [topicAliasId, preservesHashtag],
  )
  return pageFromRow(topicAliasId, rows[0])
}

export function pageFromRow(
  topicAliasId: string,
  row: { phase?: string | null; page_cursor?: string | null } | undefined,
): TopicAliasUnlinkPage {
  if (!row?.phase || !row.page_cursor) {
    return { topicAliasId, phase: 'finalize', pageCursor: FINALIZE_CURSOR }
  }
  if (!isPhase(row.phase)) throw new TypeError(`Unknown topic alias unlink phase: ${row.phase}`)
  return { topicAliasId, phase: row.phase, pageCursor: row.page_cursor }
}

function isPhase(phase: string): phase is TopicAliasUnlinkPhase {
  return (TOPIC_ALIAS_UNLINK_PHASES as readonly string[]).includes(phase)
}
