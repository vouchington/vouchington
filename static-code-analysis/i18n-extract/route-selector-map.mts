import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeCatalogTable } from '@vouchington/localization'
import { loadCatalogDirectory } from '@vouchington/localization-compiler'
import { analyzeProject, type Relationship } from 'no-mistakes'
import { format, type FormatConfig } from 'oxfmt'
import { withI18nAnalysisBudget, type AnalysisBudgetOptions } from './analysis-budget.mts'
import {
  dependencyPaths,
  dependencyResult,
  dynamicImportClosure,
} from './dynamic-import-closure.mts'
import { globalChromeFiles } from './global-chrome-files.mts'
import {
  assembleRouteAliasMap,
  type RouteAliasMap,
  type RouteAliasSource,
} from './route-alias-map-assembly.mts'
import { renderSource } from './route-selector-output.mts'
import { discoverRoutes } from './route-tree.mts'
import { aliasesFromDependencyResult } from './route-usage.mts'
const ROOT = path.join(import.meta.dirname, '../..')
const APP_ROOT = 'web/app'
const GENERATED = path.join(ROOT, 'web/lib/i18n/route-selectors.generated.mts')
const ROUTES = path.join(ROOT, 'localization/catalog/routes.json')
const FORMAT = JSON.parse(readFileSync(path.join(ROOT, '.oxfmtrc.json'), 'utf8')) as FormatConfig
const NAVBAR = 'web/components/navbar.tsx'

const DEPENDENCY_RELATIONSHIPS: Relationship[] = [
  'import',
  'import-static',
  'import-dynamic',
  'import-type',
  'workspace',
] as const

export {
  assembleRouteAliasMap,
  type RouteAliasEntry,
  type RouteAliasMap,
  type RouteAliasSource,
} from './route-alias-map-assembly.mts'

export async function computeRouteAliasMap(
  knownAliases: ReadonlySet<string>,
  repoRoot: string = ROOT,
  appRoot: string = APP_ROOT,
  budget: AnalysisBudgetOptions = {},
): Promise<RouteAliasMap> {
  if (budget.budgetMs !== undefined) budget.startedAt ??= performance.now()
  const [discovered, globalFiles] = await Promise.all([
    discoverRoutes(repoRoot, appRoot),
    globalChromeFiles(repoRoot, appRoot, NAVBAR),
  ])
  const analysis = await withI18nAnalysisBudget(
    'analyzeProject',
    analyzeProject({
      root: repoRoot,
      reports: discovered
        .map((route, index) => ({
          id: String(index),
          type: 'dependencies' as const,
          files: route.files,
          relationships: DEPENDENCY_RELATIONSHIPS,
        }))
        .concat(
          globalFiles.map((file, index) => ({
            id: `global:${index}`,
            type: 'dependencies' as const,
            files: [file],
            relationships: DEPENDENCY_RELATIONSHIPS,
          })),
        ),
    }),
    budget,
  )
  const reports = new Map<string, unknown>()
  for (const report of analysis.reports) {
    if (!report.id) throw new Error('Missing route dependency report id')
    reports.set(report.id, report)
  }
  const initialFiles = new Map<string, string[]>(
    discovered
      .map((route, index): [string, string[]] => [
        route.pattern,
        [
          ...route.files,
          ...dependencyPaths(dependencyResult(reports.get(String(index)), route.pattern)),
        ],
      ])
      .concat(
        globalFiles.map((file, index): [string, string[]] => [
          `global:${file}`,
          [file, ...dependencyPaths(dependencyResult(reports.get(`global:${index}`), file))],
        ]),
      ),
  )
  const dynamicFiles = await dynamicImportClosure(repoRoot, initialFiles, budget)
  const textCache = new Map<string, Promise<string>>()
  const routeAliases: RouteAliasSource[] = []
  for (const [index, route] of discovered.entries()) {
    const candidates = await aliasesFromDependencyResult(
      repoRoot,
      dynamicFiles.get(route.pattern) ?? route.files,
      dependencyResult(reports.get(String(index)), route.pattern),
      textCache,
    )
    routeAliases.push({
      pattern: route.pattern,
      aliases: candidates,
    })
  }
  const globalAliases = new Set<string>()
  for (const [index, file] of globalFiles.entries()) {
    const aliases = await aliasesFromDependencyResult(
      repoRoot,
      dynamicFiles.get(`global:${file}`) ?? [file],
      dependencyResult(reports.get(`global:${index}`), file),
      textCache,
    )
    for (const alias of aliases) globalAliases.add(alias)
  }
  return assembleRouteAliasMap(knownAliases, routeAliases, globalAliases)
}
export async function renderRouteAliasArtifacts(
  repoRoot: string = ROOT,
  appRoot: string = APP_ROOT,
  generatedPath: string = GENERATED,
): Promise<{ source: string; membership: string }> {
  const { catalog } = await loadCatalogDirectory(path.join(repoRoot, 'localization/catalog'))
  const aliases = new Set<string>()
  for (const row of catalog.aliases) if (row.consumer === 'web') aliases.add(row.alias)
  const result = await computeRouteAliasMap(aliases, repoRoot, appRoot)
  const formatted = await format(
    generatedPath,
    renderSource(result.chromeSelector, result.routes),
    FORMAT,
  )
  if (formatted.errors.length > 0)
    throw new Error(`oxfmt failed: ${formatted.errors.map(error => error.message).join(', ')}`)
  const membership = serializeCatalogTable([
    ...(result.chrome.length === 0
      ? [{ consumer: 'web', pattern: 'web.chrome' }]
      : result.chrome.map(alias => ({ consumer: 'web', pattern: 'web.chrome', alias }))),
    ...result.routes.flatMap(route =>
      route.aliases.length === 0
        ? [{ consumer: 'web', pattern: route.pattern }]
        : route.aliases.map(alias => ({ consumer: 'web', pattern: route.pattern, alias })),
    ),
  ])
  return { source: formatted.code, membership }
}
export async function writeRouteAliasArtifacts(check = false): Promise<void> {
  const rendered = await renderRouteAliasArtifacts()
  for (const [file, content] of [
    [GENERATED, rendered.source],
    [ROUTES, rendered.membership],
  ] as const) {
    if (check) {
      if (readFileSync(file, 'utf8') !== content) throw new Error(`${file} is stale; regenerate it`)
    } else writeFileSync(file, content)
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeRouteAliasArtifacts(process.argv.includes('--check'))
  console.log('Web route selectors and catalog membership are up to date.')
}
