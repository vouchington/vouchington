import picomatch from 'picomatch'

import type { CiPathFilters, OpsWorkflow, WorkflowDocuments } from './workflow-ops-policy.mts'

function ciShellScriptsReferencedByWorkflow(workflow: OpsWorkflow): string[] {
  const scripts = new Set<string>()
  for (const job of Object.values(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      for (const text of [step.run, step.with?.command]) {
        if (typeof text !== 'string') continue
        for (const match of text.matchAll(/\b(?:\.\/)?(ci\/[A-Za-z0-9_.-]+\.sh)\b/gu)) {
          scripts.add(match[1]!)
        }
      }
    }
  }
  return [...scripts].toSorted()
}

function triggerPaths(workflow: OpsWorkflow, triggerName: 'pull_request' | 'push'): string[] {
  const triggers = workflow.on
  if (!triggers || typeof triggers !== 'object' || !(triggerName in triggers)) return []
  const trigger = (triggers as Record<string, unknown>)[triggerName]
  if (!trigger || typeof trigger !== 'object' || !('paths' in trigger)) return []
  const paths = (trigger as { paths?: unknown }).paths
  return Array.isArray(paths) && paths.every(path => typeof path === 'string') ? paths : []
}

function filterMatches(globs: readonly string[], path: string): boolean {
  return globs.some(glob => picomatch.isMatch(path, glob))
}

/** Enforce workflow references to CI shell scripts against path-filter ownership. */
export function workflowScriptOwnershipViolations(
  workflows: WorkflowDocuments,
  filters: CiPathFilters,
): string[] {
  const violations: string[] = []
  const paths = Object.keys(workflows)
    .filter(path => path.startsWith('.github/workflows/'))
    .toSorted()
  const references = new Map(
    paths.map(path => [path, ciShellScriptsReferencedByWorkflow(workflows[path]!)]),
  )
  const unique = [...new Set([...references.values()].flat())].toSorted()
  if (unique.length === 0) violations.push('No workflow-referenced CI shell scripts found')
  for (const filterName of ['tooling', 'shell-scripts']) {
    const globs = filters[filterName]
    if (!globs) {
      violations.push(`.github/ci-path-filters.yml is missing ${filterName} filter`)
      continue
    }
    const misses = unique.filter(path => !filterMatches(globs, path))
    if (misses.length > 0) violations.push(`${filterName} filter misses: ${misses.join(', ')}`)
  }

  for (const [path, workflow] of Object.entries(workflows)) {
    if (!path.startsWith('.github/workflows/')) continue
    const scripts = references.get(path) ?? []
    if (scripts.length === 0) continue
    for (const triggerName of ['pull_request', 'push'] as const) {
      const paths = triggerPaths(workflow, triggerName)
      if (paths.length === 0) continue
      for (const script of scripts) {
        if (!paths.includes(script))
          violations.push(`${path} ${triggerName}.paths missing ${script}`)
      }
    }
  }
  return violations
}
