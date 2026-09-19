import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeCatalogTable } from '@vouchington/localization'
import { loadCatalogDirectory } from '@vouchington/localization-compiler'
import { format, type FormatConfig } from 'oxfmt'
import { type AnalysisBudgetOptions } from './analysis-budget.mts'
import {
  createDiagnosticsCollector,
  writeDiagnostics,
  type I18nDiagnosticsCollector,
} from './diagnostics.mts'
import { globalChromeFiles } from './global-chrome-files.mts'
import {
  assembleRouteAliasMap,
  assertCatalogAliases,
  type RouteAliasMap,
  type RouteAliasSource,
} from './route-alias-map-assembly.mts'
import {
  analyzeRouteDependencies,
  analyzeUnresolvedImports,
  initialClosureFiles,
  reportsById,
  uniqueClosureFiles,
} from './route-graph-analysis.mts'
import { renderSource } from './route-selector-output.mts'
import {
  formatClosureScanFailure,
  uniqueClosureScanIssues,
  type ClosureScanIssue,
} from './route-source-scan.mts'
import { discoverRoutes } from './route-tree.mts'
import { dependencyResult, scanDependencyResult } from './route-usage.mts'
import { assertResolvedImports } from './unresolved-imports.mts'

const ROOT = path.join(import.meta.dirname, '../..')
const APP_ROOT = 'web/app'
const GENERATED = path.join(ROOT, 'web/lib/i18n/route-selectors.generated.mts')
const ROUTES = path.join(ROOT, 'localization/catalog/routes.json')
const FORMAT = JSON.parse(readFileSync(path.join(ROOT, '.oxfmtrc.json'), 'utf8')) as FormatConfig
const NAVBAR = 'web/components/navbar.tsx'

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
  diagnostics?: I18nDiagnosticsCollector,
): Promise<RouteAliasMap> {
  if (budget.budgetMs !== undefined) budget.startedAt ??= performance.now()
  const discoverStart = performance.now()
  const [discovered, globalFiles] = await Promise.all([
    discoverRoutes(repoRoot, appRoot),
    globalChromeFiles(repoRoot, appRoot, NAVBAR),
  ])
  diagnostics?.phase('discover-routes', performance.now() - discoverStart)
  const analysisStart = performance.now()
  const analysis = await analyzeRouteDependencies(repoRoot, discovered, globalFiles, budget)
  diagnostics?.phase('analyze-project', performance.now() - analysisStart)
  const reports = reportsById(analysis)
  const initialFiles = initialClosureFiles(discovered, globalFiles, reports)
  const resolveStart = performance.now()
  assertResolvedImports(
    await analyzeUnresolvedImports(repoRoot, uniqueClosureFiles(initialFiles), budget),
  )
  diagnostics?.phase('resolve-check', performance.now() - resolveStart)
  const textCache = new Map<string, Promise<string>>()
  const quotedAliases = new Set<string>()
  const issues: ClosureScanIssue[] = []
  const routeAliases: RouteAliasSource[] = []
  for (const [index, route] of discovered.entries()) {
    diagnostics?.closureComputed()
    const scan = await scanDependencyResult(
      repoRoot,
      initialFiles.get(route.pattern) ?? route.files,
      dependencyResult(reports.get(String(index)), route.pattern),
      textCache,
    )
    for (const alias of scan.aliases) quotedAliases.add(alias)
    issues.push(...scan.issues)
    routeAliases.push({ pattern: route.pattern, aliases: scan.aliases })
  }
  const globalAliases = new Set<string>()
  for (const [index, file] of globalFiles.entries()) {
    diagnostics?.closureComputed()
    const scan = await scanDependencyResult(
      repoRoot,
      initialFiles.get(`global:${file}`) ?? [file],
      dependencyResult(reports.get(`global:${index}`), file),
      textCache,
    )
    for (const alias of scan.aliases) {
      quotedAliases.add(alias)
      globalAliases.add(alias)
    }
    issues.push(...scan.issues)
  }
  if (issues.length > 0) throw new Error(formatClosureScanFailure(uniqueClosureScanIssues(issues)))
  assertCatalogAliases(quotedAliases, knownAliases)
  return assembleRouteAliasMap(knownAliases, routeAliases, globalAliases)
}

export async function renderRouteAliasArtifacts(
  repoRoot: string = ROOT,
  appRoot: string = APP_ROOT,
  generatedPath: string = GENERATED,
  diagnostics?: I18nDiagnosticsCollector,
): Promise<{ source: string; membership: string }> {
  const { catalog } = await loadCatalogDirectory(path.join(repoRoot, 'localization/catalog'))
  const aliases = new Set<string>()
  for (const row of catalog.aliases) if (row.consumer === 'web') aliases.add(row.alias)
  const result = await computeRouteAliasMap(aliases, repoRoot, appRoot, {}, diagnostics)
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

export async function writeRouteAliasArtifacts(
  check = false,
  diagnosticsEnabled = false,
): Promise<void> {
  const diagnostics = diagnosticsEnabled ? createDiagnosticsCollector() : undefined
  const totalStart = performance.now()
  const rendered = await renderRouteAliasArtifacts(
    ROOT,
    APP_ROOT,
    GENERATED,
    diagnostics?.collector,
  )
  for (const [file, content] of [
    [GENERATED, rendered.source],
    [ROUTES, rendered.membership],
  ] as const) {
    if (check) {
      if (readFileSync(file, 'utf8') !== content) throw new Error(`${file} is stale; regenerate it`)
    } else writeFileSync(file, content)
  }
  diagnostics?.collector.phase('total', performance.now() - totalStart)
  if (diagnostics) writeDiagnostics(diagnostics.summary())
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeRouteAliasArtifacts(
    process.argv.includes('--check'),
    process.argv.includes('--diagnostics'),
  )
  console.log('Web route selectors and catalog membership are up to date.')
}
