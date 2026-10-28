import { read } from '@data-stores/psql'
import {
  enqueueRecoverTopicAliasUnlinks,
  enqueueTopicAliasUnlinkPages,
} from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { normalizeHashtag } from '@ts-shared/utils'
import { pageFromRow } from './unlink-topic-alias-next-page.mts'

/** Re-admits one bounded page of aliases whose unlink was accepted and not finished. */
export async function recoverTopicAliasUnlinks(afterId: string | null): Promise<void> {
  const limit = getPostPublicationWorkLimit('topic_alias_unlink_page_size')
  const { rows } = await read<{ id: string; alias: string }>(
    `/* recoverTopicAliasUnlinks */
    SELECT id, alias
    FROM topic_aliases
    WHERE unlink_requested_at IS NOT NULL
      AND ($1::uuid IS NULL OR id > $1::uuid)
    ORDER BY id
    LIMIT $2`,
    [afterId, limit + 1],
  )
  const hasMore = rows.length > limit
  const aliases = rows.slice(0, limit)
  if (aliases.length === 0) return
  const ids = aliases.map(alias => alias.id)
  const preservesHashtag = aliases.map(alias => Boolean(normalizeHashtag(alias.alias)))
  const { rows: planned } = await read<{
    topic_alias_id: string
    phase: string | null
    page_cursor: string | null
  }>(
    `/* recoverTopicAliasUnlinks nextPage */
    SELECT input.id AS topic_alias_id, page.phase, page.page_cursor
    FROM unnest($1::uuid[], $2::boolean[]) AS input(id, preserves_hashtag)
    LEFT JOIN LATERAL (
      SELECT candidate.phase, candidate.page_cursor
      FROM (
        (
          SELECT 'post_sources' AS phase, source.id::text AS page_cursor, 1 AS ord
          FROM post_topic_alias_sources source
          WHERE source.topic_alias_id = input.id
            AND NOT input.preserves_hashtag
          ORDER BY source.post_id DESC, source.id DESC
          LIMIT 1
        )
        UNION ALL
        (
          SELECT 'post_relations' AS phase, relation.id::text AS page_cursor, 2 AS ord
          -- no-mistakes-disable-next-line postgres-required-predicates: unlink drains soft-deleted alias edges before the alias row can go
          FROM relation__post__category__topic_alias relation
          WHERE relation.object_id = input.id
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
          WHERE category.topic_alias_id = input.id
          ORDER BY category.rss_feed_item_id DESC, category.category_identity_id
          LIMIT 1
        )
        UNION ALL
        (
          SELECT 'rss_item_relations' AS phase, relation.id::text AS page_cursor, 4 AS ord
          -- no-mistakes-disable-next-line postgres-required-predicates: unlink drains soft-deleted alias edges before the alias row can go
          FROM relation__rss_feed_item__category__topic_alias relation
          WHERE relation.object_id = input.id
          ORDER BY relation.subject_id, relation.id
          LIMIT 1
        )
      ) candidate
      ORDER BY candidate.ord
      LIMIT 1
    ) page ON TRUE
    ORDER BY input.id`,
    [ids, preservesHashtag],
  )
  const pages = planned.map(row => pageFromRow(row.topic_alias_id, row.phase ? row : undefined))
  await enqueueTopicAliasUnlinkPages(pages)
  if (hasMore) await enqueueRecoverTopicAliasUnlinks(aliases.at(-1)!.id)
}
