/**
 * Voucha's pagination adapter preserves the public parser configuration and
 * product filters while delegating generic cursor and limit parsing upstream.
 */

import {
  PaginationParser as PlatformPaginationParser,
  parseBoundedIntegerLimit as parsePlatformBoundedIntegerLimit,
  type PaginationConfig as PlatformPaginationConfig,
} from '@vouchington/pagination'
import type { PaginationConfig, ParsedOptions } from './types.mts'
import type { PaginationQueryContract } from './pagination-query-contract.mts'
import { buildPaginationQueryContract } from './pagination-query-contract-builder.mts'
import {
  validateMediaTypes,
  validatePostTypes,
  validateSort,
  validateTimeRange,
  validateTopicTypes,
} from './filters.mts'

export class PaginationParser<TConfig extends PaginationConfig> {
  readonly queryContract: PaginationQueryContract<TConfig>
  readonly #core: PlatformPaginationParser<PlatformPaginationConfig>
  readonly #limitBounds: { default: number; min: number; max: number }
  readonly #filters: TConfig['filters']

  constructor(config: TConfig) {
    const limitMin = config.limit?.min ?? 1
    const limitMax = config.limit?.max ?? 100
    const limitDefault = config.limit?.default ?? 25
    this.#limitBounds = { default: limitDefault, min: limitMin, max: limitMax }
    this.#core = new PlatformPaginationParser({
      cursor: {
        paramName: config.cursor.paramName ?? 'after',
        legacyParamNames: config.cursor.legacyParamNames,
      },
      limit: {
        paramName: 'limit',
        min: limitMin,
        max: limitMax,
        // Construction-only: parse() strips `limit` before delegating, so these
        // bounds are never applied. #limitBounds below stays authoritative,
        // including its intentionally unclamped legacy default.
        default: Math.max(limitMin, Math.min(limitMax, limitDefault)),
      },
    })
    this.#filters = config.filters
    this.queryContract = buildPaginationQueryContract(config)
  }

  parse(query: Record<string, unknown>): ParsedOptions<TConfig> {
    const { limit, ...cursorQuery } = query
    const { after } = this.#core.parse(cursorQuery)
    const result: Record<string, unknown> = {}
    if (after !== undefined) result.after = after
    result.limit = parseBoundedIntegerLimit(limit, this.#limitBounds)
    const filters = this.#filters
    if (!filters) return result as ParsedOptions<TConfig>

    if (filters.postTypes) setDefined(result, 'post_types', validatePostTypes(query.post_types))
    if (filters.topicTypes) setDefined(result, 'topic_types', validateTopicTypes(query.topic_types))
    if (filters.timeRange) setDefined(result, 'time_range', validateTimeRange(query.time_range))
    if (filters.sort) setDefined(result, 'sort', validateSort(query.sort, filters.sort))
    if (filters.search) {
      if (query.text_search_query !== undefined)
        result.text_search_query = String(query.text_search_query)
      if (query.semantic_search_query !== undefined)
        result.semantic_search_query = String(query.semantic_search_query)
    }
    if (filters.mediaTypes)
      setDefined(result, 'media_types', validateMediaTypes(query.media_type, query.media_types))
    return result as ParsedOptions<TConfig>
  }
}

export function parseBoundedIntegerLimit(
  value: unknown,
  bounds: { default: number; min: number; max: number },
): number {
  return parsePlatformBoundedIntegerLimit(value, { paramName: 'limit', ...bounds })
}

function setDefined(result: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) result[key] = value
}
