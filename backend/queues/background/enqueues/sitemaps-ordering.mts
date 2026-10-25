import { entityOrderingKey } from './define-job.mts'

// Each lane serializes writes to one set of sitemap files.
export const SITEMAPS_ORDERING = {
  post_day_today: { key: entityOrderingKey('sitemaps', 'post_day_today') },
  post_day_past: { key: entityOrderingKey('sitemaps', 'post_day_past') },
  indexes: { key: entityOrderingKey('sitemaps', 'indexes') },
  dispatcher: { key: entityOrderingKey('sitemaps', 'dispatcher') },
} as const
