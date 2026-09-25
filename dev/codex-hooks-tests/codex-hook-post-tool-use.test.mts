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

// ── Auto-format non-TS edits ───────────────────────────────────

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
