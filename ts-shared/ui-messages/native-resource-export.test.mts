import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NATIVE_CONSUMER_MANIFEST,
  type NativeConsumerManifestEntry,
} from './native-consumer-manifest.mts'
import { nativeKeyIdentifier } from './native-consumer-usage.mts'
import { writeNativeResourceFiles } from './native-resource-writer.mts'
import { generateNativeResourceFiles } from './native-resources.mts'

function productUsageFixtureSources(): ReadonlyArray<readonly [path: string, content: string]> {
  const swiftIdentifiers = NATIVE_CONSUMER_MANIFEST.filter((entry: NativeConsumerManifestEntry) =>
    entry.consumers.includes('swift'),
  ).map(entry => `UiMessageKey.${nativeKeyIdentifier(entry.key, 'swift')}`)
  const dotnetIdentifiers = NATIVE_CONSUMER_MANIFEST.filter((entry: NativeConsumerManifestEntry) =>
    entry.consumers.includes('dotnet'),
  ).map(entry => `UiMessageKey.${nativeKeyIdentifier(entry.key, 'dotnet')}`)
  return [
    ['swift-clients/ui/Sources/UsageFixture.swift', swiftIdentifiers.join('\n')],
    ['dotnet-clients/src/UsageFixture.cs', dotnetIdentifiers.join('\n')],
  ]
}

function initializeFixtureRepository(root: string, paths: readonly string[]): void {
  const env = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    PATH: process.env.PATH,
  }
  execFileSync('git', ['-C', root, 'init', '--quiet'], { env })
  execFileSync('git', ['-C', root, 'add', '--', ...paths], { env })
}

describe('native resource export', () => {
  it('requires the external consumer root when generating default resources', async () => {
    await expect(
      writeNativeResourceFiles({ outputRoot: '/unused-native-output', check: true }),
    ).rejects.toThrow('Native localization consumer root is required')
  })

  it(
    'validates default product usage before checking generated resources',
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'voucha-native-localization-defaults-'))
      const sources = productUsageFixtureSources()
      try {
        for (const [path, content] of sources) {
          await mkdir(dirname(join(root, path)), { recursive: true })
          await writeFile(join(root, path), content)
        }
        initializeFixtureRepository(
          root,
          sources.map(([path]) => path),
        )
        await writeNativeResourceFiles({
          outputRoot: root,
          check: false,
          files: generateNativeResourceFiles(),
        })

        await expect(
          writeNativeResourceFiles({ outputRoot: root, consumerRoot: root, check: true }),
        ).resolves.toBeUndefined()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it(
    'exports resources from an external consumer checkout into an isolated root',
    { timeout: 30_000 },
    async () => {
      const consumerRoot = await mkdtemp(join(tmpdir(), 'voucha-native-consumer-'))
      const outputRoot = await mkdtemp(join(tmpdir(), 'voucha-native-output-'))
      const sources = productUsageFixtureSources()
      try {
        for (const [path, content] of sources) {
          await mkdir(dirname(join(consumerRoot, path)), { recursive: true })
          await writeFile(join(consumerRoot, path), content)
        }
        initializeFixtureRepository(
          consumerRoot,
          sources.map(([path]) => path),
        )

        execFileSync(
          process.execPath,
          [
            'dev/native-localization.mts',
            '--output-root',
            outputRoot,
            '--consumer-root',
            consumerRoot,
          ],
          { cwd: process.cwd() },
        )

        expect(() =>
          execFileSync(
            process.execPath,
            [
              'dev/native-localization.mts',
              '--output-root',
              outputRoot,
              '--consumer-root',
              consumerRoot,
              '--check',
            ],
            { cwd: process.cwd() },
          ),
        ).not.toThrow()
        await expect(
          readFile(
            join(
              outputRoot,
              'swift-clients/ui/Sources/VouchaLocalization/Generated/UiMessageKey.swift',
            ),
            'utf8',
          ),
        ).resolves.toContain('public struct UiMessageKey')
        await writeFile(
          join(
            outputRoot,
            'swift-clients/ui/Sources/VouchaLocalization/Generated/UiMessageKey.swift',
          ),
          'stale',
        )
        expect(() =>
          execFileSync(
            process.execPath,
            [
              'dev/native-localization.mts',
              '--output-root',
              outputRoot,
              '--consumer-root',
              consumerRoot,
              '--check',
            ],
            { cwd: process.cwd(), stdio: 'pipe' },
          ),
        ).toThrow('Command failed')
      } finally {
        await Promise.all([
          rm(consumerRoot, { recursive: true, force: true }),
          rm(outputRoot, { recursive: true, force: true }),
        ])
      }
    },
  )

  it(
    'validates the render contract without requiring in-repository clients',
    { timeout: 30_000 },
    () => {
      expect(() =>
        execFileSync(process.execPath, ['dev/native-localization.mts', '--validate'], {
          cwd: process.cwd(),
        }),
      ).not.toThrow()
    },
  )

  it('requires explicit external output and consumer roots for export', () => {
    expect(() =>
      execFileSync(process.execPath, ['dev/native-localization.mts', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).toThrow('Command failed')
  })
})
