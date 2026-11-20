import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

export type PostEditWarning = { level: 'warn'; message: string }
export type PostEditChecker = {
  matches: (filePath: string, worktreeRoot: string) => boolean
  check: (filePath: string, worktreeRoot: string) => PostEditWarning[]
}

const GIT_WORKTREE_OVERRIDE_ENV = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
])

function gitEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !GIT_WORKTREE_OVERRIDE_ENV.has(key)),
  )
}

export function gitHeadPathExists(cwd: string, relativePath: string): boolean {
  try {
    execFileSync('git', ['show', `HEAD:${relativePath}`], {
      cwd,
      env: gitEnv(),
      stdio: 'ignore',
      timeout: 5_000,
    })
    return true
  } catch {
    return false
  }
}

export function playwrightSpecsContain(cwd: string, value: string): boolean {
  const result = spawnSync('grep', ['-rlF', '--', value, 'playwright/tests'], {
    cwd,
    encoding: 'utf8',
  })
  return Boolean(result.stdout?.trim())
}

const INTERNAL_MOCK_RE =
  /vi\.mock\(\s*['"`]((@services|@queues|@data-stores)\/|.*\.\.(\/?\.\.)*\/(services|queues|data-stores)\/)/

export const nonWebMockPolicyChecker: PostEditChecker = {
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
          level: 'warn',
          message:
            'Non-web test mocks an internal module — move the seam behind @modules/<provider> and tag it with `/* no-mistakes: integration=<provider> */` per the vitest-test-authoring skill (.agents/skills/vitest-test-authoring/SKILL.md)',
        },
      ]
    }
    return []
  },
}

const DATA_PW_RE = /data-pw="([^"]+)"/g

export const dataPwSpecChecker: PostEditChecker = {
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
    const warnings: PostEditWarning[] = []
    const seen = new Set<string>()
    for (const match of content.matchAll(DATA_PW_RE)) {
      const value = match[1]!
      if (seen.has(value)) continue
      seen.add(value)
      if (!playwrightSpecsContain(worktreeRoot, value)) {
        warnings.push({
          level: 'warn',
          message: `data-pw="${value}" has no Playwright spec in playwright/tests/ — Storybook stories don't count`,
        })
      }
    }
    return warnings
  },
}

export const servicePackageChecker: PostEditChecker = {
  matches: (filePath, worktreeRoot) =>
    /^backend\/services\/[^/]+\/package\.json$/.test(path.relative(worktreeRoot, filePath)),
  check: (filePath, worktreeRoot) => {
    const rel = path.relative(worktreeRoot, filePath)
    const msg =
      'New backend service — add to backend/entrypoints/api, worker-io, worker-cpu package.json; the runtime audit enforces this in CI.'
    return gitHeadPathExists(worktreeRoot, rel) ? [] : [{ level: 'warn', message: msg }]
  },
}

export const postEditCheckers: readonly PostEditChecker[] = [
  nonWebMockPolicyChecker,
  dataPwSpecChecker,
  servicePackageChecker,
]

export function checkFile(
  filePath: string,
  worktreeRoot: string,
  checkers: readonly PostEditChecker[] = postEditCheckers,
): PostEditWarning[] {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(worktreeRoot, filePath)
  return checkers.flatMap(checker =>
    checker.matches(absolute, worktreeRoot) ? checker.check(absolute, worktreeRoot) : [],
  )
}
