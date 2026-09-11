import { read } from '@data-stores/psql'
import {
  getReadStateStorageConfig,
  type ReadStateEntityType,
} from '@voucha/types/entities/read-state'

export async function readStateExists(
  userId: string,
  type: ReadStateEntityType,
  entityId: string,
): Promise<boolean> {
  const { table, column } = getReadStateStorageConfig(type)
  const { rows } = await read(`SELECT 1 FROM ${table} WHERE user_id = $1 AND ${column} = $2`, [
    userId,
    entityId,
  ])
  return rows.length > 0
}
