import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CatalogMessage } from '@vouchington/localization'
import {
  compileLocalizationSqlite,
  openLocalizationDatabase,
} from '@vouchington/localization-compiler'
import { setLocalizationDatabaseForTests } from './database.mts'

export function sampleCatalogMessages(): CatalogMessage[] {
  return [
    {
      id: 'nav.home',
      descriptor: null,
      consumers: ['web', 'swift'],
      translations: { 'en-US': 'Home', es: 'Inicio' },
    },
    {
      id: 'nav.search',
      descriptor: null,
      consumers: ['web'],
      translations: { 'en-US': 'Search' },
    },
    {
      id: 'settings.count',
      descriptor: { kind: 'plural', valueParameter: 'count' },
      consumers: ['web', 'dotnet'],
      translations: {
        'en-US': { one: '{count} item', other: '{count} items' },
      },
    },
    {
      id: 'email.welcome.preview',
      descriptor: null,
      consumers: ['email'],
      translations: { 'en-US': 'Welcome to Voucha' },
    },
  ]
}

export function installSampleLocalizationDatabase(
  messages: readonly CatalogMessage[] = sampleCatalogMessages(),
): string {
  const directory = mkdtempSync(join(tmpdir(), 'localization-'))
  const path = join(directory, 'catalog.sqlite')
  compileLocalizationSqlite(messages, path)
  setLocalizationDatabaseForTests(openLocalizationDatabase(path))
  return path
}
