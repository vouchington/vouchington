import type { VALID_TIME_RANGES } from '@voucha/types/feed'
import type { VALID_MEDIA_TYPES, VALID_POST_TYPES, VALID_TOPIC_TYPES } from './filters.mts'
import type { FiltersConfig, PaginationConfig } from './types.mts'
import type {
  QueryCsvArrayContract,
  QueryEnumContract,
  QueryIntegerContract,
  QueryStringContract,
} from './query-contract.mts'

type ConfiguredValue<TValue, TKey extends PropertyKey, TFallback> =
  TValue extends Record<TKey, infer TResult> ? Exclude<TResult, undefined> : TFallback

type CursorParameterName<TConfig extends PaginationConfig> = ConfiguredValue<
  TConfig['cursor'],
  'paramName',
  'after'
> &
  string

type LimitContract<TConfig extends PaginationConfig> = QueryIntegerContract<
  ConfiguredValue<TConfig['limit'], 'min', 1> & number,
  ConfiguredValue<TConfig['limit'], 'max', 100> & number,
  ConfiguredValue<TConfig['limit'], 'default', 25> & number
>

type PaginationFilterQueryContract<TFilters extends FiltersConfig | undefined> = (TFilters extends {
  postTypes: true
}
  ? {
      readonly post_types: QueryCsvArrayContract<QueryEnumContract<typeof VALID_POST_TYPES>>
    }
  : {}) &
  (TFilters extends { topicTypes: true }
    ? {
        readonly topic_types: QueryCsvArrayContract<QueryEnumContract<typeof VALID_TOPIC_TYPES>>
      }
    : {}) &
  (TFilters extends { timeRange: true }
    ? { readonly time_range: QueryEnumContract<typeof VALID_TIME_RANGES> }
    : {}) &
  (TFilters extends { sort: infer TValues extends readonly string[] }
    ? { readonly sort: QueryEnumContract<TValues> }
    : {}) &
  (TFilters extends { search: true }
    ? {
        readonly text_search_query: QueryStringContract
        readonly semantic_search_query: QueryStringContract
      }
    : {}) &
  (TFilters extends { mediaTypes: true }
    ? {
        readonly media_type: QueryEnumContract<typeof VALID_MEDIA_TYPES>
        readonly media_types: QueryCsvArrayContract<QueryEnumContract<typeof VALID_MEDIA_TYPES>>
      }
    : {})

export type PaginationQueryContract<TConfig extends PaginationConfig> = {
  readonly [TName in CursorParameterName<TConfig>]: QueryStringContract
} & {
  readonly limit: LimitContract<TConfig>
} & PaginationFilterQueryContract<TConfig['filters']>
