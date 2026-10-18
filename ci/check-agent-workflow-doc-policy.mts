import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { agentWorkflowDocViolations } from './agent-workflow-doc-policy.mts'
import { trackedFiles } from './test-helpers/tracked-files.mts'

export function checkAgentWorkflowDocs(root: string): string[] {
  const paths = trackedFiles(root, ['*.md']).filter(path => existsSync(join(root, path)))
  return agentWorkflowDocViolations(paths, path => readFileSync(join(root, path), 'utf8'))
}

if (import.meta.main) {
  const violations = checkAgentWorkflowDocs(process.cwd())
  for (const violation of violations) console.error(violation)
  if (violations.length > 0) process.exitCode = 1
}
