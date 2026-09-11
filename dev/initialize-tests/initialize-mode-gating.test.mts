import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { runInitializeHelper, makeWorktreeDir } from '../test-helpers/initialize.mts'

const initializePath = fileURLToPath(new URL('../initialize', import.meta.url))

const MODES = ['monorepo', 'backend', 'web'] as const

// Functions that must run only for the strictly-web rung, never for a bare
// `mode_at_least "$MODE" backend` match. Each is expected to appear as a call
// site exactly once, nested inside a `[ "$MODE" = web ]` guard — see
// dev/reference-initialization-modes.md's ladder description.
const WEB_ONLY_CALLS = [
  'clear_dev_caches',
  'validate_s3_credentials',
  'configure_turnstile_keys',
  'configure_web_push_keys',
  'configure_cf_worker_secret',
  'write_worker_env',
  'write_web_env_local',
]

// Finds every line whose trimmed content matches `functionName ...` (a call),
// excluding its `functionName() {` definition line.
function findCallLines(lines: string[], functionName: string): number[] {
  const callPattern = new RegExp(`^\\s*${functionName}\\b`)
  const definitionPattern = new RegExp(`^${functionName}\\(\\)\\s*\\{`)
  const result: number[] = []
  lines.forEach((line, index) => {
    if (callPattern.test(line) && !definitionPattern.test(line)) result.push(index)
  })
  return result
}

// Pairs each `if [ "$MODE" = web ]; then` with its closing `fi`/`else`/`elif`
// by matching indentation — the same convention dev/initialize's own
// consistent 4-space-per-level formatting relies on for readability. Returns
// the set of (0-indexed) line numbers strictly between open and close.
function findWebOnlyGuardedLines(lines: string[]): Set<number> {
  const guarded = new Set<number>()
  const openPattern = /^(\s*)if \[ "\$MODE" = web \]; then\s*$/
  lines.forEach((line, openIndex) => {
    const match = openPattern.exec(line)
    if (!match) return
    const indent = match[1]
    const closePattern = new RegExp(`^${indent}(fi|else|elif)\\b`)
    for (let i = openIndex + 1; i < lines.length; i++) {
      if (closePattern.test(lines[i] as string)) {
        for (let inner = openIndex + 1; inner < i; inner++) guarded.add(inner)
        return
      }
    }
    throw new Error(`no matching close found for web-mode guard opened at line ${openIndex + 1}`)
  })
  return guarded
}

describe('dev/initialize mode gating', () => {
  describe('initialization_mode_rank', () => {
    it.each([
      ['monorepo', '1'],
      ['backend', '2'],
      ['web', '3'],
      ['', '0'],
      ['garbage', '0'],
    ])('ranks %s as %s', async (mode, expected) => {
      const output = await runInitializeHelper({
        cwd: await makeWorktreeDir('feature-rank'),
        script: `initialization_mode_rank '${mode}'`,
      })

      expect(output).toBe(expected)
    })
  })

  describe('mode_at_least', () => {
    it.each(
      MODES.flatMap(mode =>
        MODES.map((floor): [string, string, boolean] => {
          const rank = { monorepo: 1, backend: 2, web: 3 }
          return [mode, floor, rank[mode] >= rank[floor]]
        }),
      ),
    )('mode_at_least(%s, %s) is %s', async (mode, floor, expected) => {
      const cwd = await makeWorktreeDir('feature-mode-at-least')
      const output = await runInitializeHelper({
        cwd,
        script: `if mode_at_least '${mode}' '${floor}'; then printf true; else printf false; fi`,
      })

      expect(output).toBe(String(expected))
    })
  })

  describe('web-only gating', () => {
    it.each(WEB_ONLY_CALLS)(
      '%s has exactly one call site, guarded by [ "$MODE" = web ]',
      async functionName => {
        const source = await readFile(initializePath, 'utf8')
        const lines = source.split('\n')
        const webOnlyGuarded = findWebOnlyGuardedLines(lines)

        const callLines = findCallLines(lines, functionName)
        expect(callLines).toHaveLength(1)
        // Must sit inside a [ "$MODE" = web ] guard, not a bare
        // mode_at_least "$MODE" backend block.
        expect(webOnlyGuarded.has(callLines[0] as number)).toBe(true)
      },
    )

    it('validates S3 credentials before ensuring the Valkey container exists', async () => {
      const lines = (await readFile(initializePath, 'utf8')).split('\n')
      const [s3Line] = findCallLines(lines, 'validate_s3_credentials')
      const [valkeyLine] = findCallLines(lines, 'ensure_valkey_container')

      expect(s3Line).toBeLessThan(valkeyLine as number)
    })
  })
})
