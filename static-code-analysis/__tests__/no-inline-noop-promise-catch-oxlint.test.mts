import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface Fixture {
  file: string
  isValid: boolean
}

const OXLINT = resolve('node_modules/.bin/oxlint')
const REPO_OXLINT_CONFIG = resolve('.oxlintrc.json')
const NOOP_CATCH = 'task().catch(() => {})'

const fixtures: Fixture[] = [
  { file: 'backend/empty.mts', isValid: false },
  { file: 'web/empty.ts', isValid: false },
  { file: 'backend/noop.test.mts', isValid: true },
  { file: 'backend/noop.spec.mts', isValid: true },
  { file: 'backend/__tests__/noop.mts', isValid: true },
  { file: 'backend/test-helpers/noop.mts', isValid: true },
  { file: 'static-code-analysis/out-of-scope.mts', isValid: true },
]

describe('no-mistakes/no-inline-noop-promise-catch', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-no-inline-noop-promise-catch-'))
    for (const fixture of fixtures) {
      const path = join(root, fixture.file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, NOOP_CATCH)
    }
  })

  afterAll(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it('applies the repository rule only to production backend and web files', () => {
    const result = spawnSync(OXLINT, ['-c', REPO_OXLINT_CONFIG, '--format', 'json', '.'], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const { diagnostics } = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; filename: string }>
    }
    expect(
      diagnostics
        .filter(({ code }) => code === 'no-mistakes(no-inline-noop-promise-catch)')
        .map(({ filename }) => filename.replace(`${root}/`, ''))
        .toSorted(),
    ).toEqual(
      fixtures
        .filter(({ isValid }) => !isValid)
        .map(({ file }) => file)
        .toSorted(),
    )
  })
})
