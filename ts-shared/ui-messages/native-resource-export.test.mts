import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NativeConsumerManifestEntry } from './native-consumer-manifest.mts'
import type { NativeCatalogs } from './native-resource-catalog.mts'
import { writeNativeResourceFiles } from './native-resource-writer.mts'

const manifest = [
  { key: 'common.save', consumers: ['swift', 'dotnet'] },
] as const satisfies readonly NativeConsumerManifestEntry[]

const catalogs: NativeCatalogs = {
  en: { common: { save: 'Save {name}' } },
  es: { common: { save: 'Guardar {name}' } },
  fr: { common: { save: 'Enregistrer {name}' } },
  pt: { common: { save: 'Salvar {name}' } },
}

const productSources = [
  ['swift-clients/ui/Sources/UsageFixture.swift', 'UiMessageKey.commonSave'],
  ['dotnet-clients/src/UsageFixture.cs', 'UiMessageKey.CommonSave'],
] as const

function initializeFixtureRepository(root: string): void {
  const env = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    PATH: process.env.PATH,
  }
  execFileSync('git', ['-C', root, 'init', '--quiet'], { env })
  execFileSync('git', ['-C', root, 'add', '--', ...productSources.map(([path]) => path)], { env })
}

describe('native resource export', () => {
  it('requires an explicit consumer root when generating resources', async () => {
    await expect(
      writeNativeResourceFiles({
        outputRoot: '/unused-native-output',
        check: true,
        manifest,
        catalogs,
      }),
    ).rejects.toThrow('Native localization consumer root is required')
  })

  it('generates and checks resources from a tiny external consumer fixture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-native-localization-'))
    const consumerRoot = join(root, 'clients')
    const outputRoot = join(root, 'generated')
    try {
      for (const [path, content] of productSources) {
        await mkdir(dirname(join(consumerRoot, path)), { recursive: true })
        await writeFile(join(consumerRoot, path), content)
      }
      initializeFixtureRepository(consumerRoot)

      await writeNativeResourceFiles({ outputRoot, consumerRoot, check: false, manifest, catalogs })
      await expect(
        writeNativeResourceFiles({ outputRoot, consumerRoot, check: true, manifest, catalogs }),
      ).resolves.toBeUndefined()

      const swiftResources = await readFile(
        join(
          outputRoot,
          'swift-clients/ui/Sources/VouchaLocalization/Generated/Resources/en.lproj/Localizable.strings',
        ),
        'utf8',
      )
      expect(swiftResources).toContain('"common.save" = "Save {name}";')
      const dotnetResources = await readFile(
        join(
          outputRoot,
          'dotnet-clients/src/Voucha.Client.Core/Localization/Generated/UiMessages.resx',
        ),
        'utf8',
      )
      expect(dotnetResources).toContain('<data name="common.save" xml:space="preserve">')
      const dotnetKeys = await readFile(
        join(
          outputRoot,
          'dotnet-clients/src/Voucha.Client.Core/Localization/Generated/UiMessageKey.g.cs',
        ),
        'utf8',
      )
      expect(dotnetKeys).toContain('CommonSave')

      const swiftSource = join(consumerRoot, productSources[0][0])
      await writeFile(swiftSource, 'UiMessageKey.unknown')
      await expect(
        writeNativeResourceFiles({ outputRoot, consumerRoot, check: true, manifest, catalogs }),
      ).rejects.toThrow('unknown swift typed message key "unknown"')
      await writeFile(swiftSource, productSources[0][1])

      const staleResource = join(
        outputRoot,
        'swift-clients/ui/Sources/VouchaLocalization/Generated/Resources/en.lproj/Localizable.strings',
      )
      await writeFile(staleResource, 'stale')
      await expect(
        writeNativeResourceFiles({ outputRoot, consumerRoot, check: true, manifest, catalogs }),
      ).rejects.toThrow(
        'stale swift-clients/ui/Sources/VouchaLocalization/Generated/Resources/en.lproj/Localizable.strings',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
