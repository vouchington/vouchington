import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { CatalogLeaf } from './index.mts'
import type { MessageDescriptor, PluralForms } from './message-descriptors.mts'
import type { NativeConsumerManifestEntry } from './native-consumer-manifest.mts'
import {
  getNativeCatalogLeaf,
  nativeLeafVariants,
  validateNativeManifestCatalogs,
  type NativeCatalogs,
} from './native-resource-catalog.mts'
import { writeNativeResourceFiles } from './native-resource-writer.mts'
import { generateNativeResourceFiles } from './native-resources.mts'
import { enMessages, esMessages, frMessages, ptMessages } from './locale-catalogs.mts'

const CATALOGS = { en: enMessages, es: esMessages, fr: frMessages, pt: ptMessages }
const ONE_OTHER: PluralForms = { one: '{count} item', other: '{count} items' }

function catalogsWith(en: CatalogLeaf, es: CatalogLeaf = en): NativeCatalogs {
  return {
    en: { test: en },
    es: { test: es },
    fr: { test: en },
    pt: { test: en },
  }
}

describe('native UI message resources', () => {
  it('generates deterministic Swift and .NET resources from the native consumer manifest', () => {
    const first = generateNativeResourceFiles()
    const second = generateNativeResourceFiles()

    expect(second).toEqual(first)
    expect(first.map(file => file.path)).toEqual([...first.map(file => file.path)].sort())
    expect(first.some(file => file.path.endsWith('/en.lproj/Localizable.strings'))).toBe(true)
    expect(first.some(file => file.path.endsWith('/UiMessages.resx'))).toBe(true)
    expect(first.some(file => file.path.endsWith('/UiMessageKey.swift'))).toBe(true)
    expect(first.some(file => file.path.endsWith('/UiMessageKey.g.cs'))).toBe(true)
  })

  it('expands plural descriptors into internal resource variants', () => {
    const manifest = [
      { key: 'settings.language.supportedCount', consumers: ['swift'] },
      { key: 'shared.countLabel.format', consumers: ['dotnet'] },
      { key: 'shared.timeAgo.relativeDuration', consumers: ['swift'] },
    ] as const satisfies readonly NativeConsumerManifestEntry[]
    const files = generateNativeResourceFiles({ manifest })
    const swiftEnglish = files.find(file => file.path.endsWith('/en.lproj/Localizable.strings'))!
    const dotnetFrench = files.find(file => file.path.endsWith('/UiMessages.fr.resx'))!

    expect(swiftEnglish.content).toContain(
      '"settings.language.supportedCount.__plural.one" = "{count} language";',
    )
    expect(swiftEnglish.content).toContain(
      '"shared.timeAgo.relativeDuration.__select.day.other" = "{value} days ago";',
    )
    expect(dotnetFrench.content).toContain(
      '<data name="shared.countLabel.format.__select.member.one" xml:space="preserve"><value>{count} membre</value></data>',
    )
  })

  it('exports provider-neutral moderation summaries for both native clients', () => {
    const files = generateNativeResourceFiles()
    const swiftEnglish = files.find(file => file.path.endsWith('/en.lproj/Localizable.strings'))!
    const dotnetEnglish = files.find(file => file.path.endsWith('/UiMessages.resx'))!

    for (const content of [swiftEnglish.content, dotnetEnglish.content]) {
      expect(content).toContain('native.moderation.summary.title')
      expect(content).toContain('native.moderation.summary.disposition.pass')
      expect(content).toContain('native.moderation.summary.disposition.review')
      expect(content).toContain('native.moderation.summary.disposition.reject')
      expect(content).toContain('native.moderation.summary.disposition.incomplete')
      expect(content).toContain('native.moderation.summary.disposition.none')
      expect(content).toContain(
        'native.moderation.summary.evidence.flaggedCategories.__plural.other',
      )
      expect(content).toContain('native.moderation.summary.evidence.signals.__plural.other')
      expect(content).not.toContain('native.swift.moderationReports.reviewQueueSpam')
      expect(content).not.toContain('native.swift.moderationReports.reviewQueueFlaggedScore')
    }
  })

  it('does not export retired .NET agent-inspector messages', () => {
    const files = generateNativeResourceFiles()
    const dotnetEnglish = files.find(file => file.path.endsWith('/UiMessages.resx'))!

    for (const key of [
      'native.dotnet.engineering.agentConversationTitle',
      'native.dotnet.engineering.agentConversationsTitle',
      'native.swift.routeSurface.agentType',
      'native.swift.routeSurface.agentUser',
      'native.swift.routeSurface.created',
    ]) {
      expect(dotnetEnglish.content).not.toContain(`name="${key}"`)
    }
  })

  it('escapes resource values without changing their placeholders', () => {
    const catalogs = {
      en: structuredClone(enMessages),
      es: structuredClone(esMessages),
      fr: structuredClone(frMessages),
      pt: structuredClone(ptMessages),
    }
    for (const catalog of Object.values(catalogs)) {
      ;(catalog.common as { save: string }).save = 'Save "A&B" {name}'
    }
    const manifest = [
      { key: 'common.save', consumers: ['swift', 'dotnet'] },
    ] as const satisfies readonly NativeConsumerManifestEntry[]
    const files = generateNativeResourceFiles({ manifest, catalogs })

    expect(files.find(file => file.path.endsWith('.strings'))!.content).toContain(
      '"common.save" = "Save \\"A&B\\" {name}";',
    )
    expect(files.find(file => file.path.endsWith('.resx'))!.content).toContain(
      '<value>Save &quot;A&amp;B&quot; {name}</value>',
    )
  })

  it('rejects unknown catalog keys and incompatible locale placeholders', () => {
    const unknownManifest = [
      { key: 'missing.key', consumers: ['swift'] },
    ] as const satisfies readonly NativeConsumerManifestEntry[]
    expect(() => generateNativeResourceFiles({ manifest: unknownManifest })).toThrow(
      'Unknown native message key "missing.key"',
    )

    const catalogs = { ...CATALOGS, es: structuredClone(esMessages) }
    catalogs.es = {
      ...catalogs.es,
      common: { ...(catalogs.es.common as { save: string }), save: 'Guardar {value}' },
    }
    const manifest = [
      { key: 'common.save', consumers: ['swift'] },
    ] as const satisfies readonly NativeConsumerManifestEntry[]
    expect(() => generateNativeResourceFiles({ manifest, catalogs })).toThrow(
      'Placeholder mismatch for "common.save" in es',
    )
  })

  it('rejects an unsorted source manifest instead of masking it during generation', () => {
    const manifest = [
      { key: 'common.save', consumers: ['dotnet'] },
      { key: 'common.cancel', consumers: ['dotnet'] },
    ] as const satisfies readonly NativeConsumerManifestEntry[]

    expect(() => generateNativeResourceFiles({ manifest })).toThrow(
      'Native consumer manifest keys must be sorted',
    )
  })

  it('rejects catalog paths that continue through a leaf or stop at a namespace', () => {
    expect(() => getNativeCatalogLeaf({ parent: 'leaf' }, 'parent.child')).toThrow(
      'Native message key "parent.child" does not resolve to a catalog leaf',
    )
    expect(() => getNativeCatalogLeaf({ parent: { child: 'leaf' } }, 'parent')).toThrow(
      'Native message key "parent" resolves to a namespace, not a leaf',
    )
  })

  it('rejects duplicate native manifest keys', () => {
    expect(() =>
      validateNativeManifestCatalogs(
        [
          { key: 'test', consumers: ['swift'] },
          { key: 'test', consumers: ['dotnet'] },
        ],
        catalogsWith('Test'),
      ),
    ).toThrow('Native consumer manifest has duplicate keys')
  })

  it('rejects catalog leaf and descriptor signature mismatches', () => {
    const plural: MessageDescriptor = {
      kind: 'plural',
      valueParameter: 'count',
      numberParameters: ['count'],
      forms: ONE_OTHER,
    }
    const selectPlural: MessageDescriptor = {
      kind: 'select-plural',
      valueParameter: 'count',
      selectParameter: 'unit',
      numberParameters: ['count'],
      cases: { item: ONE_OTHER },
    }
    const manifest = [{ key: 'test', consumers: ['swift'] }] as const

    expect(() => validateNativeManifestCatalogs(manifest, catalogsWith('Test', plural))).toThrow(
      'Catalog leaf kind mismatch for "test" in es',
    )
    expect(() =>
      validateNativeManifestCatalogs(manifest, catalogsWith(plural, selectPlural)),
    ).toThrow('Message descriptor mismatch for "test" in es')
  })

  it('expands plain, plural, and select-plural native leaf variants', () => {
    expect(nativeLeafVariants('test', 'Test')).toEqual([['test', 'Test']])
    expect(
      nativeLeafVariants('test', {
        kind: 'plural',
        valueParameter: 'count',
        numberParameters: [],
        forms: ONE_OTHER,
      }),
    ).toEqual([
      ['test.__plural.one', '{count} item'],
      ['test.__plural.other', '{count} items'],
    ])
  })

  it('rejects native plural descriptors without a one form', () => {
    expect(() =>
      nativeLeafVariants('test', {
        kind: 'plural',
        valueParameter: 'count',
        forms: { other: '{count} items' },
      }),
    ).toThrow('Native message descriptor "test" must define a one form')
  })

  it('detects stale, missing, and extra generated files in check mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-native-localization-'))
    const files = generateNativeResourceFiles()
    try {
      await expect(
        writeNativeResourceFiles({ outputRoot: root, check: true, files }),
      ).rejects.toThrow('missing')
      await writeNativeResourceFiles({ outputRoot: root, check: false, files })
      await writeNativeResourceFiles({ outputRoot: root, check: true, files })

      const stale = files[0]!
      await writeFile(join(root, stale.path), 'stale')
      await expect(
        writeNativeResourceFiles({ outputRoot: root, check: true, files }),
      ).rejects.toThrow(`stale ${stale.path}`)

      await writeFile(join(root, stale.path), stale.content)
      const extra = join(
        root,
        'dotnet-clients/src/Voucha.Client.Core/Localization/Generated/extra.txt',
      )
      await mkdir(join(extra, '..'), { recursive: true })
      await writeFile(extra, 'extra')
      await expect(
        writeNativeResourceFiles({ outputRoot: root, check: true, files }),
      ).rejects.toThrow(
        'extra dotnet-clients/src/Voucha.Client.Core/Localization/Generated/extra.txt',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rethrows non-missing generated-file read errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-native-localization-read-error-'))
    const file = { path: 'blocked.txt', content: 'expected' }
    try {
      await mkdir(join(root, file.path))
      await expect(
        writeNativeResourceFiles({ outputRoot: root, check: true, files: [file] }),
      ).rejects.toMatchObject({ code: 'EISDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rethrows non-missing generated-directory listing errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-native-localization-list-error-'))
    const generatedRoot = join(root, 'swift-clients/ui/Sources/VouchaLocalization/Generated')
    try {
      await mkdir(join(generatedRoot, '..'), { recursive: true })
      await writeFile(generatedRoot, 'not a directory')
      await expect(
        writeNativeResourceFiles({ outputRoot: root, check: true, files: [] }),
      ).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
