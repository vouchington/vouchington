import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readStaffEditorialRows(actorId: string) {
  const { rows } = await write<{
    crawlers: unknown[]
    batches: unknown[]
  }>(sql`/* readStaffEditorialRows */
    SELECT
      (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY id), '[]'::jsonb) FROM crawlers c WHERE created_by_id = ${actorId}) AS crawlers,
      (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY id), '[]'::jsonb) FROM admin_import_batches b WHERE created_by_id = ${actorId}) AS batches`)
  return rows[0]!
}

export async function readStaffCategoryState(category: string) {
  const { rows } = await write<{
    rejected: boolean
    alias: unknown
  }>(sql`/* readStaffCategoryState */
    SELECT EXISTS(SELECT 1 FROM rss_feed_item_category_rejections WHERE category_text = ${category}) AS rejected,
      (SELECT to_jsonb(a) FROM topic_aliases a WHERE alias = ${category}) AS alias`)
  return rows[0]!
}
