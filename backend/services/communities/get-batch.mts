import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import { communityColumns } from './columns.mts'
import { mapCommunityWithOwner, type CommunityRowWithOwner } from './get-mapping.mts'
import type { CommunityWithOwner } from './get.mts'

export async function getCommunitiesByIdBatch(
  ids: string[],
  options: QueryOptions = {},
): Promise<Array<CommunityWithOwner | null | undefined>> {
  if (ids.length === 0) return []

  for (const id of ids) {
    if (!isUUID(id)) throw createError(422, `Invalid community ID: ${id}`)
  }

  const { rows } = await read(
    `/* getCommunitiesByIdBatch */
    WITH input_data AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::int[]) AS input_order
    )
    SELECT ${communityColumns('c')},
      u.id AS owner_id,
      u.username AS owner_username,
      input_data.input_order
    FROM communities c
    JOIN input_data ON input_data.input_value = c.id
    LEFT JOIN users u ON u.id = c.created_by_id
    WHERE c.deleted_at IS NULL
    ORDER BY input_data.input_order
    `,
    [ids, ids.map((_, index) => index)],
    options,
  )

  const results: Array<CommunityWithOwner | null | undefined> = new Array(ids.length).fill(null)
  for (const row of rows) {
    const { input_order, ...community } = row as CommunityRowWithOwner & { input_order: number }
    results[input_order] = mapCommunityWithOwner(community)
  }

  return results
}
