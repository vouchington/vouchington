import { execFileSync, spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getTrackedBackendPackageManifests,
  scanTrackedBackendPackageManifests,
} from '../ast-grep-backend-manifests.mts'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const ruleFile = 'backend-knip-test-export-exclusions.yml'
const missingExclusions = '{"exports":{"./*":"./*.mts"}}'
const validManifest = '{"exports":{"./*":"./*.mts","./*.test.mts":null,"./*/__tests__/*":null}}'
const directories: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ast-grep-manifests-'))
  directories.push(root)
  execFileSync('git', ['init', '-q', root])
  return root
}

async function write(root: string, path: string, content: string, tracked = false) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
  if (tracked) execFileSync('git', ['-C', root, 'add', path])
}

async function runAggregate(root: string) {
  await write(
    root,
    'sgconfig.yml',
    'ruleDirs:\n  - ast-grep-rules\nlanguageGlobs:\n  Tsx:\n    - "**/*.mts"\n',
  )
  await mkdir(join(root, 'ast-grep-rules'))
  await copyFile(
    join(repository, 'ast-grep-rules', ruleFile),
    join(root, 'ast-grep-rules', ruleFile),
  )
  return spawnSync(process.execPath, [join(repository, 'static-code-analysis/run-ast-grep.mts')], {
    cwd: root,
    encoding: 'utf8',
  })
}

describe('tracked backend manifest AST guard', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('discovers only tracked existing backend manifests and rejects a tracked violation', async () => {
    const root = await fixture()
    await write(root, 'backend/package.json', validManifest, true)
    await write(root, 'backend/invalid/package.json', missingExclusions, true)
    await write(root, 'backend/deleted/package.json', missingExclusions, true)
    await unlink(join(root, 'backend/deleted/package.json'))
    await write(root, 'backend/untracked/package.json', missingExclusions)
    await write(root, '.gitignore', 'backend/ignored/\n', true)
    await write(root, 'backend/ignored/package.json', missingExclusions)
    await write(root, 'web/package.json', missingExclusions, true)
    expect(getTrackedBackendPackageManifests(root)).toEqual([
      'backend/invalid/package.json',
      'backend/package.json',
    ])
    expect(scanTrackedBackendPackageManifests(root)).toBe(1)
  })

  it('does not let untracked or ignored manifests fail a valid tracked scan', async () => {
    const root = await fixture()
    await write(root, 'backend/package.json', validManifest, true)
    await write(root, 'backend/untracked/package.json', missingExclusions)
    await write(root, '.gitignore', 'backend/ignored/\n', true)
    await write(root, 'backend/ignored/package.json', missingExclusions)
    expect(scanTrackedBackendPackageManifests(root)).toBe(0)
  })

  it('skips empty discovery rather than defaulting to a worktree scan', async () => {
    const root = await fixture()
    await write(root, 'backend/untracked/package.json', missingExclusions)
    await write(root, 'web/package.json', missingExclusions, true)
    expect(getTrackedBackendPackageManifests(root)).toEqual([])
    expect(scanTrackedBackendPackageManifests(root)).toBe(0)
  })

  it('runs the broad aggregate with this rule disabled before its tracked-only scan', async () => {
    const root = await fixture()
    await write(root, 'backend/untracked/package.json', missingExclusions)
    const result = await runAggregate(root)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('fails the actual aggregate for a tracked root manifest violation', async () => {
    const root = await fixture()
    await write(root, 'backend/package.json', missingExclusions, true)
    const result = await runAggregate(root)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('backend-knip-test-export-exclusions')
  })
})
