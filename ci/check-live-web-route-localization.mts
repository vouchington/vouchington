import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { LocalizationCatalog } from '@vouchington/localization'
import {
  compileLocalizationSqlite,
  loadCatalogDirectory,
  openLocalizationDatabase,
} from '@vouchington/localization-compiler'
import { ROUTE_SELECTORS, WEB_CHROME_SELECTOR } from '../web/lib/i18n/route-selectors.generated.mts'
import {
  verifyRouteBounds,
  type RouteBoundsEntry,
} from '../static-code-analysis/i18n-extract/route-bounds.mts'
import { verifyRequiredRouteCopy } from '../static-code-analysis/i18n-extract/route-required-copy.mts'

export async function runRouteLocalizationCheck(input: {
  catalog: LocalizationCatalog
  routes: readonly RouteBoundsEntry[]
  chromeSelector: string
  staffActionAliases: readonly string[]
  expectedRouteCount: number
}) {
  assert.ok(Number.isSafeInteger(input.expectedRouteCount) && input.expectedRouteCount > 0)
  assert.equal(input.routes.length, input.expectedRouteCount)
  assert.equal(new Set(input.routes.map(route => route.selectorId)).size, input.expectedRouteCount)
  const scratch = await mkdtemp(join(tmpdir(), 'vouchington-web-route-bounds-'))
  let database: ReturnType<typeof openLocalizationDatabase> | undefined
  try {
    const sqlitePath = join(scratch, 'catalog.sqlite')
    compileLocalizationSqlite(input.catalog, sqlitePath)
    database = openLocalizationDatabase(sqlitePath)
    const report = verifyRouteBounds(database, input.routes, input.chromeSelector)
    const requiredCopyVerdicts = verifyRequiredRouteCopy(
      database,
      input.routes,
      input.chromeSelector,
      input.staffActionAliases,
    )
    return {
      verdicts: [
        'resolves every generated route and locale through the real SQLite catalog',
        ...requiredCopyVerdicts,
      ],
      routeCount: input.routes.length,
      localeCount: 4,
      maximumMessages: Math.max(...report.counts),
    }
  } finally {
    try {
      database?.close()
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }
}

export async function runRouteLocalizationCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      catalog: { type: 'string' },
      selectors: { type: 'string' },
      labels: { type: 'string' },
      'expected-routes': { type: 'string', default: '418' },
    },
    strict: true,
    allowPositionals: false,
  })
  const root = join(import.meta.dirname, '..')
  const { catalog } = await loadCatalogDirectory(
    resolve(values.catalog ?? join(root, 'localization/catalog')),
  )
  let routes: readonly RouteBoundsEntry[] = ROUTE_SELECTORS
  let chromeSelector = WEB_CHROME_SELECTOR
  if (values.selectors) {
    const input: unknown = JSON.parse(await readFile(resolve(values.selectors), 'utf8'))
    assert.ok(input && typeof input === 'object' && 'routes' in input && 'chromeSelector' in input)
    assert.ok(Array.isArray(input.routes) && typeof input.chromeSelector === 'string')
    for (const row of input.routes)
      assert.ok(
        row &&
          typeof row === 'object' &&
          typeof row.pattern === 'string' &&
          typeof row.selectorId === 'string' &&
          typeof row.hasMembership === 'boolean',
      )
    routes = input.routes
    chromeSelector = input.chromeSelector
  }
  const labels = await readFile(
    resolve(
      values.labels ?? join(root, 'web/components/moderation/moderation-transparency-labels.ts'),
    ),
    'utf8',
  )
  const staffActionAliases = [...labels.matchAll(/'(moderation\.staffActions\.\w+)'/g)].flatMap(
    match => match[1] ?? [],
  )
  const result = await runRouteLocalizationCheck({
    catalog,
    routes,
    chromeSelector,
    staffActionAliases,
    expectedRouteCount: Number(values['expected-routes']),
  })
  return result
}

if (import.meta.main)
  console.log(JSON.stringify(await runRouteLocalizationCommand(process.argv.slice(2))))
