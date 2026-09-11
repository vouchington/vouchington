import { existsSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
export type PostToolUseWarning = { level: 'warn' | 'error'; message: string }

export type Checker = {
  matches: (filePath: string, worktreeRoot: string) => boolean
  check: (filePath: string, worktreeRoot: string) => PostToolUseWarning[]
}

const JS_TS_EXTS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/

function isTestFile(filePath: string): boolean {
  return (
    /\.(test|spec)\.[^.]+$/.test(filePath) ||
    /\.mock\.test\.[^.]+$/.test(filePath) ||
    filePath.includes(`__tests__${path.sep}`) ||
    filePath.includes('/__tests__/')
  )
}

export const maxLinesChecker: Checker = {
  matches: filePath => JS_TS_EXTS.test(filePath),
  check: filePath => {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      return []
    }
    const lineCount = content.split('\n').length
    const cap = isTestFile(filePath) ? 300 : 200
    const pct = lineCount / cap
    const baseName = path.basename(filePath)
    if (lineCount > cap) {
      return [
        {
          level: 'error' as const,
          message: `${baseName} exceeds the ${cap}-line cap (currently ${lineCount} lines) — split the file before committing`,
        },
      ]
    }
    if (pct >= 0.9) {
      return [
        {
          level: 'warn' as const,
          message: `${baseName} is at ${lineCount}/${cap} lines (${Math.round(pct * 100)}% of cap)`,
        },
      ]
    }
    return []
  },
}

const DOC_NAMES = new Set(['CLAUDE.md', 'AGENTS.md'])
const DOC_MAX_LINES = 180
const DOC_MAX_CHARS = 12_000

export const docSizeChecker: Checker = {
  matches: filePath => DOC_NAMES.has(path.basename(filePath)),
  check: filePath => {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      return []
    }
    const lineCount = content.split('\n').length
    const charCount = content.length
    const baseName = path.basename(filePath)
    const linePct = lineCount / DOC_MAX_LINES
    const charPct = charCount / DOC_MAX_CHARS
    if (lineCount > DOC_MAX_LINES || charCount > DOC_MAX_CHARS) {
      return [
        {
          level: 'error' as const,
          message: `${baseName} exceeds cap (lines: ${lineCount}/${DOC_MAX_LINES}, chars: ${charCount}/${DOC_MAX_CHARS})`,
        },
      ]
    }
    if (linePct >= 0.9 || charPct >= 0.9) {
      const parts: string[] = []
      if (linePct >= 0.9) parts.push(`lines ${lineCount}/${DOC_MAX_LINES}`)
      if (charPct >= 0.9) parts.push(`chars ${charCount}/${DOC_MAX_CHARS}`)
      return [
        {
          level: 'warn' as const,
          message: `${baseName} is near its size limit (${parts.join(', ')})`,
        },
      ]
    }
    return []
  },
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
