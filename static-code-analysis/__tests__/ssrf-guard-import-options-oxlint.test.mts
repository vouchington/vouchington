import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface Fixture {
  code: string
  file: string
  isValid: boolean
}

const OXLINT = resolve('node_modules/.bin/oxlint')

const fixtures: Fixture[] = [
  {
    file: 'direct.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await validateUrl(url) }`,
  },
  {
    file: 'aliased.mts',
    isValid: false,
    code: `import { validateUrl as validate } from 'ssrf-guard/node'
async function run() { await validate(url) }`,
  },
  {
    file: 'namespace.mts',
    isValid: false,
    code: `import * as ssrfGuard from 'ssrf-guard/node'
async function run() { await ssrfGuard.validateUrl(url) }`,
  },
  {
    file: 'namespace-computed.mts',
    isValid: false,
    code: `import * as ssrfGuard from 'ssrf-guard/node'
async function run() { await ssrfGuard['validateUrl'](url) }`,
  },
  {
    file: 'wrapped.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await (validateUrl as typeof validateUrl)(url) }`,
  },
  {
    file: 'identifier-options.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
const options = { timeoutMs: 5000 }
async function run() { await validateUrl(url, options) }`,
  },
  {
    file: 'spread-options.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
const options = { timeoutMs: 5000 }
async function run() { await validateUrl(url, { ...options }) }`,
  },
  {
    file: 'empty-options.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await validateUrl(url, {}) }`,
  },
  {
    file: 'undefined-timeout.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await validateUrl(url, { timeoutMs: undefined }) }`,
  },
  {
    file: 'void-signal.mts',
    isValid: false,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await validateUrl(url, { signal: void 0 }) }`,
  },
  {
    file: 'timeout.mts',
    isValid: true,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await validateUrl(url, { timeoutMs: 5000 }) }`,
  },
  {
    file: 'signal.mts',
    isValid: true,
    code: `import * as ssrfGuard from 'ssrf-guard/node'
async function run() { await ssrfGuard.validateUrl(url, { signal }) }`,
  },
  {
    file: 'namespace-computed-timeout.mts',
    isValid: true,
    code: `import * as ssrfGuard from 'ssrf-guard/node'
async function run() { await ssrfGuard['validateUrl'](url, { timeoutMs: 5000 }) }`,
  },
  {
    file: 'wrapped-signal.mts',
    isValid: true,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await (validateUrl as typeof validateUrl)(url, { signal }) }`,
  },
  {
    file: 'computed-property.mts',
    isValid: true,
    code: `import { validateUrl as validate } from 'ssrf-guard/node'
async function run() { await validate(url, { ['timeoutMs']: 5000 }) }`,
  },
  {
    file: 'defined-signal-with-undefined-timeout.mts',
    isValid: true,
    code: `import { validateUrl } from 'ssrf-guard/node'
async function run() { await validateUrl(url, { timeoutMs: undefined, signal }) }`,
  },
  {
    file: 'shadowed.mts',
    isValid: true,
    code: `function validateUrl() { return Promise.resolve([]) }
async function run() { await validateUrl(url) }`,
  },
  {
    file: 'dependency-injection.mts',
    isValid: true,
    code: `async function run(deps: { validateUrl(url: string): Promise<unknown> }) {
  await deps.validateUrl(url)
}`,
  },
]

describe('ssrf-guard validateUrl import options', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-ssrf-guard-import-options-'))
    for (const fixture of fixtures) writeFileSync(join(root, fixture.file), fixture.code)
  })

  afterAll(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it('enforces the configured import boundary while leaving dependency injection to AST-grep', () => {
    const result = spawnSync(
      OXLINT,
      [
        '--config',
        '.oxlintrc.json',
        '--format',
        'json',
        ...fixtures.map(({ file }) => join(root, file)),
      ],
      { cwd: resolve(), encoding: 'utf8' },
    )

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const { diagnostics } = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; filename: string }>
    }
    expect(
      diagnostics
        .filter(({ code }) => code === 'no-mistakes(require-options-on-imported-call)')
        .map(({ filename }) => filename.slice(root.length + 1))
        .toSorted(),
    ).toEqual(
      fixtures
        .filter(({ isValid }) => !isValid)
        .map(({ file }) => file)
        .toSorted(),
    )
  })
})
