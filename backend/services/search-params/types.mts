export interface ResolvedSearchParams<T> {
  shouldReturnEmpty: boolean
  searchOptions: T
}

type SearchOptionsWithInternalOmitLimit<TSearchOptions extends object> = TSearchOptions & {
  omitLimit?: boolean
}

type SearchOptionsMemberWithInternalOmitLimit<TSearchOptions extends object> =
  TSearchOptions extends unknown
    ? 'omitLimit' extends keyof TSearchOptions
      ? TSearchOptions
      : never
    : never

export function withInternalOmitLimit<TSearchOptions extends object>(
  searchOptions: TSearchOptions,
  ..._compileTimeKeyCheck: [SearchOptionsMemberWithInternalOmitLimit<TSearchOptions>] extends [
    never,
  ]
    ? []
    : [invalidSearchOptions: never]
): SearchOptionsWithInternalOmitLimit<TSearchOptions> {
  return searchOptions
}
