import { isUUID } from './ids.mts'
import assert from 'http-assert'

export const getIDsFromQuery = (query: string[] | string) => {
  if (!query || query.length === 0) return []
  let uuids = query
  if (typeof uuids === 'string') {
    uuids = uuids.split(/;|,|\|/)
  }
  if (!Array.isArray(uuids)) return []
  uuids = uuids.flatMap(x => (x.trim() ? [x.trim()] : []))
  assert(
    uuids.every(uuid => isUUID(uuid)),
    422,
    'Invalid UUIDs',
  )
  return uuids
}

export const getTypesFromQuery = (query: string[] | string, typesMap: Record<string, boolean>) => {
  if (!query) return []
  let types = query
  if (typeof types === 'string') {
    types = types.split(/;|,/)
  }
  if (!Array.isArray(types)) return []
  types = types.flatMap(x => (x.trim() ? [x.trim()] : []))
  assert(
    types.every(type => typesMap[type]),
    422,
    'Invalid types',
  )
  return types
}

export const getSecondsToDate = (seconds: number | Date) => {
  if (seconds instanceof Date) return seconds
  assert(!Number.isNaN(Number(seconds)), 422, 'Invalid seconds')
  const date = new Date(Number(seconds) * 1000)
  const now = Date.now()
  assert(date.getTime() < now + 1000, 422, 'Future dates are not allowed')
  assert(date.getTime() > 0, 422, 'Invalid date')
  return date
}

export const getIdFromQuery = (query: string) => {
  assert(isUUID(query), 422, 'Invalid ID')
  // don't return as an integer because it might a BIGINT, which is easier to store as a string
  return query
}

export const createGetSearchParameters =
  ({ maxLimit = 100, defaultLimit = 25 }) =>
  (options: {
    limit: number
    offset: number
    before_at: Date | null
    after_at: Date | null
    before_id: string | null
    after_id: string | null
    not_ids: string[]
  }) => {
    const limit = Math.min(Math.max(Math.trunc(options.limit) || defaultLimit, 0), maxLimit)
    const offset = Math.max(Math.trunc(options.offset) || 0, 0)
    const before_at = options.before_at ? getSecondsToDate(options.before_at) : null
    const after_at = options.after_at ? getSecondsToDate(options.after_at) : null
    const before_id = options.before_id ? getIdFromQuery(options.before_id) : null
    const after_id = options.after_id ? getIdFromQuery(options.after_id) : null
    const not_ids = getIDsFromQuery(options.not_ids || [])

    return {
      limit,
      offset,
      before_at,
      after_at,
      before_id,
      after_id,
      not_ids,
    }
  }
