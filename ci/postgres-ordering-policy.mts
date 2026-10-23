import { matchesGlob } from 'node:path'

export type RuleOptions = { include: string[]; exclude: string[] }

export const expectedCatalogOptions = {
  importSpecifier: '@data-stores/psql',
  schemaCatalogPath: 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json',
  sqlInclude: ['backend/data-stores/psql/config-driven/**/*.sql'],
  include: ['backend/**/*.mts', 'backend/**/*.ts'],
  exclude: [
    '**/*.test.*',
    '**/test-helpers/**',
    '**/__tests__/**',
    '**/fixtures/**',
    '**/*test-helper*.*',
    '**/*test-support.*',
    '**/*fixture*.*',
    '**/scripts/**',
    'backend/data-stores/psql/config-driven/**/*seed*.mts',
    'backend/data-stores/psql/config-driven/**/*seed*.sql',
    'backend/data-stores/psql/config-driven/0080-00-01-publisher-type-topics.mts',
    'backend/data-stores/psql/config-driven/0080-00-02-publisher-type-relations.sql',
  ],
  safeDirective: 'deadlock-safe',
}

const executorOptions = {
  executorFactoryNames: ['beginTransaction', 'beginBoundedTransaction'],
  executorTypeNames: ['TransactionQuery', 'QueryExecutor'],
}

export const expectedCatalogOrderingRules = [
  {
    name: 'production PostgreSQL writers acquire conflicts in catalog order',
    rule: 'postgres-conflict-ordering',
    scope: 'repository',
    options: {
      ...expectedCatalogOptions,
      ...executorOptions,
      executorNames: ['query', 'write'],
      unanalyzableSql: 'ignore',
    },
  },
  {
    name: 'production PostgreSQL locks use catalog key prefixes',
    rule: 'postgres-lock-ordering',
    scope: 'repository',
    options: { ...expectedCatalogOptions, ...executorOptions, unanalyzableSql: 'ignore' },
  },
]

export const expectedDirectiveInventory = [
  'backend/data-stores/psql/config-driven/0503-00-00-youtube-rss-unreliable-status-codes.sql:1',
  'backend/services/bedrock-embeddings-batch/orchestrator/reconcile-existing.mts:1',
  'backend/services/bedrock-embeddings-batch/orchestrator/save.mts:1',
  'backend/services/bluesky-accounts/native-completion-persistence.mts:1',
  'backend/services/communities/list-items/add.mts:1',
  'backend/services/crawl-chunks/create.mts:1',
  'backend/services/data-retention/cleanup-oauth-friend-edges.mts:2',
  'backend/services/entity-cache/hostname-invalidation-drain.mts:2',
  'backend/services/identity-verification/attempts.mts:1',
  'backend/services/individuals-households/households/spending-categories.mts:1',
  'backend/services/lists/items.mts:1',
  'backend/services/media-delivery-safety/delivery-registry-reconciliation.mts:1',
  'backend/services/notifications/create-critical-moderation-alert-notification.mts:1',
  'backend/services/notifications/create-moderation-report-reviewed-notification.mts:1',
  'backend/services/notifications/reconcile-post-writes.mts:1',
  'backend/services/notifications/reconcile-post.mts:1',
  'backend/services/notifications/reconcile-rss-feed-item-writes.mts:1',
  'backend/services/notifications/reconcile-rss-feed-item.mts:1',
  'backend/services/oauth-authorization-server/retention-tokens.mts:2',
  'backend/services/oauth-authorization-server/retention.mts:1',
  'backend/services/stripe/membership-provider-facts/context.mts:1',
  'backend/services/vote-integrity/create-flag.mts:3',
] as const

export function scopedOrderingPaths(paths: readonly string[], options: RuleOptions): string[] {
  return paths.filter(
    path =>
      options.include.some(pattern => matchesGlob(path, pattern)) &&
      !options.exclude.some(pattern => matchesGlob(path, pattern)),
  )
}

export function directiveInventory(
  paths: readonly string[],
  readSource: (path: string) => string,
): string[] {
  return paths
    .flatMap(path => {
      const count = readSource(path).match(/deadlock-safe/gu)?.length ?? 0
      return count === 0 ? [] : [`${path}:${count}`]
    })
    .toSorted()
}

export function uncoveredOrderingPaths(
  backendPaths: readonly string[],
  plainLocks: RuleOptions,
  catalogLocks: RuleOptions,
): string[] {
  const plainPaths = scopedOrderingPaths(backendPaths, plainLocks)
  const catalogPaths = new Set(scopedOrderingPaths(backendPaths, catalogLocks))
  return backendPaths.filter(
    path =>
      /\.m?ts$/u.test(path) &&
      !plainLocks.exclude.some(pattern => matchesGlob(path, pattern)) &&
      !catalogPaths.has(path) &&
      !plainPaths.includes(path),
  )
}
