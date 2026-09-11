import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CuratedAsideEntityData, CuratedAsideItem, CuratedAsideType } from './types.mts'

type CuratedAsideItemRow = Omit<CuratedAsideItem, 'entity_data'> & {
  entity_data: CuratedAsideEntityData | null
}

export async function listCuratedItems(asideType: CuratedAsideType): Promise<CuratedAsideItem[]> {
  const { rows } = await read<CuratedAsideItemRow>(sql`/* listCuratedItems */
    SELECT
      cai.id,
      cai.aside_type,
      cai.entity_id,
      cai.position,
      cai.created_by_id,
      cai.created_at,
      CASE cai.aside_type
        WHEN 'topic' THEN
          CASE WHEN topic.id IS NULL THEN NULL ELSE jsonb_build_object(
            'entity_type', 'topic',
            'id', topic.id,
            'name', topic.name,
            'slug', topic.slug,
            'topic_type', topic.topic_type
          ) END
        WHEN 'source' THEN
          CASE WHEN rss_feed_view.id IS NULL THEN NULL ELSE jsonb_build_object(
            'entity_type', 'source',
            'id', rss_feed_view.id,
            'title', COALESCE(rss_feed_view.title, rss_feed_view.rss_feed_url ->> 'url'),
            'rss_feed_url', rss_feed_view.rss_feed_url ->> 'url',
            'home_page_url', rss_feed_view.home_page_url ->> 'url',
            'topic_name', rss_feed_view.topic ->> 'name'
          ) END
        WHEN 'community' THEN
          CASE WHEN community.id IS NULL THEN NULL ELSE jsonb_build_object(
            'entity_type', 'community',
            'id', community.id,
            'name', community.name,
            'slug', community.slug
          ) END
      END AS entity_data
    FROM curated_aside_items cai
    LEFT JOIN topics topic ON topic.id = cai.topic_id
      AND topic.deleted_at IS NULL
      AND topic.merged_into_topic_id IS NULL
    LEFT JOIN rss_feeds rss_feed ON rss_feed.id = cai.rss_feed_id
      AND rss_feed.deleted_at IS NULL
    LEFT JOIN view_rss_feeds rss_feed_view ON rss_feed_view.id = rss_feed.id
      AND rss_feed_view.is_enabled = TRUE
    LEFT JOIN communities community ON community.id = cai.community_id
      AND community.deleted_at IS NULL
      AND community.archived_at IS NULL
      AND community.visibility = 'public'
    WHERE aside_type = ${asideType}
      AND cai.deleted_at IS NULL
    ORDER BY cai.position ASC, cai.id ASC
  `)

  return rows
}
