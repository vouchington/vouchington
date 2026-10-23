import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'

import { trackedFiles } from './tracked-files.mts'
import { areaGateViolations } from './transient-retry/area-gate-policy.mts'
import {
  externalActionPrefixes,
  markerExpectations,
  markerHeaderViolations,
  stepHeaderGroups,
  uncoveredMarkers,
} from './transient-retry/step-group-marker-policy.mts'
import { unregisteredRules } from './transient-retry/rule-registry-policy.mts'
import { rules } from './transient-retry/rules.mts'

/** Live repository inventory belongs to the dedicated static job, never a unit-test root. */
export async function checkTransientRetryPolicy(root: string): Promise<string[]> {
  const paths = trackedFiles(root, [
    '.github/workflows',
    '.github/actions',
    'ci/no-mistakes-workflows',
    'ci/transient-retry',
  ])
  const read = (path: string) => readFileSync(join(root, path), 'utf8')
  const workflowPaths = paths.filter(
    path => posix.dirname(path) === '.github/workflows' && path.endsWith('.yml'),
  )
  const errors = areaGateViolations(workflowPaths.map(read))
  for (const { marker, path, jobs } of markerExpectations) {
    errors.push(
      ...markerHeaderViolations(marker, stepHeaderGroups(read(path)), jobs).map(
        error => `${path}: ${error}`,
      ),
    )
  }
  const yaml = paths.flatMap(path =>
    /\.ya?ml$/.test(path) &&
    ['.github/workflows/', '.github/actions/', 'ci/no-mistakes-workflows/'].some(root =>
      path.startsWith(root),
    )
      ? [read(path)]
      : [],
  )
  const sources = paths.filter(
    path =>
      posix.dirname(path) === 'ci/transient-retry' &&
      path.endsWith('.mts') &&
      !path.endsWith('.test.mts'),
  )
  errors.push(
    ...uncoveredMarkers(
      new Map(sources.map(path => [path, read(path)])),
      externalActionPrefixes(yaml),
    ),
  )
  const modules = await Promise.all(
    sources.flatMap(path =>
      path.endsWith('-rules.mts')
        ? [import(pathToFileURL(join(root, path)).href) as Promise<Record<string, unknown>>]
        : [],
    ),
  )
  errors.push(...unregisteredRules(modules, rules))
  return errors
}
if (import.meta.main) {
  const errors = await checkTransientRetryPolicy(process.cwd())
  for (const error of errors) console.error(error)
  if (errors.length > 0) process.exitCode = 1
}
