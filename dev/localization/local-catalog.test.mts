import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { localCatalogPaths } from './local-catalog.mts'

const directories: string[] = []
const WORKTREE_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const LOCAL_CATALOG_CLI = fileURLToPath(new URL('./local-catalog.mts', import.meta.url))

function artifactSnapshot(path: string) {
  return existsSync(path) ? readFileSync(path) : undefined
}

function runLocalCatalogCli(cwd: string, root: string, script = LOCAL_CATALOG_CLI) {
  return execFileSync(process.execPath, [script, '--worktree-root', root], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  }).trim()
}

function makeTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

function makeWorktreeFixture() {
  const root = makeTempDirectory('localization-worktree-')
  mkdirSync(join(root, 'web'))
  cpSync('localization/normalized-fixture', join(root, 'localization/catalog'), { recursive: true })
  return root
}

describe('ensureLocalLocalizationCatalog', () => {
  afterEach(() =>
    directories.splice(0).forEach(directory => rmSync(directory, { force: true, recursive: true })),
  )

  it('uses the owning worktree catalog and artifact from a subdirectory', () => {
    const root = makeWorktreeFixture()
    const callerArtifact = join(root, 'web', '.local', 'localization', 'catalog.sqlite')
    const before = artifactSnapshot(callerArtifact)

    const rootOutput = runLocalCatalogCli(root, root)
    const subdirectoryOutput = runLocalCatalogCli(join(root, 'web'), root)

    expect(rootOutput).toBe(localCatalogPaths(root).output)
    expect(localCatalogPaths().output).toBe(
      join(WORKTREE_ROOT, '.local', 'localization', 'catalog.sqlite'),
    )
    expect(subdirectoryOutput).toBe(rootOutput)
    expect(artifactSnapshot(callerArtifact)).toEqual(before)
  })

  it('still prints the catalog path when started through a symlinked directory', () => {
    // Node resolves the main module through realpath, so argv[1] keeps the symlinked spelling
    // that import.meta.url loses (macOS temp directories are such a symlink); a hand-rolled
    // argv[1] guard silently printed nothing here (#778).
    const root = makeWorktreeFixture()
    const linkRoot = makeTempDirectory('localization-catalog-link-')
    const linkedDirectory = join(linkRoot, 'linked-localization')
    symlinkSync(dirname(LOCAL_CATALOG_CLI), linkedDirectory)

    const output = runLocalCatalogCli(root, root, join(linkedDirectory, 'local-catalog.mts'))

    expect(output).toBe(localCatalogPaths(root).output)
  })
})
