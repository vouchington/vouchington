import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import {
  findBlockedGitReason,
  PLAIN_FORCE_PUSH_REASON,
} from './codex-hooks/policy/blocked-command-patterns.mts'
import { stripGitGlobalOptionsForPolicy } from './codex-hooks/policy/shell-commands.mts'

export type ProcessSnapshot = {
  args: (pid: number) => string | undefined
  parent: (pid: number) => number | undefined
}

const MAX_ANCESTORS = 12

/** Why this git argv is a plain force push, or null when the push may proceed. */
export function plainForcePushReason(command: string): string | null {
  const reason = findBlockedGitReason(stripGitGlobalOptionsForPolicy(command))
  return reason === PLAIN_FORCE_PUSH_REASON ? reason : null
}

/**
 * The nearest ancestor whose command is `git push`. Husky runs this file as a child of
 * `sh -e .husky/pre-push`, so the hook's own parent is the trampoline, not git.
 */
export function gitPushAncestorCommand(
  startPid: number,
  snapshot: ProcessSnapshot,
): string | undefined {
  let pid = startPid
  for (let depth = 0; depth < MAX_ANCESTORS; depth += 1) {
    const parent = snapshot.parent(pid)
    if (parent === undefined || parent <= 1) return undefined
    const args = snapshot.args(parent)
    if (args !== undefined && isGitPushCommand(args)) return args
    pid = parent
  }
  return undefined
}

function isGitPushCommand(command: string): boolean {
  return /\bgit\s+push\b/.test(stripGitGlobalOptionsForPolicy(command))
}

function readProcessField(pid: number, field: 'args=' | 'ppid='): string | undefined {
  try {
    const text = execFileSync('ps', ['-o', field, '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return text === '' ? undefined : text
  } catch {
    return undefined
  }
}

function commandToCheck(): string | undefined {
  const supplied = process.env.GIT_PUSH_COMMAND
  if (supplied !== undefined && supplied !== '') return supplied
  return gitPushAncestorCommand(process.pid, {
    args: pid => readProcessField(pid, 'args='),
    parent: pid => {
      const text = readProcessField(pid, 'ppid=')
      if (text === undefined) return undefined
      const parent = Number(text)
      return Number.isInteger(parent) ? parent : undefined
    },
  })
}

function main(): number {
  const command = commandToCheck()
  if (command === undefined) return 0
  const reason = plainForcePushReason(command)
  if (reason === null) return 0
  process.stderr.write(`${reason}\nUse --force-with-lease.\n`)
  return 1
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  process.exit(main())
}
