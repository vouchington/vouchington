import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  alternateBuildsAreUnused,
  pruneOpenTelemetryAlternateBuilds,
} from '../prune-opentelemetry-alternate-builds.mts'

describe('alternateBuildsAreUnused', () => {
  it('keeps a package whose Node entry is build/src', () => {
    expect(
      alternateBuildsAreUnused({
        main: 'build/src/index.js',
        exports: {
          '.': {
            esnext: './build/esnext/index.js',
            module: './build/esm/index.js',
            types: './build/src/index.d.ts',
            default: './build/src/index.js',
          },
          './experimental': {
            import: './build/src/experimental/index.js',
            default: './build/src/experimental/index.js',
          },
        },
      }),
    ).toBe(true)
  })

  it('keeps alternate builds when Node imports them', () => {
    expect(
      alternateBuildsAreUnused({
        exports: {
          '.': {
            import: './build/esm/index.js',
            default: './build/src/index.js',
          },
        },
      }),
    ).toBe(false)
  })

  it('rejects an exports array instead of guessing', () => {
    expect(alternateBuildsAreUnused({ exports: ['./build/src/index.js'] })).toBe(false)
  })
})

describe('pruneOpenTelemetryAlternateBuilds', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function writePackage(options: {
    storeName: string
    packageName: string
    manifest: unknown
    srcText?: string
    includeAlternates?: boolean
  }): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'voucha-prune-otel-'))
    testDirs.push(root)
    const packageDir = path.join(
      root,
      'node_modules',
      '.pnpm',
      options.storeName,
      'node_modules',
      '@opentelemetry',
      options.packageName,
    )
    await mkdir(path.join(packageDir, 'build', 'src'), { recursive: true })
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(options.manifest))
    await writeFile(
      path.join(packageDir, 'build', 'src', 'index.js'),
      options.srcText ?? 'module.exports = true\n',
    )
    if (options.includeAlternates !== false) {
      await mkdir(path.join(packageDir, 'build', 'esm'), { recursive: true })
      await mkdir(path.join(packageDir, 'build', 'esnext'), { recursive: true })
      await writeFile(path.join(packageDir, 'build', 'esm', 'index.js'), 'esm\n')
      await writeFile(path.join(packageDir, 'build', 'esnext', 'index.js'), 'esnext\n')
    }
    return root
  }

  it('removes esm and esnext when Node resolves build/src', async () => {
    const prodDir = await writePackage({
      storeName: 'otel-api',
      packageName: 'api',
      manifest: {
        main: 'build/src/index.js',
        exports: {
          '.': {
            esnext: './build/esnext/index.js',
            module: './build/esm/index.js',
            types: './build/src/index.d.ts',
            default: './build/src/index.js',
          },
        },
      },
    })

    const result = await pruneOpenTelemetryAlternateBuilds(prodDir)

    expect(result).toEqual({ bytesRemoved: 11, directoriesRemoved: 2 })
    await expect(
      readFile(
        path.join(
          prodDir,
          'node_modules/.pnpm/otel-api/node_modules/@opentelemetry/api/build/src/index.js',
        ),
        'utf8',
      ),
    ).resolves.toBe('module.exports = true\n')
    await expect(
      stat(
        path.join(prodDir, 'node_modules/.pnpm/otel-api/node_modules/@opentelemetry/api/build/esm'),
      ),
    ).rejects.toThrow(/ENOENT/)
    await expect(
      stat(
        path.join(
          prodDir,
          'node_modules/.pnpm/otel-api/node_modules/@opentelemetry/api/build/esnext',
        ),
      ),
    ).rejects.toThrow(/ENOENT/)
  })

  it('leaves alternate builds when the src tree references them', async () => {
    const prodDir = await writePackage({
      storeName: 'otel-core',
      packageName: 'core',
      manifest: { main: './build/src/index.js' },
      srcText: "require('./vendor/build/esm/index.js')\n",
    })

    expect(await pruneOpenTelemetryAlternateBuilds(prodDir)).toEqual({
      bytesRemoved: 0,
      directoriesRemoved: 0,
    })
    await expect(
      stat(
        path.join(
          prodDir,
          'node_modules/.pnpm/otel-core/node_modules/@opentelemetry/core/build/esm/index.js',
        ),
      ),
    ).resolves.toBeTruthy()
  })

  it('ignores packages outside the OpenTelemetry scope', async () => {
    const prodDir = await writePackage({
      storeName: 'other-pkg',
      packageName: 'api',
      manifest: { main: 'build/src/index.js' },
    })
    const packageDir = path.join(
      prodDir,
      'node_modules',
      '.pnpm',
      'other-pkg',
      'node_modules',
      '@opentelemetry',
      'api',
    )
    const otherDir = path.join(
      prodDir,
      'node_modules',
      '.pnpm',
      'other-pkg',
      'node_modules',
      'other',
    )
    await rm(packageDir, { recursive: true })
    await mkdir(path.join(otherDir, 'build', 'src'), { recursive: true })
    await mkdir(path.join(otherDir, 'build', 'esm'), { recursive: true })
    await writeFile(
      path.join(otherDir, 'package.json'),
      JSON.stringify({ main: 'build/src/index.js' }),
    )
    await writeFile(path.join(otherDir, 'build', 'src', 'index.js'), 'keep\n')
    await writeFile(path.join(otherDir, 'build', 'esm', 'index.js'), 'drop?\n')

    expect(await pruneOpenTelemetryAlternateBuilds(prodDir)).toEqual({
      bytesRemoved: 0,
      directoriesRemoved: 0,
    })
    await expect(readFile(path.join(otherDir, 'build', 'esm', 'index.js'), 'utf8')).resolves.toBe(
      'drop?\n',
    )
  })

  it('does nothing when the pnpm store is absent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'voucha-prune-otel-'))
    testDirs.push(root)

    expect(await pruneOpenTelemetryAlternateBuilds(root)).toEqual({
      bytesRemoved: 0,
      directoriesRemoved: 0,
    })
  })
})
