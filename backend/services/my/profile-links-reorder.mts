import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export async function reorderProfileLinks(userId: string, orderedIds: string[]): Promise<void> {
  assert(orderedIds.length > 0, 400, 'orderedIds must not be empty')
  const { rows } = await write<{
    existing_count: number
    invalid_id: string | null
  }>(sql`/* reorderProfileLinks */
    WITH existing AS MATERIALIZED (
      SELECT id
      FROM user_profile_links
      WHERE user_id = ${userId}
    ),
    requested AS MATERIALIZED (
      -- Only canonical lowercase UUID text casts; any other spelling stays NULL and is reported as not found.
      SELECT
        raw_id,
        CASE WHEN raw_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN raw_id::uuid END AS id,
        sort_order
      FROM UNNEST(${orderedIds}::text[], ${orderedIds.map((_, i) => i)}::bigint[])
        AS ordering(raw_id, sort_order)
    ),
    validation AS MATERIALIZED (
      SELECT
        (SELECT COUNT(*)::int FROM existing) AS existing_count,
        (
          SELECT requested.raw_id
          FROM requested
          WHERE NOT EXISTS (
            SELECT 1 FROM existing WHERE existing.id = requested.id
          )
          ORDER BY requested.sort_order
          LIMIT 1
        ) AS invalid_id
    ),
    updated AS (
      UPDATE user_profile_links
      SET sort_order = requested.sort_order
      FROM requested, validation
      WHERE user_profile_links.id = requested.id
        AND user_profile_links.user_id = ${userId}
        AND validation.existing_count = ${orderedIds.length}
        AND validation.invalid_id IS NULL
      RETURNING user_profile_links.id
    )
    SELECT existing_count, invalid_id FROM validation
  `)
  const existingCount = rows[0]?.existing_count ?? 0
  assert(
    orderedIds.length === existingCount,
    400,
    'All profile links must be included in the reorder',
  )
  if (rows[0]?.invalid_id !== null) {
    assert(false, 400, `Link ${rows[0]?.invalid_id} not found`)
  }
}
