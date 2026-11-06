import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { trackedFiles } from './tracked-files.mts'
import { vitestProjectCommandPolicyViolations } from './vitest-project-command-policy.mts'

const requiredPaths = [
  '.github/ci-path-filters.yml',
  '.github/workflows/AGENTS.md',
  '.github/workflows/main-storybook.yml',
  '.github/workflows/main-web.yml',
  '.github/workflows/storybook.yml',
  '.github/workflows/tests-portability.yml',
  'ci/run-vitest-project-group.mts',
  'docs/checklists/github-actions.md',
] as const

/** Read tracked sources and combine them with the caller's runtime project registry. */
export function checkVitestProjectCommandPolicy(
  root: string,
  toolingWorkflowProjectNames: readonly string[],
): string[] {
  const tracked = new Set(trackedFiles(root, ['.github/workflows', ...requiredPaths]))
  const paths = [
    ...[...tracked].filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path)),
    ...requiredPaths,
  ]
  const sources: Record<string, string> = {}
  for (const path of new Set(paths)) {
    if (tracked.has(path)) sources[path] = readFileSync(join(root, path), 'utf8')
  }
  return vitestProjectCommandPolicyViolations(sources, toolingWorkflowProjectNames)
}
