import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogRevision, ensureLocalLocalizationCatalog } from './local-catalog.mts'

const directories: string[] = []
const WORKTREE_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const LOCAL_CATALOG_CLI = fileURLToPath(new URL('./local-catalog.mts', import.meta.url))

function artifactSnapshot(path: string) {
  return existsSync(path) ? readFileSync(path) : undefined
}

function runLocalCatalogCli(cwd: string) {
  return execFileSync(process.execPath, ['--experimental-strip-types', LOCAL_CATALOG_CLI], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function makeCatalogFixture() {
  const root = mkdtempSync(join(tmpdir(), 'localization-catalog-'))
  directories.push(root)
  const source = join(root, 'catalog')
  cpSync('localization/normalized-fixture', source, { recursive: true })
  return { output: join(root, 'generated', 'catalog.sqlite'), source }
}

describe('ensureLocalLocalizationCatalog', () => {
  afterEach(() =>
    directories.splice(0).forEach(directory => rmSync(directory, { force: true, recursive: true })),
  )

  it('reuses an unchanged artifact and rebuilds it after a catalog edit', async () => {
    const { output, source } = makeCatalogFixture()

    await expect(ensureLocalLocalizationCatalog({ output, source })).resolves.toBe(output)
    const firstRevision = readFileSync(`${output}.revision`, 'utf8')
    expect(existsSync(output)).toBe(true)

    const marker = Buffer.from('local-catalog-unchanged-marker')
    appendFileSync(output, marker)

    await expect(ensureLocalLocalizationCatalog({ output, source })).resolves.toBe(output)
    expect(readFileSync(`${output}.revision`, 'utf8')).toBe(firstRevision)
    expect(readFileSync(output).subarray(-marker.length)).toEqual(marker)

    const copiesPath = join(source, 'copies.json')
    writeFileSync(copiesPath, `${readFileSync(copiesPath, 'utf8')}\n`)

    await expect(ensureLocalLocalizationCatalog({ output, source })).resolves.toBe(output)
    expect(readFileSync(`${output}.revision`, 'utf8')).not.toBe(firstRevision)
    expect(readFileSync(output)).not.toContain(marker)
  })

  it('invalidates the artifact when a localization package changes', () => {
    const { source } = makeCatalogFixture()
    const manifest = join(dirname(source), 'compiler-package.json')
    writeFileSync(manifest, '{"version":"0.1.4"}')
    const previousRevision = catalogRevision(source, [manifest])

    writeFileSync(manifest, '{"version":"0.1.5"}')
    expect(catalogRevision(source, [manifest])).not.toBe(previousRevision)
  })

  it('restores an initially unset TMPDIR after compilation', async () => {
    const { output, source } = makeCatalogFixture()
    const previousTmpdir = process.env.TMPDIR
    delete process.env.TMPDIR
    try {
      await ensureLocalLocalizationCatalog({ output, source })
      expect(process.env.TMPDIR).toBeUndefined()
    } finally {
      if (previousTmpdir === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previousTmpdir
    }
  })

  it('uses the owning worktree catalog and artifact from a subdirectory', () => {
    const callerArtifact = join(WORKTREE_ROOT, 'web', '.local', 'localization', 'catalog.sqlite')
    const before = artifactSnapshot(callerArtifact)

    const rootOutput = runLocalCatalogCli(WORKTREE_ROOT)
    const subdirectoryOutput = runLocalCatalogCli(join(WORKTREE_ROOT, 'web'))

    expect(rootOutput).toBe(join(WORKTREE_ROOT, '.local', 'localization', 'catalog.sqlite'))
    expect(subdirectoryOutput).toBe(rootOutput)
    expect(artifactSnapshot(callerArtifact)).toEqual(before)
  })
})
