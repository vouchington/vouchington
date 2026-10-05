import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CatalogMessage } from '@vouchington/localization'
import { compileLocalizationSqlite } from '@vouchington/localization-compiler'
import { createLocalizationDatabaseOwner } from '../services/localization/database.mts'
import { createLocalizationResolver } from '../services/localization/resolve.mts'

export function createSampleLocalizationContext(
  messages: readonly CatalogMessage[] = sampleCatalogMessages(),
) {
  const directory = mkdtempSync(join(tmpdir(), 'localization-'))
  const path = join(directory, 'catalog.sqlite')
  const databaseOwner = createLocalizationDatabaseOwner(() => path)
  let closed = false
  function close(): void {
    if (closed) return
    databaseOwner.close()
    rmSync(directory, { recursive: true, force: true })
    closed = true
  }
  try {
    compileLocalizationSqlite(messages, path)
    const database = databaseOwner.get()
    return {
      path,
      database,
      resolver: createLocalizationResolver(databaseOwner.get),
      close,
    }
  } catch (err) {
    close()
    throw err
  }
}

function sampleCatalogMessages(): CatalogMessage[] {
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
