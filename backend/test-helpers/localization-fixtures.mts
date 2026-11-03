import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CatalogMessage } from '@vouchington/localization'
import { compileLocalizationSqlite } from '@vouchington/localization-compiler'
import { vi } from 'vitest'

export async function createSampleLocalizationContext(
  messages: readonly CatalogMessage[] = sampleCatalogMessages(),
) {
  const directory = mkdtempSync(join(catalogScratchDirectory(), 'localization-'))
  const path = join(directory, 'catalog.sqlite')
  let database: { close(): void } | undefined
  let closed = false
  function close(): void {
    if (closed) return
    database?.close()
    rmSync(directory, { recursive: true, force: true })
    closed = true
  }
  try {
    const previousTmpdir = process.env.TMPDIR
    process.env.TMPDIR = directory
    try {
      compileLocalizationSqlite(messages, path)
    } finally {
      if (previousTmpdir === undefined) Reflect.deleteProperty(process.env, 'TMPDIR')
      else process.env.TMPDIR = previousTmpdir
    }
    // The production modules cache one SQLite handle per module instance, so each
    // context loads fresh instances that open the catalog named by the environment.
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', path)
    vi.resetModules()
    const databaseModule = await import('../services/localization/database.mts')
    const resolver = await import('../services/localization/resolve.mts')
    const opened = databaseModule.getLocalizationDatabase()
    database = opened
    return {
      path,
      database: opened,
      getLocalizationDatabase: databaseModule.getLocalizationDatabase,
      resolver,
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

function catalogScratchDirectory(): string {
  if (existsSync('/dev/shm')) return '/dev/shm'
  return process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir()
}
