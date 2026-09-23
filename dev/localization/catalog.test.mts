import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadCatalogDirectory,
  openLocalizationDatabase,
  resolveLocalizationBatch,
} from '@vouchington/localization-compiler'
import { serializeCatalogTable } from '@vouchington/localization'
import { compileCatalogDirectory } from '../../backend/services/localization/compile-catalog.mts'
import { runCatalogCli } from './catalog.mts'

async function withTemp<T>(prefix: string, run: (directory: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  try {
    return await run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('normalized catalog commands', () => {
  it('updates each table by row, formats the source, and round-trips CSV', () =>
    withTemp('normalized-catalog-', async source => {
      cpSync('localization/normalized-fixture', source, { recursive: true })

      const descriptor = { kind: 'plural', valueParameter: 'count' }
      const about = { other: 'About' }
      const aliasSet = (consumer: string) => [
        'alias-set',
        '--source',
        source,
        '--consumer',
        consumer,
        '--alias',
        'fixture.nav.about',
        '--copy-id',
        'copy.fixture.about',
      ]
      await runCatalogCli([
        'copy-set',
        '--source',
        source,
        '--id',
        'copy.fixture.about',
        '--descriptor',
        JSON.stringify(descriptor),
      ])
      await runCatalogCli(['copy-set', '--source', source, '--id', 'copy.fixture.home'])
      await runCatalogCli([
        'translation-set',
        '--source',
        source,
        '--locale',
        'en-US',
        '--id',
        'copy.fixture.about',
        '--value',
        JSON.stringify(about),
      ])
      await runCatalogCli(aliasSet('web'))
      await runCatalogCli(aliasSet('dotnet'))
      const { catalog } = await loadCatalogDirectory(source)
      expect(catalog.copies).toContainEqual({ id: 'copy.fixture.about', descriptor })
      expect(catalog.copies).toContainEqual({ id: 'copy.fixture.home', descriptor: null })
      expect(catalog.translations['en-US']).toContainEqual({
        id: 'copy.fixture.about',
        value: about,
      })
      expect(catalog.aliases).toEqual(
        expect.arrayContaining([
          { consumer: 'web', alias: 'fixture.nav.about', copyId: 'copy.fixture.about' },
          { consumer: 'dotnet', alias: 'fixture.nav.about', copyId: 'copy.fixture.about' },
        ]),
      )

      const aliases = join(source, 'aliases.json')
      const staleAliases = readFileSync(aliases, 'utf8').replaceAll('\n', '')
      writeFileSync(aliases, staleAliases)
      await runCatalogCli(['format', '--source', source])
      expect(readFileSync(aliases, 'utf8')).not.toBe(staleAliases)

      writeFileSync(
        join(source, 'routes.json'),
        serializeCatalogTable([
          { consumer: 'web', selectorId: 'fixture.route.home', alias: 'fixture.nav.home' },
        ]),
      )
      const csv = join(source, 'catalog.csv')
      const imported = join(source, 'imported')
      await runCatalogCli(['csv-export', '--source', source, '--output', csv])
      await runCatalogCli(['csv-import', '--input', csv, '--output', imported])
      const staleLocale = join(imported, 'translations', 'fr.json')
      writeFileSync(
        staleLocale,
        serializeCatalogTable([{ id: 'copy.fixture.home', value: 'Accueil' }]),
      )
      await runCatalogCli(['csv-import', '--input', csv, '--output', imported])
      expect(existsSync(staleLocale)).toBe(false)
      const authored = (await loadCatalogDirectory(source)).catalog
      const roundTripped = (await loadCatalogDirectory(imported)).catalog
      expect(roundTripped.copies).toEqual(authored.copies)
      expect(roundTripped.aliases).toEqual(authored.aliases)
      expect(roundTripped.translations).toEqual(authored.translations)
      expect(roundTripped.routeMembership).toEqual([])

      await expect(
        runCatalogCli(['alias-remove', '--source', source, '--id', 'fixture.nav.about']),
      ).rejects.toThrow('Usage:')

      await runCatalogCli([
        'alias-remove',
        '--source',
        source,
        '--consumer',
        'web',
        '--id',
        'fixture.nav.about',
      ])
      expect((await loadCatalogDirectory(source)).catalog.aliases).toEqual(
        expect.arrayContaining([
          { consumer: 'dotnet', alias: 'fixture.nav.about', copyId: 'copy.fixture.about' },
        ]),
      )
      await runCatalogCli([
        'alias-remove',
        '--source',
        source,
        '--consumer',
        'dotnet',
        '--id',
        'fixture.nav.about',
      ])
      await runCatalogCli([
        'translation-remove',
        '--source',
        source,
        '--locale',
        'en-US',
        '--id',
        'copy.fixture.about',
      ])
      await runCatalogCli(['copy-remove', '--source', source, '--id', 'copy.fixture.about'])
      await runCatalogCli([
        'alias-remove',
        '--source',
        source,
        '--consumer',
        'web',
        '--id',
        'fixture.nav.about',
      ])
      await runCatalogCli([
        'translation-remove',
        '--source',
        source,
        '--locale',
        'en-US',
        '--id',
        'copy.fixture.about',
      ])
      await runCatalogCli(['copy-remove', '--source', source, '--id', 'copy.fixture.about'])
      expect((await loadCatalogDirectory(source)).catalog.aliases).toHaveLength(1)
      expect((await loadCatalogDirectory(source)).catalog.copies).toHaveLength(1)
    }))

  it('compiles the normalized fixture through Vouchington and resolves the public alias', () =>
    withTemp('normalized-compile-', async directory => {
      const source = join(directory, 'source')
      cpSync('localization/normalized-fixture', source, { recursive: true })
      const output = join(directory, 'catalog.sqlite')
      await compileCatalogDirectory(source, output)
      const database = openLocalizationDatabase(output)
      try {
        const batch = resolveLocalizationBatch(database, {
          consumer: 'web',
          locales: ['en'],
          selectors: ['fixture.nav.*'],
        })
        expect(batch.messages['fixture.nav.home']).toBe('Home')
      } finally {
        database.close()
      }
    }))

  it('merges distinct alias rows and exposes an actionable same-row conflict', () =>
    withTemp('normalized-merge-', async directory => {
      const [base, ours, theirs] = ['base.tmp', 'ours.tmp', 'theirs.tmp'].map(name =>
        join(directory, name),
      )
      const first = { consumer: 'web', alias: 'fixture.nav.home', copyId: 'copy.fixture.home' }
      const second = { consumer: 'web', alias: 'fixture.nav.about', copyId: 'copy.fixture.about' }
      writeFileSync(base!, serializeCatalogTable([first]))
      writeFileSync(ours!, serializeCatalogTable([first, second]))
      writeFileSync(theirs!, serializeCatalogTable([first]))
      await runCatalogCli([
        'git-merge',
        base!,
        ours!,
        theirs!,
        '--path',
        'localization/catalog/aliases.json',
      ])
      expect(readFileSync(ours!, 'utf8')).toContain('fixture.nav.about')

      writeFileSync(
        ours!,
        serializeCatalogTable([{ ...first, copyId: 'copy.fixture.left' }, second]),
      )
      writeFileSync(theirs!, serializeCatalogTable([{ ...first, copyId: 'copy.fixture.right' }]))
      await expect(
        runCatalogCli([
          'git-merge',
          base!,
          ours!,
          theirs!,
          '--path',
          'localization/catalog/aliases.json',
        ]),
      ).rejects.toBeInstanceOf(Error)
      await runCatalogCli([
        'conflict-resolve',
        '--file',
        ours!,
        '--id',
        'fixture.nav.home',
        '--consumer',
        'web',
        '--take',
        'ours',
      ])
      expect(readFileSync(ours!, 'utf8')).toBe(
        serializeCatalogTable([{ ...first, copyId: 'copy.fixture.left' }, second]),
      )
    }))
})
