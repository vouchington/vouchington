import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkFile } from '../codex-hooks/post-tool-use-policy.mts'
import { makeTestTempDirSync } from './test-temp-root.mts'

// Real worktree root — needed so auto-format checker can find node_modules/.bin/oxfmt
const WORKTREE_ROOT = path.resolve(import.meta.dirname, '../..')

function write(root: string, relPath: string, content: string): string {
  const full = path.join(root, relPath)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

function lines(n: number): string {
  return Array.from({ length: n }, (_, i) => `const x${i} = ${i}`).join('\n')
}

// ── Checker 1: max-lines ───────────────────────────────────────────────────

describe('max-lines checker', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = makeTestTempDirSync('max-lines-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips non-JS/TS files (no max-lines warning)', () => {
    // Pass WORKTREE_ROOT so oxfmt binary is found; .md triggers auto-format, not max-lines
    const f = write(tmpDir, 'README.md', lines(250))
    const warnings = checkFile(f, WORKTREE_ROOT)
    // max-lines checker does not fire for .md
    expect(warnings.every(w => !JSON.stringify(w).includes('line cap'))).toBe(true)
  })

  it('returns no warning for a clean short source file', () => {
    const f = write(tmpDir, 'src/foo.ts', lines(100))
    expect(checkFile(f, WORKTREE_ROOT)).toHaveLength(0)
  })

  it('returns warn at 90% of 200-line cap for source file', () => {
    const f = write(tmpDir, 'src/foo.ts', lines(180))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('180/200') }),
    )
  })

  it('returns error when source file exceeds 200-line cap', () => {
    const f = write(tmpDir, 'src/foo.mts', lines(201))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('200-line cap') }),
    )
  })

  it('uses 300-line cap for test files (warn at 90%)', () => {
    const f = write(tmpDir, 'foo.test.mts', lines(270))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('270/300') }),
    )
  })

  it('returns error when test file exceeds 300-line cap', () => {
    const f = write(tmpDir, 'foo.test.ts', lines(301))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('300-line cap') }),
    )
  })

  it('uses 300-line cap for __tests__ directory files', () => {
    const f = write(tmpDir, '__tests__/bar.ts', lines(301))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('300-line cap') }),
    )
  })
})

// ── Checker 2: doc size headroom ──────────────────────────────────────────

describe('doc size checker', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = makeTestTempDirSync('doc-size-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips non-CLAUDE/AGENTS.md files (no doc-size warning)', () => {
    // README.md triggers auto-format only — no doc-size warning
    const f = write(tmpDir, 'README.md', 'a\n'.repeat(180))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings.every(w => !JSON.stringify(w).includes('exceeds cap'))).toBe(true)
  })

  it('returns no warning for a small CLAUDE.md', () => {
    const f = write(tmpDir, 'CLAUDE.md', 'hello\n')
    const warnings = checkFile(f, WORKTREE_ROOT)
    // auto-format runs silently on valid md; doc-size checker finds no issue
    expect(warnings.every(w => !JSON.stringify(w).includes('size limit'))).toBe(true)
    expect(warnings.every(w => !JSON.stringify(w).includes('exceeds cap'))).toBe(true)
  })

  it('warns at ≥90% of line cap', () => {
    const f = write(tmpDir, 'CLAUDE.md', 'line\n'.repeat(163))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('near its size limit'),
      }),
    )
  })

  it('errors when AGENTS.md exceeds line cap', () => {
    const f = write(tmpDir, 'AGENTS.md', 'line\n'.repeat(182))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('exceeds cap') }),
    )
  })

  it('warns at ≥90% of char cap', () => {
    const f = write(tmpDir, 'CLAUDE.md', 'x'.repeat(10_801))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(expect.objectContaining({ level: 'warn' }))
  })

  it('errors when CLAUDE.md exceeds char cap', () => {
    const f = write(tmpDir, 'CLAUDE.md', 'x'.repeat(12_001))
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('12000') }),
    )
  })
})

// ── Checker 3: auto-format non-TS edits ───────────────────────────────────

describe('auto-format checker', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = makeTestTempDirSync('auto-fmt-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does not run oxfmt on TS files', () => {
    // autoFormatChecker only matches .md/.json/.jsonc/.yml/.yaml/.toml
    const f = write(tmpDir, 'foo.ts', 'const x = 1\n')
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings.every(w => !JSON.stringify(w).includes('oxfmt'))).toBe(true)
  })

  it('silently succeeds on valid JSON (no oxfmt warning)', () => {
    const f = write(tmpDir, 'config.json', '{"a": 1}\n')
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings.every(w => !JSON.stringify(w).includes('oxfmt failed'))).toBe(true)
  })

  it('returns an oxfmt warning on invalid JSON syntax', () => {
    const f = write(tmpDir, 'bad.json', '{ invalid json !!!')
    const warnings = checkFile(f, WORKTREE_ROOT)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('oxfmt failed') }),
    )
  })
})
