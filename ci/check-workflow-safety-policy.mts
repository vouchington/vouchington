import { trackedFiles } from './tracked-files.mts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import {
  privilegedWorkflowViolations,
  workflowCallSecretViolations,
  workflowSafetyViolations,
  type SafetyWorkflow,
} from './workflow-safety-policy.mts'

/** Read the committed workflow tree once in required static CI; tests supply finite documents. */
export function checkWorkflowSafetyPolicy(root: string): string[] {
  const paths = trackedFiles(root, ['.github/workflows'])
    .filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))
    .toSorted()
  if (paths.length === 0) return ['No workflows found for workflow safety policy']
  const workflows: Record<string, SafetyWorkflow> = {}
  const violations: string[] = []
  for (const path of paths) {
    const source = readFileSync(join(root, path), 'utf8')
    const workflow = parse(source) as SafetyWorkflow
    workflows[path] = workflow
    violations.push(...workflowSafetyViolations(path, source, workflow))
  }
  return [
    ...violations,
    ...workflowCallSecretViolations(
      workflows as Parameters<typeof workflowCallSecretViolations>[0],
    ),
    ...privilegedWorkflowViolations(workflows),
  ]
}

if (import.meta.main) {
  const violations = checkWorkflowSafetyPolicy(process.argv[2] ?? process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
