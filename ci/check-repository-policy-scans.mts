import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'

import { checkTransientRetryPolicy } from './check-transient-retry-policy.mts'
import { checkAgentWorkflowDocs } from './check-agent-workflow-doc-policy.mts'
import { checkKnipDependencyPolicy } from './check-knip-dependency-policy.mts'
import { checkPostgresOrderingPolicy } from './check-postgres-ordering-policy.mts'
import { checkReactHookSuppressions } from './check-react-hook-suppressions.mts'
import { trackedFiles } from './tracked-files.mts'

const TOOLING_TRIGGER_ONLY_GLOB = '**/package.json'

function manifestGlob(workspacePattern: string): string {
  return `${workspacePattern.replace(/\/$/, '')}/package.json`
}

function isManifestPath(entry: string): boolean {
  return entry === 'package.json' || entry.endsWith('/package.json')
}

function allCiPathFilterEntries(filters: Record<string, string[]>): string[] {
  return Object.entries(filters).flatMap(([name, globs]) =>
    name === 'tooling' ? globs.filter(glob => glob !== TOOLING_TRIGGER_ONLY_GLOB) : globs,
  )
}

function flattenBraceGlobs(globs: string[]): Set<string> {
  const flattened = new Set<string>()
  for (const glob of globs) {
    const match = /^\{(.*)\}$/.exec(glob)
    for (const member of match ? match[1].split(',') : [glob]) flattened.add(member)
  }
  return flattened
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every(value => right.has(value))
}

function expandBraceAlternatives(pattern: string): string[] {
  const match = /\{([^{}]*)\}/.exec(pattern)
  if (!match) return [pattern]
  const [whole, alternatives] = match
  return alternatives
    .split(',')
    .flatMap(alternative => expandBraceAlternatives(pattern.replace(whole, alternative)))
}

