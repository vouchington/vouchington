import { read, beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { currentUserCanManageCuratedAsides } from './authorization.mts'
import { getCuratedAsideEntityData } from './entity-data.mts'
import type { CuratedAsideItem, CuratedAsideType } from './types.mts'
import type { PrivateUser } from '@services/users/types'

export async function createCuratedItem(
  currentUser: PrivateUser,
  asideType: CuratedAsideType,
  entityId: string,
  position?: number,
): Promise<CuratedAsideItem> {
  if (!currentUserCanManageCuratedAsides(currentUser)) {
    throw createHttpError(403, 'Forbidden')
  }

  await using query = await beginTransaction()
  const entityData = await getCuratedAsideEntityData(asideType, entityId, { query })
  if (!entityData) {
    throw createHttpError(422, `${asideType} entity not found`)
  }

  const resolvedPosition = position ?? (await getNextAppendPosition(asideType, { query }))

  const { rows } = await write<Omit<CuratedAsideItem, 'entity_data'>>(
    sql`/* createCuratedItem */
      INSERT INTO curated_aside_items (
        topic_id,
        rss_feed_id,
        community_id,
        position,
        created_by_id
      )
      VALUES (
        CASE WHEN ${asideType} = 'topic' THEN ${entityId}::uuid END,
        CASE WHEN ${asideType} = 'source' THEN ${entityId}::uuid END,
        CASE WHEN ${asideType} = 'community' THEN ${entityId}::uuid END,
        ${resolvedPosition}::smallint,
        ${currentUser.id}
      )
      ON CONFLICT (aside_type, entity_id) WHERE deleted_at IS NULL DO UPDATE
        SET position = EXCLUDED.position
      RETURNING id, aside_type, entity_id, position, created_by_id, created_at
    `,
    { query },
  )

  const result = {
    ...rows[0],
    entity_data: entityData,
  }

  await query.commit()
  return result
}

async function getNextAppendPosition(
  asideType: CuratedAsideType,
  options: QueryOptions,
): Promise<number> {
  const { rows } = await read<{ max_position: number | null }>(
    sql`/* getNextCuratedAsidePosition */
      SELECT MAX(position) AS max_position
      FROM curated_aside_items
      WHERE aside_type = ${asideType}
        AND deleted_at IS NULL
    `,
    options,
  )
  const maxPosition = rows[0]?.max_position
  if (maxPosition == null) return 0
  if (maxPosition >= 32767) throw createHttpError(422, 'No curated aside positions are available')
  return maxPosition + 1
}
