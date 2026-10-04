import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import { paginationConfig, paginationMaxima } from '@services/pagination/config'

const descriptions = {
  default_limit: 'Default page size for routes with the standard 25-row static default.',
  max_limit:
    'Effective maximum for the common 100-row ceiling profile; exception profiles have independent maxima.',
  anonymous_max_limit: 'Maximum page size for anonymous search callers, within each route ceiling.',
  search_default_limit: 'Default page size for search routes with a three-row static default.',
  small_default_limit: 'Default page size for routes with a ten-row static default.',
  trending_default_limit: 'Default page size for routes with a twenty-row static default.',
  alias_search_default_limit: 'Default page size for alias search routes.',
  large_default_limit: 'Default page size for routes with a fifty-row static default.',
  bulk_default_limit: 'Default page size for routes with a hundred-row static default.',
  small_max_limit: 'Effective maximum for routes advertising a 25-row ceiling.',
  trending_max_limit: 'Effective maximum for routes advertising a 50-row ceiling.',
  descendants_max_limit: 'Effective maximum for comment descendants within their 200-row ceiling.',
}

export const paginationRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'pagination-config',
    label: 'Pagination',
    description:
      'Controls runtime pagination defaults and effective maxima within immutable API ceilings.',
    config: paginationConfig,
    access: { update_roles: ['developer'] },
    fields: Object.fromEntries(
      Object.entries(descriptions).map(([field, description]) => [
        field,
        {
          description,
          min_value: 1,
          max_value: paginationMaxima[field as keyof typeof paginationMaxima],
          integer: true,
        },
      ]),
    ),
  }),
]
