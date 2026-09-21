import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFakeGitEnv, installFakeGit } from 'vouchington-tooling/shared-context'
import type {
  AnalyzeProjectOptions,
  AnalyzeProjectReportRequest,
  AnalyzeProjectResult,
  DependencyResult,
  ResolveCheckBatchResult,
  WithInvocationOptions,
} from 'no-mistakes'

const noMistakes = vi.hoisted(() => ({
  analyzeProject:
    vi.fn<
      (options: WithInvocationOptions<AnalyzeProjectOptions>) => Promise<AnalyzeProjectResult>
    >(),
}))

vi.mock<typeof import('no-mistakes')>(
  import('no-mistakes'),
  () =>
    ({
      ...noMistakes,
      default: noMistakes as unknown as typeof import('no-mistakes'),
    }) as unknown as typeof import('no-mistakes'),
)

import { computeRouteAliasMap } from './route-selector-map.mts'

/** `no-mistakes` resolves the whole graph (re-exports, plus recursive/nested dynamic imports) in
 * one `analyzeProject` call, so each seed file's mocked closure already includes its dynamic-import
 * targets, transitively (e.g. registry's `import()`, login's nested `next/dynamic` chain). */
const CLOSURE_EXTRAS: Readonly<Record<string, readonly string[]>> = {
  'web/app/registry/page.tsx': ['web/lib/registry.ts', 'web/lib/labels.ts', 'web/lib/dynamic.ts'],
  'web/app/login/page.tsx': ['web/components/mfa.tsx', 'web/components/recovery.tsx'],
  'web/components/navbar.tsx': ['web/components/keyboard-shortcuts-dialog.tsx'],
}
const DEPENDENCY_RELATIONSHIPS = ['import-static', 'import-dynamic', 'import-type', 'workspace']
const GRAPH_FILES: Readonly<Record<string, string>> = {
  'web/app/layout.ts': "export const shell = t('nav.home')\n",
  'web/app/registry/page.tsx':
    "import { item } from '../../lib/registry'; void import('../../lib/dynamic'); export default function Page() { return t(item.label) }\n",
  'web/app/login/page.tsx':
    "import dynamic from 'next/dynamic'\nconst Mfa = dynamic(() => import('../../components/mfa'))\nexport default function Page() { return <Mfa /> }\n",
  'web/app/other/page.ts': "export default function Page() { return t('nav.home') }\n",
  'web/app/forbidden.tsx':
    "export default function Forbidden() { return t('extracted.app.forbidden.accessDenied') }\n",
  'web/app/unauthorized.tsx':
    "export default function Unauthorized() { return t('extracted.app.unauthorized.signInRequired') }\n",
  'web/app/not-found.tsx':
    "export default function NotFound() { return t('extracted.app.notFound.missing') }\n",
  'web/components/navbar.tsx': "void import('./keyboard-shortcuts-dialog')\n",
  'web/components/keyboard-shortcuts-dialog.tsx':
    "export const label = t('extracted.components.keyboardShortcutsDialog.viewAllShortcuts')\n",
  'web/components/mfa.tsx':
    "import dynamic from 'next/dynamic'\nconst Recovery = dynamic(() => import('./recovery'))\nexport default function Mfa() { return <Recovery /> }\n",
  'web/components/recovery.tsx':
    "export default function Recovery() { return t('extracted.login.recovery.title') }\n",
  'web/lib/registry.ts': "export * from './labels'\n",
  'web/lib/labels.ts': "export const item = { label: 'extracted.registry.item.title' }\n",
  'web/lib/dynamic.ts': "export const label = 'extracted.dynamic.item.title'\n",
}
const KNOWN_ALIASES = new Set([
  'nav.home',
  'extracted.registry.item.title',
  'extracted.dynamic.item.title',
  'extracted.login.recovery.title',
  'extracted.app.forbidden.accessDenied',
  'extracted.app.unauthorized.signInRequired',
  'extracted.app.notFound.missing',
  'extracted.components.keyboardShortcutsDialog.viewAllShortcuts',
])

function requestedFiles(report: AnalyzeProjectReportRequest): string[] {
  if (!('files' in report) || !Array.isArray(report.files)) return []
  return report.files.filter((file): file is string => typeof file === 'string')
}

function dependencyResult(paths: readonly string[]): DependencyResult {
  return {
    roots: [],
    files: paths.map(path => ({ path, depth: 1 })),
    diagnostics: [],
    tsconfig_provenance: [],
  }
}

function emptyResolveCheck(files: readonly string[]): ResolveCheckBatchResult {
  return {
    allResolve: true,
    unresolvedFiles: [],
    results: files.map(file => ({
      file,
      allResolve: true,
      imports: [],
      unresolved: [],
    })),
  }
}

function installGraphMocks(resolveCheck?: ResolveCheckBatchResult): void {
  noMistakes.analyzeProject.mockImplementation(async options => {
    const dependencyReports = new Map(
      options.reports
        .filter(report => report.type === 'dependencies')
        .map(report => [
          report.id,
          dependencyResult(requestedFiles(report).flatMap(file => CLOSURE_EXTRAS[file] ?? [])),
        ]),
    )
    return {
      reports: options.reports.map(report => ({
        id: report.id,
        type: report.type,
        result:
          report.type === 'resolveCheckDependencies'
            ? (resolveCheck ?? emptyResolveCheck([]))
            : dependencyReports.get(report.id)!,
      })),
    }
  })
}

