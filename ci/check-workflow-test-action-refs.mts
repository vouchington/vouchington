import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  workflowTestActionRefViolations,
  type WorkflowTestFile,
} from './workflow-test-action-refs-policy.mts'

export function checkWorkflowTestActionRefs(repositoryRoot: string): string[] {
  const entries = [
    ...readdirSync(join(repositoryRoot, '.github/actions'), {
      withFileTypes: true,
      recursive: true,
    }),
    ...readdirSync(join(repositoryRoot, '.github/workflows'), {
      withFileTypes: true,
      recursive: true,
    }),
  ]
  const files: WorkflowTestFile[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.test.mts')) continue
    const filePath = join(entry.parentPath, entry.name)
    files.push({ path: relative(repositoryRoot, filePath), text: readFileSync(filePath, 'utf8') })
  }
  return workflowTestActionRefViolations(files)
}

if (import.meta.main) {
  const violations = checkWorkflowTestActionRefs(process.cwd())
  if (violations.length > 0) {
    process.stderr.write(`${violations.join('\n')}\n`)
    process.exitCode = 1
  }
}
