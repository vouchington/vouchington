import { VALID_TIME_RANGES } from '@voucha/types/feed'
import type { PaginationQueryContract } from './pagination-query-contract.mts'
import type { FiltersConfig, PaginationConfig } from './types.mts'
import { VALID_MEDIA_TYPES, VALID_POST_TYPES, VALID_TOPIC_TYPES } from './filters.mts'
import {
  queryCsvArray,
  queryEnum,
  queryInteger,
  queryString,
  type QueryParameterContract,
} from './query-contract.mts'

const paginationFilterQueryNames = {
  postTypes: ['post_types'],
  topicTypes: ['topic_types'],
  timeRange: ['time_range'],
  sort: ['sort'],
  search: ['text_search_query', 'semantic_search_query'],
  mediaTypes: ['media_type', 'media_types'],
} as const satisfies Record<keyof Required<FiltersConfig>, readonly string[]>

type PaginationFilterName = keyof typeof paginationFilterQueryNames
type PaginationFilterContract<TFilterName extends PaginationFilterName> = Readonly<
  Partial<Record<(typeof paginationFilterQueryNames)[TFilterName][number], QueryParameterContract>>
>
type PaginationFilterContractBuilders = {
  [TFilterName in PaginationFilterName]: (
    filters: FiltersConfig,
  ) => PaginationFilterContract<TFilterName>
}

type ExtraPaginationFilterContractKeys<
  TFilterName extends PaginationFilterName,
  TContract extends object,
> = TContract extends unknown
  ? Exclude<keyof TContract, (typeof paginationFilterQueryNames)[TFilterName][number]>
  : never

export function definePaginationFilterContractBuilder<
  const TFilterName extends PaginationFilterName,
  const TContract extends object,
>(
  _filterName: TFilterName,
  builder: (filters: FiltersConfig) => TContract,
  ..._compileTimeKeyCheck: ExtraPaginationFilterContractKeys<TFilterName, TContract> extends never
    ? []
    : [invalidContract: never]
): (filters: FiltersConfig) => TContract {
  return builder
}

const paginationFilterContractBuilders = {
  postTypes: definePaginationFilterContractBuilder(
    'postTypes',
    function buildPostTypesContract(filters) {
      if (!filters.postTypes) return {}
      return { post_types: queryCsvArray(queryEnum(VALID_POST_TYPES)) }
    },
  ),
  topicTypes: definePaginationFilterContractBuilder(
    'topicTypes',
    function buildTopicTypesContract(filters) {
      if (!filters.topicTypes) return {}
      return { topic_types: queryCsvArray(queryEnum(VALID_TOPIC_TYPES)) }
    },
  ),
  timeRange: definePaginationFilterContractBuilder(
    'timeRange',
    function buildTimeRangeContract(filters) {
      if (!filters.timeRange) return {}
      return { time_range: queryEnum(VALID_TIME_RANGES) }
    },
  ),
  sort: definePaginationFilterContractBuilder('sort', function buildSortContract(filters) {
    if (!filters.sort) return {}
    return { sort: queryEnum(filters.sort) }
  }),
  search: definePaginationFilterContractBuilder('search', function buildSearchContract(filters) {
    if (!filters.search) return {}
    return {
      text_search_query: queryString(),
      semantic_search_query: queryString(),
    }
  }),
  mediaTypes: definePaginationFilterContractBuilder(
    'mediaTypes',
    function buildMediaTypesContract(filters) {
      if (!filters.mediaTypes) return {}
      return {
        media_type: queryEnum(VALID_MEDIA_TYPES),
        media_types: queryCsvArray(queryEnum(VALID_MEDIA_TYPES)),
      }
    },
  ),
} satisfies PaginationFilterContractBuilders

export function buildPaginationQueryContract<TConfig extends PaginationConfig>(
  config: TConfig,
): PaginationQueryContract<TConfig> {
  const contract: Record<string, QueryParameterContract> = {
    [config.cursor.paramName ?? 'after']: queryString(),
    limit: queryInteger({
      minimum: config.limit?.min ?? 1,
      maximum: config.limit?.max ?? 100,
      default: config.limit?.default ?? 25,
    }),
  }
  const filters = config.filters
  if (filters) {
    for (const buildFilterContract of Object.values(paginationFilterContractBuilders)) {
      Object.assign(contract, buildFilterContract(filters))
    }
  }
  return contract as PaginationQueryContract<TConfig>
}