/** Validate the checked-in package registries against the current tracked manifests. */
function checkWorkspacePackageRegistryCoverage(root: string): string[] {
  const trackedManifests = trackedFiles(root).filter(
    file => file === 'package.json' || file.endsWith('/package.json'),
  )
  const syncpack = JSON.parse(readFileSync(join(root, '.syncpackrc.json'), 'utf8')) as {
    source?: string[]
  }
  const workspacePackages =
    (
      parseYaml(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
        packages?: string[]
      }
    ).packages ?? []
  const allFilters = parseYaml(
    readFileSync(join(root, '.github/ci-path-filters.yml'), 'utf8'),
  ) as Record<string, string[]>
  const ciPathFilters = Object.fromEntries(
    Object.entries(allFilters).filter(([name]) => !name.startsWith('runtime-')),
  ) as Record<string, string[]>
  const runtimePathFilters = Object.fromEntries(
    Object.entries(allFilters).flatMap(([name, globs]) =>
      name.startsWith('runtime-') ? [[name.slice('runtime-'.length), globs]] : [],
    ),
  ) as Record<string, string[]>

  const sourceGlobs = syncpack.source ?? []
  const primaryEntries = allCiPathFilterEntries(ciPathFilters)
  const violations: string[] = []
  const record = (name: string, paths: string[]) => {
    if (paths.length > 0) violations.push(`${name}: ${paths.join(', ')}`)
  }

  if (sourceGlobs.length === 0) violations.push('.syncpackrc.json source must not be empty')
  record(
    'tracked package manifests missing from .syncpackrc.json source',
    trackedManifests.filter(manifest => !picomatch.isMatch(manifest, sourceGlobs)),
  )
  const staleFixedSourceEntries: string[] = []
  const unmatchedWildcardSourceEntries: string[] = []
  for (const entry of sourceGlobs) {
    if (entry.includes('*')) {
      if (!trackedManifests.some(manifest => picomatch.isMatch(manifest, entry))) {
        unmatchedWildcardSourceEntries.push(entry)
      }
      continue
    }
    for (const manifest of expandBraceAlternatives(entry)) {
      if (!trackedManifests.includes(manifest)) staleFixedSourceEntries.push(manifest)
    }
  }
  record('stale fixed .syncpackrc.json source entries', staleFixedSourceEntries)
  record('unmatched wildcard .syncpackrc.json source entries', unmatchedWildcardSourceEntries)
  record(
    'tracked package manifests missing from a real CI path-filter group',
    trackedManifests.filter(manifest => !picomatch.isMatch(manifest, primaryEntries)),
  )
  const staleFixedCiEntries: string[] = []
  const unmatchedWildcardCiEntries: string[] = []
  for (const entry of primaryEntries) {
    if (entry.includes('*')) {
      if (
        isManifestPath(entry) &&
        !trackedManifests.some(manifest => picomatch.isMatch(manifest, entry))
      ) {
        unmatchedWildcardCiEntries.push(entry)
      }
      continue
    }
    for (const manifest of expandBraceAlternatives(entry)) {
      if (isManifestPath(manifest) && !trackedManifests.includes(manifest)) {
        staleFixedCiEntries.push(manifest)
      }
    }
  }
  record('stale fixed CI path-filter manifest entries', staleFixedCiEntries)
  record('unmatched wildcard CI path-filter manifest entries', unmatchedWildcardCiEntries)
  record(
    'unmatched pnpm-workspace.yaml package globs',
    workspacePackages.filter(
      pattern =>
        !trackedManifests.some(manifest => picomatch.isMatch(manifest, manifestGlob(pattern))),
    ),
  )
  record(
    'negated pnpm-workspace.yaml package globs need complete-set semantics',
    workspacePackages.filter(pattern => pattern.startsWith('!')),
  )
  const manifestsMissingFromWorkspace: string[] = []
  for (const manifest of trackedManifests) {
    if (
      manifest !== 'package.json' &&
      !workspacePackages.some(pattern => picomatch.isMatch(manifest, manifestGlob(pattern)))
    ) {
      manifestsMissingFromWorkspace.push(manifest)
    }
  }
  record(
    'non-root tracked package manifests missing from pnpm-workspace.yaml',
    manifestsMissingFromWorkspace,
  )

  for (const [name, runtimeGlobs] of Object.entries(runtimePathFilters)) {
    const primaryGlobs = ciPathFilters[name]
    if (!Array.isArray(primaryGlobs)) {
      violations.push(`runtime-${name} has no primary CI path-filter group`)
    }
    const positiveRuntimeGlobs = flattenBraceGlobs(
      runtimeGlobs.filter(glob => !glob.startsWith('!')),
    )
    if (!sameSet(positiveRuntimeGlobs, flattenBraceGlobs(primaryGlobs ?? []))) {
      violations.push(`runtime-${name} positive path filters differ from its primary group`)
    }
  }

  const toolingGlobs = ciPathFilters.tooling ?? []
  const workspaceGlobsUnreachableFromTooling = workspacePackages.filter(
    pattern => pattern.includes('*') && !picomatch.isMatch(manifestGlob(pattern), toolingGlobs),
  )
  record(
    'wildcard pnpm workspace globs unreachable from tooling CI',
    workspaceGlobsUnreachableFromTooling,
  )
  record(
    'tracked package manifests unreachable from tooling CI',
    trackedManifests.filter(manifest => !picomatch.isMatch(manifest, toolingGlobs)),
  )

  return violations
}

/** Run live repository policies once in the dedicated static CI job. */
export async function checkRepositoryPolicyScans(root: string): Promise<void> {
  checkKnipDependencyPolicy(root)
  checkPostgresOrderingPolicy(root)

  const violations = [
    ...checkWorkspacePackageRegistryCoverage(root),
    ...(await checkTransientRetryPolicy(root)),
    ...checkAgentWorkflowDocs(root),
    ...checkReactHookSuppressions(root),
  ]
  if (violations.length > 0) {
    throw new Error(violations.join('\n'))
  }
}

if (import.meta.main) await checkRepositoryPolicyScans(process.cwd())
