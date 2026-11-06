import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { trackedFiles } from './tracked-files.mts'
import { workflowCachePnpmViolations } from './workflow-cache-pnpm-policy.mts'

/** Read committed workflow and action sources once in the required static job. */
export function checkWorkflowCachePnpmPolicy(root: string): string[] {
  const paths = trackedFiles(root, ['.github/workflows', '.github/actions']).filter(
    path =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) ||
      /^\.github\/actions\/[^/]+\/action\.ya?ml$/.test(path),
  )
  return workflowCachePnpmViolations(
    new Map(paths.map(path => [path, readFileSync(join(root, path), 'utf8')])),
  )
}

if (import.meta.main) {
  const violations = checkWorkflowCachePnpmPolicy(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
