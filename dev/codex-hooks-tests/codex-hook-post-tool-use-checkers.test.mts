import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkFile } from '../codex-hooks/post-tool-use-policy.mts'
import { makeTestTempDirSync } from './test-temp-root.mts'

function write(root: string, relPath: string, content: string): string {
  const full = path.join(root, relPath)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

// ── Checker 4: non-web mock-policy warn ───────────────────────────────────

describe('non-web mock policy checker', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = makeTestTempDirSync('mock-policy-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips web/ test files', () => {
    const f = write(tmpDir, 'web/foo.test.ts', "vi.mock('@services/email', () => ({}))\n")
    const warnings = checkFile(f, tmpDir)
    expect(warnings.every(w => !JSON.stringify(w).includes('internal module'))).toBe(true)
  })

  it('skips non-test TS files', () => {
    const f = write(tmpDir, 'backend/foo.ts', "vi.mock('@services/email', () => ({}))\n")
    const warnings = checkFile(f, tmpDir)
    expect(warnings.every(w => !JSON.stringify(w).includes('internal module'))).toBe(true)
  })

  it('returns no warning for clean non-web test', () => {
    const f = write(tmpDir, 'backend/foo.test.ts', "import { describe, it } from 'vitest'\n")
    expect(checkFile(f, tmpDir)).toHaveLength(0)
  })

  it('warns when non-web test mocks @services/', () => {
    const f = write(tmpDir, 'backend/foo.test.ts', "vi.mock('@services/email', () => ({}))\n")
    const warnings = checkFile(f, tmpDir)
    expect(warnings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('internal module'),
      }),
    )
  })

  it('warns when non-web test mocks @queues/', () => {
    const f = write(tmpDir, 'backend/bar.test.mts', 'vi.mock("@queues/jobs", () => ({}))\n')
    const warnings = checkFile(f, tmpDir)
    expect(warnings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('internal module'),
      }),
    )
  })

  it('warns when non-web test mocks @data-stores/', () => {
    const f = write(tmpDir, 'backend/baz.test.mts', "vi.mock('@data-stores/db', () => ({}))\n")
    const warnings = checkFile(f, tmpDir)
    expect(warnings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('internal module'),
      }),
    )
  })
})

// ── Checker 5: new data-pw without spec ───────────────────────────────────

describe('data-pw spec checker', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = makeTestTempDirSync('data-pw-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips files outside web/app and web/components', () => {
    const f = write(tmpDir, 'web/lib/foo.tsx', '<button data-pw="save-btn">Save</button>\n')
    const warnings = checkFile(f, tmpDir)
    expect(warnings.every(w => !JSON.stringify(w).includes('data-pw='))).toBe(true)
  })

  it('returns no warning for web/app tsx without data-pw attributes', () => {
    const f = write(tmpDir, 'web/app/page.tsx', '<div>hello</div>\n')
    const warnings = checkFile(f, tmpDir)
    expect(warnings.every(w => !JSON.stringify(w).includes('data-pw='))).toBe(true)
  })

  it('warns when data-pw value has no playwright spec', () => {
    const f = write(tmpDir, 'web/app/page.tsx', '<button data-pw="unique-btn-xyz">Click</button>\n')
    const warnings = checkFile(f, tmpDir)
    expect(warnings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('unique-btn-xyz'),
      }),
    )
  })

  it('returns no warning when playwright spec covers the data-pw value', () => {
    write(tmpDir, 'playwright/tests/foo.spec.mts', 'getByTestId("covered-btn")\n')
    const f = write(
      tmpDir,
      'web/components/button.tsx',
      '<button data-pw="covered-btn">x</button>\n',
    )
    const warnings = checkFile(f, tmpDir)
    expect(warnings.every(w => !JSON.stringify(w).includes('covered-btn'))).toBe(true)
  })
})

// ── Checker 6: service package entrypoint reminder ────────────────────────

describe('service package checker', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = makeTestTempDirSync('svc-pkg-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips non-service package.json files', () => {
    const f = write(tmpDir, 'backend/modules/foo/package.json', '{"name":"foo"}\n')
    const warnings = checkFile(f, tmpDir)
    expect(warnings.every(w => !JSON.stringify(w).includes('entrypoints'))).toBe(true)
  })

  it('warns for a backend/services/<name>/package.json file', () => {
    const f = write(tmpDir, 'backend/services/my-svc/package.json', '{"name":"my-svc"}\n')
    const warnings = checkFile(f, tmpDir)
    expect(warnings).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('entrypoints') }),
    )
  })
})
