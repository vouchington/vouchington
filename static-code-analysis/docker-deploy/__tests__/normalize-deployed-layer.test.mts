import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  EPOCH_PRUNED_AT,
  normalizeDeployedLayer,
  runNormalizeDeployedLayerCli,
} from '../normalize-deployed-layer.mts'

describe('normalizeDeployedLayer', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  function makeProdDir(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'voucha-normalize-deploy-'))
    testDirs.push(root)
    return path.join(root, 'prod', 'backend')
  }

  it('pins prunedAt and preserves the other .modules.yaml keys', () => {
    const prodDir = makeProdDir()
    const modulesPath = path.join(prodDir, 'node_modules', '.modules.yaml')
    mkdirSync(path.dirname(modulesPath), { recursive: true })
    writeFileSync(
      modulesPath,
      `${JSON.stringify(
        {
          hoistedDependencies: { 'left-pad@1.0.0': { 'left-pad': 'private' } },
          packageManager: 'pnpm@12.6.0',
          prunedAt: 'Mon, 17 Aug 2026 04:16:02 GMT',
          storeDir: '/root/.local/share/pnpm/store/v11',
        },
        null,
        2,
      )}\n`,
    )

    const result = normalizeDeployedLayer(prodDir)

    expect(result).toMatchObject({ prunedAtPinned: true })
    expect(JSON.parse(readFileSync(modulesPath, 'utf8'))).toEqual({
      hoistedDependencies: { 'left-pad@1.0.0': { 'left-pad': 'private' } },
      packageManager: 'pnpm@12.6.0',
      prunedAt: EPOCH_PRUNED_AT,
      storeDir: '/root/.local/share/pnpm/store/v11',
    })
  })

  it('clamps file, directory, and symlink mtimes to epoch 0', () => {
    const prodDir = makeProdDir()
    const modulesDir = path.join(prodDir, 'node_modules')
    const filePath = path.join(modulesDir, 'keep.js')
    const linkPath = path.join(modulesDir, 'keep-link')
    mkdirSync(modulesDir, { recursive: true })
    writeFileSync(path.join(modulesDir, '.modules.yaml'), '{}\n')
    writeFileSync(filePath, 'module.exports = true\n')
    symlinkSync('keep.js', linkPath)
    const later = new Date('2026-08-17T04:16:02Z')
    utimesSync(filePath, later, later)
    utimesSync(modulesDir, later, later)

    normalizeDeployedLayer(prodDir)

    expect(lstatSync(filePath).mtimeMs).toBe(0)
    expect(lstatSync(linkPath).mtimeMs).toBe(0)
    expect(lstatSync(modulesDir).mtimeMs).toBe(0)
    expect(lstatSync(prodDir).mtimeMs).toBe(0)
  })

  it('fails closed when .modules.yaml is missing', () => {
    const prodDir = makeProdDir()
    mkdirSync(prodDir, { recursive: true })

    expect(() => normalizeDeployedLayer(prodDir)).toThrow(
      /missing; expected pnpm deploy to write it/,
    )
  })

  it('fails closed when .modules.yaml is not JSON', () => {
    const prodDir = makeProdDir()
    const modulesPath = path.join(prodDir, 'node_modules', '.modules.yaml')
    mkdirSync(path.dirname(modulesPath), { recursive: true })
    writeFileSync(modulesPath, 'prunedAt: Mon, 17 Aug 2026 04:16:02 GMT\n')

    expect(() => normalizeDeployedLayer(prodDir)).toThrow(/JSON/i)
  })
})

describe('runNormalizeDeployedLayerCli', () => {
  it('does nothing when the module is imported', () => {
    const calls: string[] = []

    runNormalizeDeployedLayerCli({
      args: [],
      env: {},
      isMain: false,
      normalize: prodDir => {
        calls.push(prodDir)
        return { prunedAtPinned: true, entriesTouched: 1 }
      },
      stdout: message => calls.push(message),
    })

    expect(calls).toEqual([])
  })

  it.each([
    [['/argument'], { PROD_DIR: '/environment' }, '/argument'],
    [[], { PROD_DIR: '/environment' }, '/environment'],
    [[], {}, '/prod/backend'],
  ])('uses argument, environment, and default directory precedence', (args, env, expected) => {
    const calls: string[] = []

    runNormalizeDeployedLayerCli({
      args,
      env,
      isMain: true,
      normalize: prodDir => {
        calls.push(prodDir)
        return { prunedAtPinned: true, entriesTouched: 4 }
      },
      stdout: message => calls.push(message),
    })

    expect(calls).toEqual([
      expected,
      `Normalized deployed layer at ${expected} (prunedAt pinned, 4 entries)`,
    ])
  })
})
