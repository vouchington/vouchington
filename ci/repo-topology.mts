import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { ciTopology, type WorkflowTopology } from 'no-mistakes'
import { gitEnv } from 'vouchington-tooling/shared-context'

let cached: Promise<WorkflowTopology> | undefined

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export function githubWorkflowPaths(root = repoRoot): string[] {
  return execFileSync(
    'git',
    ['-C', root, 'ls-files', '-z', '--cached', '--', '.github/workflows'],
    { encoding: 'utf8', env: gitEnv() },
  )
    .split('\0')
    .filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path))
    .toSorted()
}

/**
 * Live `ciTopology()` load for CI scripts. Memoized per process and deadline-free so it
 * queues behind -- never fails against -- a concurrent `no-mistakes check`. Vitest tests must
 * not call this; ci/no-mistakes-ci-contention.test.mts pins that.
 */
export function loadRepoTopology(): Promise<WorkflowTopology> {
  cached ??= ciTopology({
    root: repoRoot,
    workflows: githubWorkflowPaths(),
    timeout: 0,
    lockTimeout: 0,
  })
  return cached
}
