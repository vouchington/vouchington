import { readFileSync, readdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { importUsages, type ImportUsagesResult } from 'no-mistakes'

import { storybookBrowserOptimizeDeps } from '../test-helpers/vitest-config/storybook-browser-optimize-deps.mts'
import { permanentReleaseAgePackageNames } from './no-mistakes-config.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const requiredNestedParents = ['@ts-shared/feature-flags'] as const
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

export type ReadImportUsages = (root: string, files: string[]) => Promise<ImportUsagesResult>

export type OptimizeDepsAuditInput = {
  root: string
  include: readonly string[]
  firstPartyNames: Set<string>
  readImports: ReadImportUsages
  requiredParents?: readonly string[]
}

/** Maps an `importUsages()` result to the bare runtime specifiers Vite must pre-bundle. */
export function runtimeImportSpecifiers(result: ImportUsagesResult): string[] {
  const specifiers = result.files.flatMap(file =>
    file.imports.flatMap(usage =>
      usage.kind === 'static' || usage.kind === 'dynamic' ? [usage.specifier] : [],
    ),
  )
  return [...new Set(specifiers)].filter(
    specifier => !['.', '/', 'node:'].some(prefix => specifier.startsWith(prefix)),
  )
}

function packageDirectory(packageName: string): string {
  if (!packageName.startsWith('@') || !packageName.includes('/')) {
    throw new Error(`nested-include parent must be a scoped package: ${packageName}`)
  }
  return packageName.slice(1)
}

function packageDependencies(root: string, packageName: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(root, packageDirectory(packageName), 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> }
  return Object.keys(manifest.dependencies ?? {})
}

function productionSourceFiles(root: string, directory: string): string[] {
  const files: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const entryPath = join(path, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(entryPath)
      } else if (
        sourceExtensions.has(extname(entry.name)) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(basename(entry.name))
      ) {
        files.push(entryPath)
      }
    }
  }
  visit(directory)
  return files.toSorted()
}

function packageRoot(specifier: string): string {
  const [first, second] = specifier.split('/')
  return first.startsWith('@') && second ? `${first}/${second}` : first
}

/**
 * Lists nested `parent > child` includes whose child the parent does not declare, and runtime
 * imports of nested-include parents that Vite would discover after its first optimize pass.
 */
export async function storybookBrowserOptimizeDepsErrors({
  root,
  include,
  firstPartyNames,
  readImports,
  requiredParents = requiredNestedParents,
}: OptimizeDepsAuditInput): Promise<string[]> {
  const included = new Set(include)
  const parents = new Set(requiredParents)
  const errors: string[] = []
  for (const entry of include) {
    const nested = entry.split(' > ')
    if (nested.length !== 2) continue
    const [parent, child] = nested
    parents.add(parent)
    if (!packageDependencies(root, parent).includes(packageRoot(child))) {
      errors.push(`${entry}: ${parent} does not declare ${packageRoot(child)}`)
    }
  }
  for (const parent of [...parents].toSorted()) {
    const files = productionSourceFiles(root, packageDirectory(parent))
    if (files.length === 0) continue
    for (const specifier of runtimeImportSpecifiers(await readImports(root, files))) {
      const dependency = packageRoot(specifier)
      const firstParty = dependency.startsWith('@vouchington/') || firstPartyNames.has(dependency)
      if (firstParty && !included.has(specifier) && !included.has(`${parent} > ${specifier}`)) {
        errors.push(`${parent}: add '${parent} > ${specifier}' to storybookBrowserOptimizeDeps`)
      }
    }
  }
  return errors
}

/* v8 ignore start -- the no-mistakes CI job runs this live repository audit; fixture tests cover the core. */
if (import.meta.main) {
  const errors = await storybookBrowserOptimizeDepsErrors({
    root: repoRoot,
    include: storybookBrowserOptimizeDeps,
    firstPartyNames: permanentReleaseAgePackageNames(),
    // Deadline-free so a concurrent `no-mistakes check` queues this call instead of failing it.
    readImports: (root, files) => importUsages({ root, files, timeout: 0, lockTimeout: 0 }),
  })
  for (const error of errors) console.error(error)
  if (errors.length > 0) process.exitCode = 1
  else console.log('Storybook browser optimizeDeps cover every nested-parent runtime import.')
}
/* v8 ignore stop */
