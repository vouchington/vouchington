import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export const HUSKY_HOOKS_PATH = '.husky/_'

export type HuskyDecision = { run: true } | { run: false; message: string }

export function decideHuskyRun(input: {
  gitDir: string | null
  commonDir: string | null
  hooksPath: string | null
}): HuskyDecision {
  const { gitDir, commonDir, hooksPath } = input
  if (!gitDir || !commonDir || resolve(gitDir) === resolve(commonDir)) return { run: true }
  if (hooksPath === HUSKY_HOOKS_PATH) {
    return {
      run: false,
      message: `prepare: skipping husky (linked worktree; shared core.hooksPath is already ${HUSKY_HOOKS_PATH})`,
    }
  }
  return {
    run: false,
    message: `prepare: skipping husky (linked worktree; shared core.hooksPath is ${hooksPath ?? 'unset'}, expected ${HUSKY_HOOKS_PATH}). Install hooks from the primary checkout.`,
  }
}

function git(args: string[]): string | null {
  try {
    const out = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.trim() || null
  } catch {
    return null
  }
}

export function readHuskyDecision(): HuskyDecision {
  return decideHuskyRun({
    gitDir: git(['rev-parse', '--path-format=absolute', '--git-dir']),
    commonDir: git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
    hooksPath: git(['config', '--get', 'core.hooksPath']),
  })
}