async function withRoutes(
  files: Record<string, string>,
  test: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'route-alias-mock-'))
  const binDir = await mkdtemp(join(tmpdir(), 'route-alias-mock-bin-'))
  const originalPath = process.env.PATH
  try {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), content)
    }
    installFakeGit({
      binDir,
      repoRoot: root,
      trackedFiles: Object.keys(files),
      pathPrefix: originalPath,
    })
    await test(root)
  } finally {
    process.env.PATH = originalPath
    clearFakeGitEnv()
    await rm(root, { recursive: true, force: true })
    await rm(binDir, { recursive: true, force: true })
  }
}

function expectGraphRequests(expectedCalls = 1): void {
  expect(noMistakes.analyzeProject).toHaveBeenCalledTimes(expectedCalls)
  for (const [options] of noMistakes.analyzeProject.mock.calls) {
    const dependencyReports = options.reports.filter(report => report.type === 'dependencies')
    for (const report of dependencyReports)
      expect(report.relationships).toEqual(DEPENDENCY_RELATIONSHIPS)
    const requestedRoots = new Set(dependencyReports.flatMap(report => requestedFiles(report)))
    for (const file of [
      'web/app/registry/page.tsx',
      'web/app/login/page.tsx',
      'web/components/navbar.tsx',
    ])
      expect(requestedRoots.has(file)).toBe(true)
    expect(options.reports.filter(report => report.type === 'resolveCheckDependencies')).toEqual([
      {
        id: 'resolve-check',
        type: 'resolveCheckDependencies',
        dependencyReportIds: dependencyReports.map(report => report.id),
      },
    ])
  }
}

async function expectGraphMembership(root: string): Promise<void> {
  const result = await computeRouteAliasMap(KNOWN_ALIASES, root)
  expect(result.chrome).toEqual([
    'extracted.app.forbidden.accessDenied',
    'extracted.app.notFound.missing',
    'extracted.app.unauthorized.signInRequired',
    'extracted.components.keyboardShortcutsDialog.viewAllShortcuts',
    'nav.home',
  ])
  expect(result.routes.find(route => route.pattern === '/registry')?.aliases).toEqual([
    'extracted.dynamic.item.title',
    'extracted.registry.item.title',
  ])
  expect(result.routes.find(route => route.pattern === '/login')?.aliases).toEqual([
    'extracted.login.recovery.title',
  ])
}

describe('mocked web route graph closures', () => {
  beforeEach(() => {
    noMistakes.analyzeProject.mockReset()
    installGraphMocks()
  })

  it('follows graph-only exports and nested dynamic imports, plus Navbar chrome', async () => {
    expect.hasAssertions()
    await withRoutes({ ...GRAPH_FILES }, async root => {
      await expectGraphMembership(root)
      expectGraphRequests()
    })
  })

  it('runs two independent route maps without a shared invocation lock', async () => {
    await Promise.all([
      withRoutes({ ...GRAPH_FILES }, expectGraphMembership),
      withRoutes({ ...GRAPH_FILES }, expectGraphMembership),
    ])
    expect(noMistakes.analyzeProject).toHaveBeenCalled()
    expectGraphRequests(2)
  })

  it('fails when a quoted registry alias is not a web catalog alias', async () => {
    await withRoutes(
      {
        ...GRAPH_FILES,
        'web/lib/labels.ts': "export const item = { label: 'extracted.missing.alias' }\n",
      },
      async root => {
        await expect(computeRouteAliasMap(KNOWN_ALIASES, root)).rejects.toThrow(
          'Quoted alias literals are not web catalog aliases: extracted.missing.alias',
        )
      },
    )
  })

  it('fails when resolveCheck reports a reachable unresolved import', async () => {
    installGraphMocks({
      allResolve: false,
      unresolvedFiles: ['web/lib/dynamic.ts'],
      results: [
        {
          file: 'web/lib/dynamic.ts',
          allResolve: false,
          imports: [
            { specifier: './missing', kind: 'dynamic', status: 'unresolved', computed: false },
          ],
          unresolved: ['./missing'],
        },
      ],
    })
    await withRoutes({ ...GRAPH_FILES }, async root => {
      await expect(computeRouteAliasMap(KNOWN_ALIASES, root)).rejects.toThrow(
        'Unresolved reachable imports:\nweb/lib/dynamic.ts: ./missing (unresolved)',
      )
      expectGraphRequests()
    })
  })

  it('fails when reachable source assembles a translation key at runtime', async () => {
    await withRoutes(
      {
        ...GRAPH_FILES,
        'web/app/other/page.ts':
          'export default function Page() { return t(`extracted.foo.${id}`) }\n',
      },
      async root => {
        await expect(computeRouteAliasMap(KNOWN_ALIASES, root)).rejects.toThrow(
          'web/app/other/page.ts: unbounded translation key',
        )
      },
    )
  })

  it('fails when reachable source uses a computed dynamic import', async () => {
    await withRoutes(
      {
        ...GRAPH_FILES,
        'web/lib/dynamic.ts':
          "void import(`./${name}`)\nexport const label = 'extracted.dynamic.item.title'\n",
      },
      async root => {
        await expect(computeRouteAliasMap(KNOWN_ALIASES, root)).rejects.toThrow(
          'web/lib/dynamic.ts: computed dynamic import',
        )
      },
    )
  })

  it('fails when production web source casts as MessageKey', async () => {
    await withRoutes(
      {
        ...GRAPH_FILES,
        'web/lib/labels.ts':
          "export const item = { label: 'extracted.registry.item.title' as MessageKey }\n",
      },
      async root => {
        await expect(computeRouteAliasMap(KNOWN_ALIASES, root)).rejects.toThrow(
          'web/lib/labels.ts: production MessageKey cast',
        )
      },
    )
  })
})
