import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

import { makeTestTempDirSync } from '../codex-hooks-tests/test-temp-root.mts'

function isolatedGitEnv(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          key !== 'GIT_DIR' &&
          key !== 'GIT_WORK_TREE' &&
          key !== 'GIT_INDEX_FILE' &&
          key !== 'GIT_PREFIX',
      ),
    ),
    GIT_AUTHOR_NAME: 'Codex Hooks Test',
    GIT_AUTHOR_EMAIL: 'codex-hooks-test@example.test',
    GIT_COMMITTER_NAME: 'Codex Hooks Test',
    GIT_COMMITTER_EMAIL: 'codex-hooks-test@example.test',
  }
}

export function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: isolatedGitEnv() }).trim()
}

export function commitOn(dir: string, parent: string, message: string): string {
  return git(dir, ['commit-tree', `${parent}^{tree}`, '-p', parent, '-m', message])
}

type Repo = { dir: string; base: string }

/** A throwaway repository with one empty `main` commit, removed after the test. */
export function withRepo(test: (repo: Repo) => void): void {
  const dir = makeTestTempDirSync('stack-checkout-')
  try {
    git(dir, ['init', '-q', '-b', 'main'])
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'base'])
    test({ dir, base: git(dir, ['rev-parse', 'HEAD']) })
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}
