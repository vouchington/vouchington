import { existsSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
export type PostToolUseWarning = { level: 'warn' | 'error'; message: string }

export type Checker = {
  matches: (filePath: string, worktreeRoot: string) => boolean
  check: (filePath: string, worktreeRoot: string) => PostToolUseWarning[]
}

const FMT_EXTS = /\.(md|json|jsonc|yml|yaml|toml)$/

export const autoFormatChecker: Checker = {
  matches: filePath => FMT_EXTS.test(filePath),
  check: (filePath, worktreeRoot) => {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(worktreeRoot, filePath)
    if (!existsSync(fullPath)) return []
    const localBin = path.join(worktreeRoot, 'node_modules', '.bin', 'oxfmt')
    const result = spawnSync(existsSync(localBin) ? localBin : 'oxfmt', [fullPath], {
      cwd: worktreeRoot,
      encoding: 'utf8',
    })
    if (result.error != null || result.status === 0) {
      return []
    }
    return [
      {
        level: 'warn' as const,
        message: `oxfmt failed on ${path.basename(filePath)}: ${(result.stderr ?? '').trim()}`,
      },
    ]
  },
}

const INTERNAL_MOCK_RE =
  /vi\.mock\(\s*['"`]((@services|@queues|@data-stores)\/|.*\.\.(\/?\.\.)*\/(services|queues|data-stores)\/)/

export const nonWebMockPolicyChecker: Checker = {
  matches: (filePath, worktreeRoot) => {
    if (/\.(test\.mts|test\.ts)$/.test(filePath)) {
      const rel = path.relative(worktreeRoot, filePath)
      return !rel.startsWith(`web${path.sep}`) && !rel.startsWith('web/')
    }
    return false
  },
  check: filePath => {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      return []
    }
    if (INTERNAL_MOCK_RE.test(content)) {
      return [
        {
          level: 'warn' as const,
          message:
            'Non-web test mocks an internal module — move the seam behind @modules/<provider> and tag it with `/* no-mistakes: integration=<provider> */` per the vitest-test-authoring skill (.agents/skills/vitest-test-authoring/SKILL.md)',
        },
      ]
    }
    return []
  },
}

const DATA_PW_RE = /data-pw="([^"]+)"/g

export const dataPwSpecChecker: Checker = {
  matches: (filePath, worktreeRoot) => {
    const rel = path.relative(worktreeRoot, filePath)
    return (
      (rel.startsWith('web/app/') || rel.startsWith('web/components/')) && filePath.endsWith('.tsx')
    )
  },
  check: (filePath, worktreeRoot) => {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      return []
    }
    const warnings: PostToolUseWarning[] = []
    const seen = new Set<string>()
    for (const match of content.matchAll(DATA_PW_RE)) {
      const value = match[1]!
      if (seen.has(value)) continue
      seen.add(value)
      const result = spawnSync('grep', ['-rlF', '--', value, 'playwright/tests'], {
        cwd: worktreeRoot,
        encoding: 'utf8',
      })
      if (!result.stdout || result.stdout.trim() === '') {
        warnings.push({
          level: 'warn',
          message: `data-pw="${value}" has no Playwright spec in playwright/tests/ — Storybook stories don't count`,
        })
      }
    }
    return warnings
  },
}

export const servicePackageChecker: Checker = {
  matches: (filePath, worktreeRoot) =>
    /^backend\/services\/[^/]+\/package\.json$/.test(path.relative(worktreeRoot, filePath)),
  check: (filePath, worktreeRoot) => {
    const rel = path.relative(worktreeRoot, filePath)
    const { status } = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: worktreeRoot })
    const msg =
      'New backend service — add to backend/entrypoints/api, worker-io, worker-cpu package.json; the runtime audit enforces this in CI.'
    return status !== 0 ? [{ level: 'warn' as const, message: msg }] : []
  },
}
