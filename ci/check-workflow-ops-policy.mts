#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { trackedFiles } from './tracked-files.mts'
import {
  fixMainSubscriptionViolations,
  postgresWorkflowPolicyViolations,
  type CiPathFilters,
  type OpsWorkflow,
  type WorkflowDocuments,
  type WorkflowSources,
} from './workflow-ops-policy.mts'
import { prRevisionPairViolations } from './workflow-revision-policy.mts'
import { workflowScriptOwnershipViolations } from './workflow-script-ownership-policy.mts'

const workflowPathPattern = /^\.github\/workflows\/[^/]+\.ya?ml$/u
const smokePostgresScriptPath = '.github/workflows/initialize-smoke-test/prepare-postgres.sh'

/** Read tracked workflow sources once for the required static CI policy check. */
export function checkWorkflowOpsPolicy(root: string): string[] {
  const trackedWorkflowPaths = trackedFiles(root, ['.github/workflows']).toSorted()
  const paths = trackedWorkflowPaths.filter(path => workflowPathPattern.test(path))
  if (paths.length === 0) return ['No tracked workflows found for workflow ops policy']

  const sources = Object.fromEntries(
    [
      ...paths,
      ...trackedWorkflowPaths.filter(
        path =>
          path === smokePostgresScriptPath ||
          (path.startsWith('.github/workflows/ci-detect-changes/') && path.endsWith('.sh')),
      ),
    ].map(path => [path, readFileSync(join(root, path), 'utf8')]),
  ) as Record<string, string>
  const workflows = Object.fromEntries(
    paths.map(path => [path, parseYaml(sources[path]!) as OpsWorkflow]),
  ) as Record<string, OpsWorkflow>
  const filters = parseYaml(
    readFileSync(join(root, '.github/ci-path-filters.yml'), 'utf8'),
  ) as CiPathFilters

  return [
    ...fixMainSubscriptionViolations(workflows as WorkflowDocuments),
    ...postgresWorkflowPolicyViolations(sources as WorkflowSources, workflows),
    ...prRevisionPairViolations(workflows as WorkflowDocuments, sources as WorkflowSources),
    ...workflowScriptOwnershipViolations(workflows as WorkflowDocuments, filters),
  ]
}

/* v8 ignore start -- direct-execution entry; required static CI scan, not a test suite. */
if (import.meta.main) {
  try {
    const args = process.argv.slice(2)
    if (args.length > 1) throw new Error('Usage: node ci/check-workflow-ops-policy.mts [root]')
    const violations = checkWorkflowOpsPolicy(args[0] ?? process.cwd())
    if (violations.length > 0) {
      console.error(violations.join('\n'))
      process.exitCode = 1
    } else {
      console.log('Workflow ops policies passed.')
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
/* v8 ignore stop */
