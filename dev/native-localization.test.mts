import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runNativeLocalizationCli } from './native-localization.mts'
import type { NativeConsumerManifestEntry } from '../ts-shared/ui-messages/native-consumer-manifest.mts'
import type { NativeCatalogs } from '../ts-shared/ui-messages/native-resource-catalog.mts'

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

describe('native localization CLI', () => {
  it('validates the tiny supplied catalog through --validate', async () => {
    await expect(
      runNativeLocalizationCli(['--validate'], { manifest, catalogs }, true),
    ).resolves.toBeUndefined()
    await expect(
      runNativeLocalizationCli(
        ['--validate'],
        { manifest, catalogs: { ...catalogs, es: { common: { save: 'Guardar {value}' } } } },
        true,
      ),
    ).rejects.toThrow('Placeholder mismatch for "common.save" in es')
  })

  it('rejects generation without explicit output and consumer roots', async () => {
    await expect(runNativeLocalizationCli([], { manifest, catalogs }, true)).rejects.toThrow(
      'Usage: node dev/native-localization.mts --validate',
    )
    await expect(
      runNativeLocalizationCli(
        ['--output-root', '/tmp/native-localization-output'],
        { manifest, catalogs },
        true,
      ),
    ).rejects.toThrow('Usage: node dev/native-localization.mts --validate')
    await expect(
      runNativeLocalizationCli(
        ['--output-root', 'relative', '--consumer-root', '/tmp/native-localization-clients'],
        { manifest, catalogs },
        true,
      ),
    ).rejects.toThrow('Usage: node dev/native-localization.mts --validate')
    await expect(
      runNativeLocalizationCli(['--unknown'], { manifest, catalogs }, true),
    ).rejects.toThrow('Usage: node dev/native-localization.mts --validate')
    await expect(
      runNativeLocalizationCli(
        ['--output-root', '/', '--consumer-root', '/tmp/native-localization-clients'],
        { manifest, catalogs },
        true,
      ),
    ).rejects.toThrow('--output-root must not be the filesystem root')
  })

  it('generates and checks resources through the CLI with a tiny client fixture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-native-localization-cli-'))
    const consumerRoot = join(root, 'clients')
    const outputRoot = join(root, 'generated')
    try {
      for (const [path, content] of productSources) {
        await mkdir(dirname(join(consumerRoot, path)), { recursive: true })
        await writeFile(join(consumerRoot, path), content)
      }
      initializeFixtureRepository(consumerRoot)

      await runNativeLocalizationCli(
        ['--output-root', outputRoot, '--consumer-root', consumerRoot],
        { manifest, catalogs },
        true,
      )
      await expect(
        runNativeLocalizationCli(
          ['--output-root', outputRoot, '--consumer-root', consumerRoot, '--check'],
          { manifest, catalogs },
          true,
        ),
      ).resolves.toBeUndefined()

      const swiftResources = await readFile(
        join(
          outputRoot,
          'swift-clients/ui/Sources/VouchaLocalization/Generated/Resources/en.lproj/Localizable.strings',
        ),
        'utf8',
      )
      expect(swiftResources).toContain('"common.save" = "Save {name}";')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
