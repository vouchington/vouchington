import { execFileSync } from 'node:child_process'

import { gitEnvForCwd } from '../codex-hooks/policy/github-configured-base.mts'
import { withTestTempDir } from './test-temp-root.mts'

export function git(dir: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: dir, env: gitEnvForCwd(), stdio: 'ignore' })
}

/** Runs the callback in a fresh `git init` repository with these remotes and local config. */
export function withRepo<T>(
  remotes: Record<string, string>,
  callback: (dir: string) => T,
  config: Record<string, string> = {},
): Promise<T> {
  return withTestTempDir('voucha-owner-scope-', async dir => {
    git(dir, 'init', '-q')
    for (const [name, url] of Object.entries(remotes)) {
      git(dir, 'remote', 'add', name, url)
    }
    for (const [key, value] of Object.entries(config)) {
      git(dir, 'config', key, value)
    }
    return callback(dir)
  })
}
