import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { trackedFiles } from './test-helpers/tracked-files.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

describe('PostgreSQL ordering guard config', () => {
  it('scopes catalog-backed rules and directives to tracked production writers', () => {
    const config = parseYaml(readRepoFile('.no-mistakes.yml')) as {
      rules: Array<{ name: string; options?: Record<string, unknown>; rule: string; scope: string }>
    }
    const expectedOptions = {
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
    const catalogOrderingRules = config.rules.filter(
      candidate =>
        candidate.options?.schemaCatalogPath === expectedOptions.schemaCatalogPath &&
        ['postgres-conflict-ordering', 'postgres-lock-ordering'].includes(candidate.rule),
    )

    expect(catalogOrderingRules).toEqual([
      {
        name: 'production PostgreSQL writers acquire conflicts in catalog order',
        rule: 'postgres-conflict-ordering',
        scope: 'repository',
        options: {
          ...expectedOptions,
          ...executorOptions,
          executorNames: ['query', 'write'],
          unanalyzableSql: 'ignore',
        },
      },
      {
        name: 'production PostgreSQL locks use catalog key prefixes',
        rule: 'postgres-lock-ordering',
        scope: 'repository',
        options: { ...expectedOptions, ...executorOptions },
      },
    ])

    const trackedBackendPaths = trackedFiles(repoRoot, ['backend'])
    expect(trackedBackendPaths).toContain(expectedOptions.schemaCatalogPath)
    const includedPaths = trackedBackendPaths.filter(
      path =>
        [...expectedOptions.include, ...expectedOptions.sqlInclude].some(pattern =>
          matchesGlob(path, pattern),
        ) && !expectedOptions.exclude.some(pattern => matchesGlob(path, pattern)),
    )
    const directiveInventory = includedPaths
      .flatMap(path => {
        const count = readRepoFile(path).match(/deadlock-safe/gu)?.length ?? 0
        return count === 0 ? [] : [`${path}:${count}`]
      })
      .toSorted()

    expect(directiveInventory).toEqual([
      'backend/data-stores/psql/config-driven/0503-00-00-youtube-rss-unreliable-status-codes.sql:1',
      'backend/services/bedrock-embeddings-batch/orchestrator/reconcile-existing.mts:1',
      'backend/services/bedrock-embeddings-batch/orchestrator/save.mts:1',
      'backend/services/bluesky-accounts/native-completion-persistence.mts:1',
      'backend/services/communities/list-items/add.mts:1',
      'backend/services/crawl-chunks/create.mts:1',
      'backend/services/identity-verification/attempts.mts:1',
      'backend/services/individuals-households/households/spending-categories.mts:1',
      'backend/services/lists/items.mts:1',
      'backend/services/notifications/create-critical-moderation-alert-notification.mts:1',
      'backend/services/notifications/create-moderation-report-reviewed-notification.mts:1',
      'backend/services/notifications/reconcile-post-writes.mts:1',
      'backend/services/notifications/reconcile-post.mts:1',
      'backend/services/notifications/reconcile-rss-feed-item-writes.mts:1',
      'backend/services/notifications/reconcile-rss-feed-item.mts:1',
      'backend/services/post-publication/prepare-alias-identities.mts:1',
      'backend/services/rss-feed-items/upsert-write-locks.mts:1',
      'backend/services/stripe/membership-provider-facts/context.mts:1',
      'backend/services/topic-recommendations/update-topic-recommendation.mts:1',
      'backend/services/vote-integrity/create-flag.mts:3',
    ])
  })

  it('keeps the no-catalog lock entry off the files the catalog entry scans', () => {
    const config = parseYaml(readRepoFile('.no-mistakes.yml')) as {
      rules: Array<{ name: string; options?: Record<string, unknown>; rule: string }>
    }
    const [plainLocks, catalogLocks] = ['multi-row FOR UPDATE locks', 'production PostgreSQL locks']
      .map(prefix =>
        config.rules.find(
          rule => rule.rule === 'postgres-lock-ordering' && rule.name.startsWith(prefix),
        ),
      )
      .map(rule => rule?.options as { include: string[]; exclude: string[] })
    // Without a catalog every IN/ANY filter reads as multi-row, so the plain entry fails closed on
    // locks the catalog entry proves single-row. It scans only what the catalog entry excludes.
    const scoped = (options: { include: string[]; exclude: string[] }) =>
      trackedFiles(repoRoot, ['backend']).filter(
        path =>
          options.include.some(pattern => matchesGlob(path, pattern)) &&
          !options.exclude.some(pattern => matchesGlob(path, pattern)),
      )
    const plainPaths = scoped(plainLocks!)
    const catalogPaths = new Set(scoped(catalogLocks!))

    expect(plainPaths.length).toBeGreaterThan(0)
    expect(plainPaths.filter(path => catalogPaths.has(path))).toEqual([])
  })
})
