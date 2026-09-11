import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import sql from 'sql-template-strings'

export async function getFollowerIdsForDistribution(
  userId: string,
  selectedFollowerIds?: string[],
  options: QueryOptions = {},
): Promise<string[]> {
  const dedupedSelection = selectedFollowerIds ? [...new Set(selectedFollowerIds)] : undefined

  if (dedupedSelection && dedupedSelection.length === 0) {
    throw createError(400, 'At least one follower must be selected')
  }

  if (dedupedSelection?.some(id => !isUUID(id))) {
    throw createError(400, 'Selected users must be valid UUIDs')
  }

  const query = sql`/* getFollowerIdsForDistribution */
    SELECT subject_id AS user_id
    FROM relation__user__follow__user
    WHERE object_id = ${userId}
      AND deleted_at IS NULL
  `

  if (dedupedSelection) {
    query.append(sql`
      AND subject_id = ANY(${dedupedSelection}::uuid[])
    `)
  }

  query.append(sql`
    ORDER BY created_at DESC
  `)

  const { rows } = await read(query, options)
  const recipientIds = rows.map(row => row.user_id as string)

  if (dedupedSelection && recipientIds.length !== dedupedSelection.length) {
    throw createError(400, 'Selected users must be current followers')
  }

  return recipientIds
}
