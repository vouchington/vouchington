import type {
  ReaderSourceAnalysisOptions,
  ReaderSqlTemplateOptions,
} from 'vouchington-tooling/post-publication-inventory'

export const SQL_TEMPLATE_OPTIONS: ReaderSqlTemplateOptions = {
  templateTag: 'sql',
  appendMethod: 'append',
  placeholderPrefix: 'reader_inventory_placeholder_',
  executorImports: new Map([
    ['@data-stores/psql', new Set(['read', 'write', 'query', 'readStream', 'explainAnalyze'])],
  ]),
}

export function readerSourceOptions(symbols: string[]): ReaderSourceAnalysisOptions {
  const canonicalImports = new Map(symbols.map(symbol => [symbol, allowedImportSources(symbol)]))
  return {
    canonicalImports,
    sql: SQL_TEMPLATE_OPTIONS,
    ignoredCall: 'ignore',
    candidateIdProperty: 'id',
  }
}

function allowedImportSources(symbol: string): Set<string> {
  if (symbol === 'buildDirectPostEligibilityFilter') {
    return new Set(['@modules/feed-query-builders', './post-publication-eligibility.mts'])
  }
  if (symbol === 'buildDirectPostAccessFilter') return new Set(['./direct-access-filter.mts'])
  if (symbol === 'buildPublicPostEligibilityFilter') {
    return new Set(['@modules/feed-query-builders', './post-publication-eligibility.mts'])
  }
  if (symbol === 'buildViewerPostDiscoveryEligibilityFilter') {
    return new Set(['@modules/feed-query-builders', './post-publication-eligibility.mts'])
  }
  if (symbol === 'getPublicPostIds') return new Set(['@services/posts'])
  if (symbol === 'getCommentDescendantsPage') return new Set(['@services/comments'])
  if (symbol === 'getVisibleCommentDescendantIdsPage') {
    return new Set(['@services/comments', './descendant-ids.mts'])
  }
  if (symbol === 'getVisiblePostStoryIdsByStoryIds') return new Set(['@services/stories'])
  return new Set(['@services/posts', '@services/posts/check-privacy-access'])
}
