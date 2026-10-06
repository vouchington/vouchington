import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  extractStaticSqlTemplateQuasis as extractSqlTemplateQuasis,
  type ReaderSqlTemplateOptions,
} from 'vouchington-tooling/post-publication-inventory'

const SQL_TEMPLATE_OPTIONS: ReaderSqlTemplateOptions = {
  templateTag: 'sql',
  appendMethod: 'append',
  placeholderPrefix: 'reader_inventory_placeholder_',
  executorImports: new Map([
    ['@data-stores/psql', new Set(['read', 'write', 'query', 'readStream', 'explainAnalyze'])],
  ]),
}

const PUBLIC_READER_SCOPES = [
  'backend/api/',
  'backend/md/',
  'backend/services/comments/',
  'backend/services/communities/list-items/',
  'backend/services/communities/publications/',
  'backend/services/data-points/',
  'backend/services/entity-relations/',
  'backend/services/my/landing-pages/',
  'backend/services/feeds/',
  'backend/services/posts/search/',
  'backend/services/posts/metrics.mts',
  'backend/services/posts/metrics-batch.mts',
  'backend/services/posts/public-ids.mts',
  'backend/services/platform-stats/',
  'backend/services/stories/get-post-stories.mts',
  'backend/services/prioritized-referral-links/',
  'backend/services/rss-feed-items/',
  'backend/services/rss-xml/',
  'backend/services/search/',
  'backend/services/sitemaps/',
  'backend/services/trending-posts/',
  'backend/services/topics/',
  'backend/services/users/metrics-batch-sql.mts',
]

export function discoverPublicPostReaders(ctx: SharedContext): string[] {
  const readers: string[] = []
  for (const path of ctx.trackedFiles) {
    if (
      !path.endsWith('.mts') ||
      path.includes('/__tests__/') ||
      path.includes('.test.') ||
      !PUBLIC_READER_SCOPES.some(prefix => path.startsWith(prefix))
    ) {
      continue
    }
    const content = ctx.readTrackedFile?.(path)
    if (!content || !content.includes('sql')) continue
    const referencesPostRows =
      /\b(?:FROM|JOIN)\s+(?:view_)?posts\b/i.test(content) ||
      /\bposts?\.(?:id|root_post_id|deleted_at|approved_at|archived_at|privacy|broadcast|post_type|community_id)\b/.test(
        content,
      ) ||
      content.includes('story_posts')
    const buildsReaderSql =
      /\bSELECT\b/i.test(content) ||
      /(?:query-builder|search-filters|eligible-posts-cte)/.test(path)
    if (referencesPostRows && buildsReaderSql) readers.push(path)
  }
  return readers
}

/** Extracts static SQL template quasis and reassembles local SQLStatement append chains. */
export function extractStaticSqlTemplateQuasis(content: string): string[] {
  return extractSqlTemplateQuasis(content, SQL_TEMPLATE_OPTIONS)
}

export {
  sourceImportsAndComposesAny,
  sourceImportsAndUsesBoundaryAny,
} from './post-publication-reader-inventory-composition.mts'
export { sourceFiltersWithPublicBoundary } from './post-publication-reader-inventory-public-boundary.mts'
