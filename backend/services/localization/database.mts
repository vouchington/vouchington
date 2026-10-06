import {
  openLocalizationDatabase,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'

export const DEFAULT_LOCALIZATION_SQLITE_PATH = '/app/localization/catalog.sqlite'

export function localizationSqlitePath(): string {
  return process.env.LOCALIZATION_SQLITE_PATH ?? DEFAULT_LOCALIZATION_SQLITE_PATH
}

export function createLocalizationDatabaseOwner(path: () => string = localizationSqlitePath) {
  let cached: LocalizationDatabase | undefined
  function get(): LocalizationDatabase {
    if (cached) return cached
    cached = openLocalizationDatabase(path())
    return cached
  }
  function close(): void {
    cached?.close()
    cached = undefined
  }
  return { get, close }
}

const localizationDatabaseOwner = createLocalizationDatabaseOwner()

export function getLocalizationDatabase(): LocalizationDatabase {
  return localizationDatabaseOwner.get()
}
