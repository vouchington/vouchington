import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { ViewUrl } from './types.mts'

export const getUrlsByIdBatch = async (
  ids: string[],
  options: QueryOptions = {},
): Promise<Array<ViewUrl | null | undefined>> => {
  if (ids.length === 0) {
    return []
  }

  const normalizedIds = ids.map(id => {
    if (!isUUID(id)) {
      throw createError(422, `Invalid URL ID: ${id}`)
    }

    return id.toLowerCase()
  })

  const uniqueIds = [...new Set(normalizedIds)]

  const { rows } = await read(
    `/* getUrlsByIdBatch */
    SELECT vu.*
    FROM view_urls vu
    WHERE vu.id = ANY($1::uuid[])
  `,
    [uniqueIds],
    options,
  )

  const urlsById = new Map(rows.map(row => [(row.id as string).toLowerCase(), row as ViewUrl]))
  return normalizedIds.map(id => urlsById.get(id) ?? null)
}
