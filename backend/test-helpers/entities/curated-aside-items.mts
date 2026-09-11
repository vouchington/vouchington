import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CuratedAsideItem, CuratedAsideType } from '@voucha/types/entities/curated-aside-item'

export async function insertTestCuratedAsideItem(data: {
  asideType: CuratedAsideType
  entityId: string
  position?: number
  createdById: string
}): Promise<Omit<CuratedAsideItem, 'entity_data'>> {
  const { rows } = await write<Omit<CuratedAsideItem, 'entity_data'>>(
    sql`/* insertTestCuratedAsideItem */
      INSERT INTO curated_aside_items (
        topic_id,
        rss_feed_id,
        community_id,
        position,
        created_by_id
      )
      VALUES (
        CASE WHEN ${data.asideType} = 'topic' THEN ${data.entityId}::uuid END,
        CASE WHEN ${data.asideType} = 'source' THEN ${data.entityId}::uuid END,
        CASE WHEN ${data.asideType} = 'community' THEN ${data.entityId}::uuid END,
        ${data.position ?? 0},
        ${data.createdById}
      )
      ON CONFLICT (aside_type, entity_id) WHERE deleted_at IS NULL DO UPDATE
        SET position = EXCLUDED.position
      RETURNING id, aside_type, entity_id, position, created_by_id, created_at
    `,
  )
  return rows[0]!
}
