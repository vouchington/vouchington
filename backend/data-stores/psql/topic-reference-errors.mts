import type { QueryExecutor } from './types.mts'
import { createCodedError } from '@vouchington/sentry'

/** Map only the schema's topic lifecycle rejection; preserve every other PostgreSQL error. */
export function normalizeTopicReferenceError(error: unknown): unknown {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'V0409') return error
  if (!('detail' in error) || typeof error.detail !== 'string') return error
  let detail: unknown
  try {
    detail = JSON.parse(error.detail)
  } catch {
    return error
  }
  if (typeof detail !== 'object' || detail === null || !('code' in detail)) return error
  if (detail.code !== 'topic_reference_busy' && detail.code !== 'topic_reference_inactive') {
    return error
  }
  const normalized = createCodedError(409, error.message, detail.code)
  normalized.cause = error
  return Object.assign(normalized, {
    topic_id: 'topic_id' in detail ? detail.topic_id : undefined,
  })
}

/** Retain the query's generic overloads while normalizing only rejected database promises. */
export function normalizeTopicReferenceQuery<Query extends QueryExecutor>(query: Query): Query {
  return new Proxy(query, {
    apply(target, thisArg, args: Parameters<QueryExecutor>) {
      const pending: ReturnType<QueryExecutor> = Reflect.apply(target, thisArg, args)
      return pending.catch((err: unknown) => {
        throw normalizeTopicReferenceError(err)
      })
    },
  })
}
