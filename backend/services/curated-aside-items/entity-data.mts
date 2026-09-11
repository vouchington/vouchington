import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CuratedAsideEntityData, CuratedAsideType } from './types.mts'

export async function getCuratedAsideEntityData(
  asideType: CuratedAsideType,
  entityId: string,
  options?: QueryOptions,
): Promise<CuratedAsideEntityData | null> {
  if (asideType === 'topic') return getTopicEntityData(entityId, options)
  if (asideType === 'source') return getSourceEntityData(entityId, options)
  return getCommunityEntityData(entityId, options)
}

async function getTopicEntityData(
  entityId: string,
  options?: QueryOptions,
): Promise<CuratedAsideEntityData | null> {
  const { rows } = await read<CuratedAsideEntityData>(
    sql`/* getCuratedAsideEntityData:topic */
      SELECT
        'topic' AS entity_type,
        id,
        name,
        slug,
        topic_type
      FROM topics
      WHERE id = ${entityId}
        AND deleted_at IS NULL
        AND merged_into_topic_id IS NULL
      LIMIT 1
    `,
    options,
  )
  return rows[0] ?? null
}

async function getSourceEntityData(
  entityId: string,
  options?: QueryOptions,
): Promise<CuratedAsideEntityData | null> {
  const { rows } = await read<CuratedAsideEntityData>(
    sql`/* getCuratedAsideEntityData:source */
      SELECT
        'source' AS entity_type,
        rss_feed_view.id,
        COALESCE(rss_feed_view.title, rss_feed_view.rss_feed_url ->> 'url') AS title,
        rss_feed_view.rss_feed_url ->> 'url' AS rss_feed_url,
        rss_feed_view.home_page_url ->> 'url' AS home_page_url,
        rss_feed_view.topic ->> 'name' AS topic_name
      FROM rss_feeds rf
      JOIN view_rss_feeds rss_feed_view ON rss_feed_view.id = rf.id
        AND rss_feed_view.is_enabled = TRUE
      WHERE rf.id = ${entityId}
        AND rf.deleted_at IS NULL
      LIMIT 1
    `,
    options,
  )
  return rows[0] ?? null
}

async function getCommunityEntityData(
  entityId: string,
  options?: QueryOptions,
): Promise<CuratedAsideEntityData | null> {
  const { rows } = await read<CuratedAsideEntityData>(
    sql`/* getCuratedAsideEntityData:community */
      SELECT
        'community' AS entity_type,
        id,
        name,
        slug
      FROM communities
      WHERE id = ${entityId}
        AND deleted_at IS NULL
        AND archived_at IS NULL
        AND visibility = 'public'
      LIMIT 1
    `,
    options,
  )
  return rows[0] ?? null
}
