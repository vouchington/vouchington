import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const paginationDefaults = {
  default_limit: 25,
  max_limit: 100,
  anonymous_max_limit: 25,
  search_default_limit: 3,
  small_default_limit: 10,
  trending_default_limit: 20,
  alias_search_default_limit: 24,
  large_default_limit: 50,
  bulk_default_limit: 100,
  small_max_limit: 25,
  trending_max_limit: 50,
  descendants_max_limit: 200,
}
export const paginationMaxima = {
  default_limit: 100,
  max_limit: 100,
  anonymous_max_limit: 25,
  search_default_limit: 100,
  small_default_limit: 100,
  trending_default_limit: 100,
  alias_search_default_limit: 100,
  large_default_limit: 100,
  bulk_default_limit: 100,
  small_max_limit: 25,
  trending_max_limit: 50,
  descendants_max_limit: 200,
}
export const paginationConfig = new DynamicConfig({
  key: 'pagination-config',
  defaultFields: paginationDefaults,
  fieldTypes: Object.fromEntries(
    Object.keys(paginationDefaults).map(field => [field, 'number' as const]),
  ),
})
export function getPaginationLimit(field: keyof typeof paginationDefaults): number {
  return getBoundedPositiveIntegerField(paginationConfig, field, {
    defaultValue: paginationDefaults[field],
    maxValue: paginationMaxima[field],
  })
}
