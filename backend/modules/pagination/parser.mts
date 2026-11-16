/**
 * Voucha's pagination adapter preserves the public parser configuration and
 * product filters while delegating generic cursor and limit parsing upstream.
 */

import {
  PaginationParser as PlatformPaginationParser,
  narrowLimitBounds,
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
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

class InvalidCursorParameterError extends Error {
  readonly status = 400

  constructor() {
    super('Invalid cursor parameter')
  }
}

export type PaginationRuntimeLimitBounds = { default: number; max: number }

export class PaginationParser<TConfig extends PaginationConfig> {
  readonly queryContract: PaginationQueryContract<TConfig>
  readonly #core: PlatformPaginationParser<PlatformPaginationConfig>
  readonly #limitBounds: { default: number; min: number; max: number }
  readonly #filters: TConfig['filters']
  readonly #cursorParamName: string

  constructor(config: TConfig) {
    const limitMin = config.limit?.min ?? 1
    const limitMax = config.limit?.max ?? 100
    const limitDefault = config.limit?.default ?? 25
    this.#limitBounds = { default: limitDefault, min: limitMin, max: limitMax }
    this.#cursorParamName = config.cursor.paramName ?? 'after'
    this.#core = new PlatformPaginationParser({
      cursor: {
        paramName: this.#cursorParamName,
      },
      limit: {
        paramName: 'limit',
        min: limitMin,
        max: limitMax,
        // Construction-only: parse() strips `limit` before delegating, so these
        // bounds are never applied. #limitBounds below stays authoritative,
        // including its declared static default.
        default: Math.max(limitMin, Math.min(limitMax, limitDefault)),
      },
    })
    this.#filters = config.filters
    this.queryContract = buildPaginationQueryContract(config)
  }

  parse(
    query: Record<string, unknown>,
    runtimeBounds?: PaginationRuntimeLimitBounds,
  ): ParsedOptions<TConfig> {
    if (this.#cursorParamName !== 'cursor' && 'cursor' in query) {
      throw new InvalidCursorParameterError()
    }
    const { limit, ...cursorQuery } = query
    const { after } = this.#core.parse(cursorQuery)
    const bounds = narrowLimitBounds(this.#limitBounds, runtimeBounds)
    const parsedLimit = parseBoundedIntegerLimit(limit, bounds)
    const filters = this.#filters
    return {
      ...(after !== undefined && { after }),
      limit: parsedLimit,
      ...(filters && parseFilters(filters, query)),
    } as ParsedOptions<TConfig>
  }
}

export function parseBoundedIntegerLimit(
  value: unknown,
  bounds: { default: number; min: number; max: number },
): number {
  return parsePlatformBoundedIntegerLimit(value, { paramName: 'limit', ...bounds })
}

function defined(key: string, value: unknown): Array<[string, unknown]> {
  return value === undefined ? [] : [[key, value]]
}

function searchEntries(query: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ...(query.text_search_query !== undefined
      ? [['text_search_query', stringFromUnknown(query.text_search_query)] as [string, unknown]]
      : []),
    ...(query.semantic_search_query !== undefined
      ? [
          ['semantic_search_query', stringFromUnknown(query.semantic_search_query)] as [
            string,
            unknown,
          ],
        ]
      : []),
  ]
}

/** Validates each enabled filter in declaration order and keeps the ones the query supplied. */
function parseFilters(
  filters: NonNullable<PaginationConfig['filters']>,
  query: Record<string, unknown>,
): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [
    ...(filters.postTypes ? defined('post_types', validatePostTypes(query.post_types)) : []),
    ...(filters.topicTypes ? defined('topic_types', validateTopicTypes(query.topic_types)) : []),
    ...(filters.timeRange ? defined('time_range', validateTimeRange(query.time_range)) : []),
    ...(filters.sort ? defined('sort', validateSort(query.sort, filters.sort)) : []),
    ...(filters.search ? searchEntries(query) : []),
    ...(filters.mediaTypes
      ? defined('media_types', validateMediaTypes(query.media_type, query.media_types))
      : []),
  ]
  return Object.fromEntries(entries)
}
