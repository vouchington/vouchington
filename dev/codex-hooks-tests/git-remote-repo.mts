import { execFileSync } from 'node:child_process'

import { gitEnvForCwd } from '../codex-hooks/local-process.mts'

export function git(dir: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: dir, env: gitEnvForCwd(), stdio: 'ignore' })
}
