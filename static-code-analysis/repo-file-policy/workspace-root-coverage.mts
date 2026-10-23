import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

export function workspaceRootCoverageErrors(
  trackedFiles: readonly string[],
  packageRoots: readonly string[],
  workspacePackages: readonly string[],
): string[] {
  const roots = new Set(packageRoots.map(root => root.replaceAll('\\', '/').replace(/^\.\//u, '')))
  const trackedRoots = new Set(
    trackedFiles.flatMap(path => (path.includes('/') ? [path.split('/')[0]!] : [])),
  )
  const prefixes = new Set(workspacePackages.map(path => path.replaceAll('\\', '/').split('/')[0]!))
  return [
    ...[...trackedRoots].flatMap(root =>
      !roots.has(root) ? [`Workspace packageRoots omits tracked directory: ${root}`] : [],
    ),
    ...[...roots].flatMap(root =>
      !trackedRoots.has(root) && !prefixes.has(root)
        ? [`Workspace packageRoots has stale directory: ${root}`]
        : [],
    ),
  ]
}

export function checkWorkspaceRootCoverage(
  root: string,
  trackedFiles: readonly string[],
): string[] {
  if (!trackedFiles.includes('.no-mistakes.yml'))
    throw new Error('Workspace coverage configuration must be tracked')
  const config = parse(readFileSync(join(root, '.no-mistakes.yml'), 'utf8')) as {
    rules?: Array<{
      rule?: string
      options?: { packageRoots?: string[]; requireNamedPackage?: boolean }
    }>
  }
  const coverage = config.rules?.find(rule => rule.rule === 'package-json-workspace-coverage')
  if (
    !Array.isArray(coverage?.options?.packageRoots) ||
    coverage.options.requireNamedPackage !== true
  )
    return ['Workspace coverage requires packageRoots and requireNamedPackage']
  if (!trackedFiles.includes('pnpm-workspace.yaml'))
    throw new Error('Workspace package configuration must be tracked')
  const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
    packages?: string[]
  }
  return workspaceRootCoverageErrors(
    trackedFiles,
    coverage.options.packageRoots,
    workspace.packages ?? [],
  )
}
