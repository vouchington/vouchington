import { describe, expect, it } from 'vitest'
import { runNativeLocalization } from './native-localization.mts'
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

describe('native localization CLI', () => {
  it('validates the tiny supplied catalog through --validate', async () => {
    await expect(
      runNativeLocalization(['--validate'], { manifest, catalogs }),
    ).resolves.toBeUndefined()
    await expect(
      runNativeLocalization(['--validate'], {
        manifest,
        catalogs: { ...catalogs, es: { common: { save: 'Guardar {value}' } } },
      }),
    ).rejects.toThrow('Placeholder mismatch for "common.save" in es')
  })

  it('rejects generation without explicit output and consumer roots', async () => {
    await expect(runNativeLocalization([], { manifest, catalogs })).rejects.toThrow(
      'Usage: node dev/native-localization.mts --validate',
    )
    await expect(
      runNativeLocalization(['--output-root', '/tmp/native-localization-output'], {
        manifest,
        catalogs,
      }),
    ).rejects.toThrow('Usage: node dev/native-localization.mts --validate')
  })
})
