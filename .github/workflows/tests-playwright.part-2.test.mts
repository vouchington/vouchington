import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

// Split out of tests-playwright.test.mts to stay under the oxlint max-lines cap. Covers the
// "Run Playwright tests" step's PW_FILES decode/quoting behavior specifically.
const workflow = readFileSync('.github/workflows/tests-playwright.yml', 'utf8')
const parsedWorkflow = load(workflow) as {
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}
const runPlaywrightTestsScript = parsedWorkflow.jobs?.['playwright-tests']?.steps?.find(
  step => step.name === 'Run Playwright tests',
)?.run

// The real step script embeds unresolved `${{ matrix.shard }}`-style GHA expressions,
// which GitHub Actions substitutes before the shell ever sees the script — but which
// are not valid bash syntax on their own (bash parses `${{` as a bad substitution).
// Replacing every `${{ ... }}` token with a literal is safe for this test because it
// only exercises the PW_FILES decode/quoting logic, not the shard arithmetic itself.
function playwrightRunScript(): string {
  expect(runPlaywrightTestsScript).toBeTypeOf('string')
  return (runPlaywrightTestsScript ?? '').replaceAll(/\$\{\{[^}]*\}\}/g, '1')
}

// Stubs `pnpm` on PATH to capture the argv it would have received (NUL-delimited, so
// selected paths containing spaces or newlines round-trip exactly) instead of actually
// invoking Playwright.
function runPlaywrightPnpmArgs(env: { PW_FULL_SUITE: string; PW_FILES: string }): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'run-playwright-tests-'))
  const argsPath = join(directory, 'pnpm-args')
  const pnpmStubPath = join(directory, 'pnpm')
  writeFileSync(pnpmStubPath, `#!/usr/bin/env bash\nprintf '%s\\0' "$@" > "${argsPath}"\n`)
  chmodSync(pnpmStubPath, 0o755)
  const result = spawnSync('bash', ['-c', playwrightRunScript()], {
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${directory}:${process.env['PATH'] ?? ''}` },
  })
  const raw = existsSync(argsPath) ? readFileSync(argsPath, 'utf8') : ''
  rmSync(directory, { force: true, recursive: true })
  expect(result.status).toBe(0)
  return raw.split('\0').filter(argument => argument.length > 0)
}

describe('tests-playwright.yml PW_FILES selection', () => {
  it('runs unfiltered when full-suite, ignoring any stray PW_FILES value', () => {
    const args = runPlaywrightPnpmArgs({ PW_FULL_SUITE: 'true', PW_FILES: '' })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      '--shard=1/1',
    ])
  })

  it('runs unfiltered when PW_FILES is empty even if full-suite is false (fail-open)', () => {
    const args = runPlaywrightPnpmArgs({ PW_FULL_SUITE: 'false', PW_FILES: '' })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      '--shard=1/1',
    ])
  })

  it('passes through an explicit narrowed selection as positional args before the shard flag', () => {
    const args = runPlaywrightPnpmArgs({
      PW_FULL_SUITE: 'false',
      PW_FILES: 'playwright/tests/foo.spec.mts\nplaywright/tests/bar.spec.mts',
    })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      'playwright/tests/foo.spec.mts',
      'playwright/tests/bar.spec.mts',
      '--shard=1/1',
    ])
  })

  it('preserves selected file paths containing spaces or shell glob metacharacters', () => {
    // PW_FILES is newline-delimited (vouchington-tooling/gha-selected-files's encodeSelectedFiles);
    // a space or a glob metacharacter (*, ?, [) inside a single path must survive the
    // quoted read-loop decode unchanged, not be word-split or glob-expanded the way an
    // unquoted $PW_FILES previously was.
    const args = runPlaywrightPnpmArgs({
      PW_FULL_SUITE: 'false',
      PW_FILES:
        'playwright/tests/[id]/foo.spec.mts\nplaywright/tests/needs space/bar.spec.mts\nplaywright/tests/glob-*-star.spec.mts',
    })
    expect(args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'playwright',
      'test',
      'playwright/tests/[id]/foo.spec.mts',
      'playwright/tests/needs space/bar.spec.mts',
      'playwright/tests/glob-*-star.spec.mts',
      '--shard=1/1',
    ])
  })
})
