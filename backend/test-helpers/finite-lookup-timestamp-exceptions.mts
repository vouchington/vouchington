/* v8 ignore start -- declarative timestamp exceptions have no executable branches */
import { PROVIDER_LOOKUP_BOUNDS } from '../data-stores/psql/schema-growth-provider-lookups.mts'

export const FINITE_LOOKUP_MISSING_UPDATED_AT = new Map<string, string>([
  ...Array.from(
    PROVIDER_LOOKUP_BOUNDS.keys(),
    table =>
      [
        table,
        'Immutable first-sight provider vocabulary row; subsequent arrivals reuse its natural key.',
      ] as const,
  ),
  [
    'post_topic_recommendation_landing_page_urls',
    'Ordered URL projection rows are deleted and replaced atomically; no row is updated.',
  ],
])
