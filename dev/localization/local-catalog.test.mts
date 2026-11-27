import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

  it('rebuilds with a new revision hash when either PACKAGE_MANIFESTS file changes', () => {
    const root = makeWorktreeFixture()
    const output = localCatalogPaths(root).output
    const packagesRoot = makeTempDirectory('localization-manifests-')
    const localizationDir = join(packagesRoot, 'localization')
    const compilerDir = join(packagesRoot, 'localization-compiler')
    mkdirSync(join(localizationDir, 'dist'), { recursive: true })
    mkdirSync(join(compilerDir, 'dist'), { recursive: true })
    const localizationManifest = join(localizationDir, 'package.json')
    const compilerManifest = join(compilerDir, 'package.json')
    writeFileSync(localizationManifest, '{"name":"@vouchington/localization","version":"0.1.0"}\n')
    writeFileSync(
      compilerManifest,
      '{"name":"@vouchington/localization-compiler","version":"0.1.0"}\n',
    )
    writeFileSync(join(localizationDir, 'dist', 'index.mjs'), 'export {}\n')
    writeFileSync(
      join(compilerDir, 'dist', 'index.mjs'),
      `export * from ${JSON.stringify(import.meta.resolve('@vouchington/localization-compiler'))}\n`,
    )

    const overrides = {
      '@vouchington/localization': pathToFileURL(join(localizationDir, 'dist', 'index.mjs')).href,
      '@vouchington/localization-compiler': pathToFileURL(join(compilerDir, 'dist', 'index.mjs'))
        .href,
    }
    const hookSource = [
      "import { registerHooks } from 'node:module'",
      `const overrides = ${JSON.stringify(overrides)}`,
      'registerHooks({',
      '  resolve(specifier, context, nextResolve) {',
      "    if (context.parentURL?.endsWith('/local-catalog.mts') && specifier in overrides) {",
      '      return { url: overrides[specifier], shortCircuit: true }',
      '    }',
      '    return nextResolve(specifier, context)',
      '  },',
      '})',
    ].join('\n')
    const hookUrl = `data:text/javascript,${encodeURIComponent(hookSource)}`
    const runWithOverrides = () =>
      execFileSync(
        process.execPath,
        ['--import', hookUrl, LOCAL_CATALOG_CLI, '--worktree-root', root],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 },
      ).trim()

    expect(runWithOverrides()).toBe(output)
    const firstRevision = readFileSync(`${output}.revision`, 'utf8')
    const marker = Buffer.from('local-catalog-unchanged-marker')
    appendFileSync(output, marker)

    expect(runWithOverrides()).toBe(output)
    expect(readFileSync(`${output}.revision`, 'utf8')).toBe(firstRevision)
    expect(readFileSync(output).subarray(-marker.length)).toEqual(marker)

    writeFileSync(localizationManifest, '{"name":"@vouchington/localization","version":"0.1.1"}\n')
    expect(runWithOverrides()).toBe(output)
    const secondRevision = readFileSync(`${output}.revision`, 'utf8')
    expect(secondRevision).not.toBe(firstRevision)
    expect(readFileSync(output)).not.toContain(marker)

    appendFileSync(output, marker)
    writeFileSync(
      compilerManifest,
      '{"name":"@vouchington/localization-compiler","version":"0.1.1"}\n',
    )
    expect(runWithOverrides()).toBe(output)
    const thirdRevision = readFileSync(`${output}.revision`, 'utf8')
    expect(thirdRevision).not.toBe(secondRevision)
    expect(readFileSync(output)).not.toContain(marker)
  })
})
