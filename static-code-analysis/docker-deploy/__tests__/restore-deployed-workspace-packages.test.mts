import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { restoreDeployedWorkspacePackages } from '../restore-deployed-workspace-packages.mts'

const ALPHA_STORE = '@services+alpha@file+backend+services+alpha'
const CONFIG_STORE = '@voucha+config@file+backend+config'
const UTILS_STORE = '@ts-shared+utils@file+ts-shared+utils'
const PG_STORE = 'pg@8.0.0'

function relativeSymlink(linkPath: string, target: string): void {
  mkdirSync(path.dirname(linkPath), { recursive: true })
  symlinkSync(path.relative(path.dirname(linkPath), target), linkPath, 'dir')
}

describe('restoreDeployedWorkspacePackages', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  function makeFixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'voucha-restore-workspaces-'))
    testDirs.push(root)

    const backendDir = path.join(root, 'app', 'backend')
    mkdirSync(path.join(backendDir, 'services', 'alpha'), { recursive: true })
    mkdirSync(path.join(backendDir, 'services', 'empty'), { recursive: true })
    mkdirSync(path.join(backendDir, 'services', 'noname'), { recursive: true })
    mkdirSync(path.join(backendDir, 'config'), { recursive: true })
    mkdirSync(path.join(root, 'app', 'ts-shared', 'utils'), { recursive: true })
    writeFileSync(
      path.join(backendDir, 'package.json'),
      JSON.stringify({
        name: '@voucha/backend',
        workspaces: ['services/*', 'config', 'missing/*', '../ts-shared/*'],
      }),
    )
    writeFileSync(
      path.join(backendDir, 'services', 'alpha', 'package.json'),
      JSON.stringify({ name: '@services/alpha' }),
    )
    writeFileSync(path.join(backendDir, 'services', 'noname', 'package.json'), JSON.stringify({}))
    writeFileSync(
      path.join(backendDir, 'config', 'package.json'),
      JSON.stringify({ name: '@voucha/config' }),
    )
    writeFileSync(
      path.join(root, 'app', 'ts-shared', 'utils', 'package.json'),
      JSON.stringify({ name: '@ts-shared/utils' }),
    )

    const prodDir = path.join(root, 'prod', 'backend')
    const pnpmRoot = path.join(prodDir, 'node_modules', '.pnpm')

    const alphaContent = path.join(pnpmRoot, ALPHA_STORE, 'node_modules', '@services', 'alpha')
    mkdirSync(alphaContent, { recursive: true })
    writeFileSync(path.join(alphaContent, 'index.mts'), 'export const alpha = true\n')

    const configContent = path.join(pnpmRoot, CONFIG_STORE, 'node_modules', '@voucha', 'config')
    mkdirSync(configContent, { recursive: true })
    writeFileSync(path.join(configContent, 'env.mts'), 'export const env = true\n')

    const utilsContent = path.join(pnpmRoot, UTILS_STORE, 'node_modules', '@ts-shared', 'utils')
    mkdirSync(utilsContent, { recursive: true })
    writeFileSync(path.join(utilsContent, 'strings.mts'), 'export const strings = true\n')

    const pgContent = path.join(pnpmRoot, PG_STORE, 'node_modules', 'pg')
    mkdirSync(pgContent, { recursive: true })
    writeFileSync(path.join(pgContent, 'index.js'), 'module.exports = {}\n')

    // pnpm links alpha's deps as siblings inside its own store dir.
    relativeSymlink(
      path.join(pnpmRoot, ALPHA_STORE, 'node_modules', '@voucha', 'config'),
      configContent,
    )
    relativeSymlink(path.join(pnpmRoot, ALPHA_STORE, 'node_modules', 'pg'), pgContent)

    // Top-level entry for the entrypoint's direct dep.
    relativeSymlink(path.join(prodDir, 'node_modules', '@services', 'alpha'), alphaContent)

    // Hoist dir and stray files in .pnpm must be ignored.
    const hoistDecoy = path.join(pnpmRoot, 'node_modules', '@services', 'alpha')
    mkdirSync(hoistDecoy, { recursive: true })
    writeFileSync(path.join(hoistDecoy, 'index.mts'), 'hoisted decoy\n')
    writeFileSync(path.join(pnpmRoot, '.modules.yaml'), 'hoistPattern: []\n')

    return { alphaContent, backendDir, pnpmRoot, prodDir, root }
  }

  it('relocates virtual-store workspace copies and leaves symlinks behind', () => {
    const { alphaContent, backendDir, prodDir } = makeFixture()

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const relocated = path.join(prodDir, 'workspace-packages', ALPHA_STORE, '@services', 'alpha')
    expect(readFileSync(path.join(relocated, 'index.mts'), 'utf8')).toBe(
      'export const alpha = true\n',
    )
    expect(lstatSync(alphaContent).isSymbolicLink()).toBe(true)
    expect(readFileSync(path.join(alphaContent, 'index.mts'), 'utf8')).toBe(
      'export const alpha = true\n',
    )

    // The top-level entry chains through the virtual-store symlink to a real
    // path with no node_modules segment, so --experimental-strip-types works.
    const topLevel = path.join(prodDir, 'node_modules', '@services', 'alpha')
    expect(readFileSync(path.join(topLevel, 'index.mts'), 'utf8')).toBe(
      'export const alpha = true\n',
    )
    expect(realpathSync(topLevel).split(path.sep)).not.toContain('node_modules')
  })

  it('creates a node_modules backlink so relocated packages resolve deps through pnpm topology', () => {
    const { backendDir, pnpmRoot, prodDir } = makeFixture()

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const relocated = path.join(prodDir, 'workspace-packages', ALPHA_STORE, '@services', 'alpha')
    const backlink = path.join(relocated, 'node_modules')
    expect(lstatSync(backlink).isSymbolicLink()).toBe(true)
    expect(realpathSync(backlink)).toBe(
      realpathSync(path.join(pnpmRoot, ALPHA_STORE, 'node_modules')),
    )

    // Workspace dep: chains through the relocated config's virtual-store symlink.
    const configThroughAlpha = path.join(backlink, '@voucha', 'config')
    expect(readFileSync(path.join(configThroughAlpha, 'env.mts'), 'utf8')).toBe(
      'export const env = true\n',
    )
    expect(realpathSync(configThroughAlpha).split(path.sep)).not.toContain('node_modules')

    // npm dep resolves unchanged.
    expect(readFileSync(path.join(backlink, 'pg', 'index.js'), 'utf8')).toBe(
      'module.exports = {}\n',
    )
  })

  it('relocates external ts-shared workspace packages the same way', () => {
    const { backendDir, pnpmRoot, prodDir } = makeFixture()

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const relocated = path.join(prodDir, 'workspace-packages', UTILS_STORE, '@ts-shared', 'utils')
    expect(readFileSync(path.join(relocated, 'strings.mts'), 'utf8')).toBe(
      'export const strings = true\n',
    )
    const original = path.join(pnpmRoot, UTILS_STORE, 'node_modules', '@ts-shared', 'utils')
    expect(lstatSync(original).isSymbolicLink()).toBe(true)
  })

  it('leaves npm packages in the virtual store untouched', () => {
    const { backendDir, pnpmRoot, prodDir } = makeFixture()

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const pgContent = path.join(pnpmRoot, PG_STORE, 'node_modules', 'pg')
    const stats = lstatSync(pgContent)
    expect(stats.isDirectory()).toBe(true)
    expect(stats.isSymbolicLink()).toBe(false)
    expect(existsSync(path.join(prodDir, 'workspace-packages', PG_STORE))).toBe(false)
  })

  it('is idempotent across repeated runs', () => {
    const { alphaContent, backendDir, prodDir } = makeFixture()

    restoreDeployedWorkspacePackages({ backendDir, prodDir })
    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const relocated = path.join(prodDir, 'workspace-packages', ALPHA_STORE, '@services', 'alpha')
    expect(readFileSync(path.join(relocated, 'index.mts'), 'utf8')).toBe(
      'export const alpha = true\n',
    )
    expect(lstatSync(alphaContent).isSymbolicLink()).toBe(true)
    expect(existsSync(path.join(relocated, '@services'))).toBe(false)
  })

  it('relocates peer-variant store entries independently', () => {
    const { backendDir, pnpmRoot, prodDir } = makeFixture()
    const peerStore = `${ALPHA_STORE}_peerdep@1.0.0`
    const peerContent = path.join(pnpmRoot, peerStore, 'node_modules', '@services', 'alpha')
    mkdirSync(peerContent, { recursive: true })
    writeFileSync(path.join(peerContent, 'index.mts'), 'export const alphaPeer = true\n')

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const relocatedBase = path.join(
      prodDir,
      'workspace-packages',
      ALPHA_STORE,
      '@services',
      'alpha',
    )
    const relocatedPeer = path.join(prodDir, 'workspace-packages', peerStore, '@services', 'alpha')
    expect(readFileSync(path.join(relocatedBase, 'index.mts'), 'utf8')).toBe(
      'export const alpha = true\n',
    )
    expect(readFileSync(path.join(relocatedPeer, 'index.mts'), 'utf8')).toBe(
      'export const alphaPeer = true\n',
    )
    expect(lstatSync(peerContent).isSymbolicLink()).toBe(true)
  })

  it('skips the .pnpm hoist directory and stray files', () => {
    const { backendDir, pnpmRoot, prodDir } = makeFixture()

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const hoistDecoy = path.join(pnpmRoot, 'node_modules', '@services', 'alpha')
    expect(lstatSync(hoistDecoy).isDirectory()).toBe(true)
    expect(readFileSync(path.join(hoistDecoy, 'index.mts'), 'utf8')).toBe('hoisted decoy\n')
    expect(existsSync(path.join(prodDir, 'workspace-packages', 'node_modules'))).toBe(false)
  })

  it('merges sibling links into an existing node_modules directory without overwriting it', () => {
    const { alphaContent, backendDir, prodDir } = makeFixture()
    // pnpm deploy leaves a real node_modules/.bin inside some injected packages
    mkdirSync(path.join(alphaContent, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(path.join(alphaContent, 'node_modules', '.bin', 'tool'), '#!/bin/sh\n')
    mkdirSync(path.join(alphaContent, 'node_modules', 'pg'), { recursive: true })
    writeFileSync(
      path.join(alphaContent, 'node_modules', 'pg', 'index.js'),
      'module.exports = "nested"\n',
    )

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    const relocated = path.join(prodDir, 'workspace-packages', ALPHA_STORE, '@services', 'alpha')
    const nested = path.join(relocated, 'node_modules')
    expect(lstatSync(nested).isSymbolicLink()).toBe(false)
    expect(readFileSync(path.join(nested, '.bin', 'tool'), 'utf8')).toBe('#!/bin/sh\n')
    // existing entries win over sibling links
    expect(lstatSync(path.join(nested, 'pg')).isSymbolicLink()).toBe(false)
    expect(readFileSync(path.join(nested, 'pg', 'index.js'), 'utf8')).toBe(
      'module.exports = "nested"\n',
    )
    // missing siblings are linked in so the package still resolves its deps
    expect(lstatSync(path.join(nested, '@voucha')).isSymbolicLink()).toBe(true)
    expect(readFileSync(path.join(nested, '@voucha', 'config', 'env.mts'), 'utf8')).toBe(
      'export const env = true\n',
    )
  })

  it('replaces a stale relocated copy from a previous layout', () => {
    const { backendDir, prodDir } = makeFixture()
    const relocated = path.join(prodDir, 'workspace-packages', ALPHA_STORE, '@services', 'alpha')
    mkdirSync(relocated, { recursive: true })
    writeFileSync(path.join(relocated, 'stale.mts'), 'stale\n')

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    expect(existsSync(path.join(relocated, 'stale.mts'))).toBe(false)
    expect(readFileSync(path.join(relocated, 'index.mts'), 'utf8')).toBe(
      'export const alpha = true\n',
    )
  })

  it('returns without changes when the deploy tree has no .pnpm directory', () => {
    const { backendDir, pnpmRoot, prodDir } = makeFixture()
    rmSync(pnpmRoot, { force: true, recursive: true })

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    expect(existsSync(path.join(prodDir, 'workspace-packages'))).toBe(false)
  })

  it('relocates nothing when the backend manifest has no workspaces field', () => {
    const { alphaContent, backendDir, prodDir } = makeFixture()
    writeFileSync(
      path.join(backendDir, 'package.json'),
      JSON.stringify({ name: '@voucha/backend' }),
    )

    restoreDeployedWorkspacePackages({ backendDir, prodDir })

    expect(lstatSync(alphaContent).isDirectory()).toBe(true)
    expect(existsSync(path.join(prodDir, 'workspace-packages'))).toBe(false)
  })
})
