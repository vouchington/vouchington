import {
  openLocalizationDatabase,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'

export const DEFAULT_LOCALIZATION_SQLITE_PATH = '/app/localization/catalog.sqlite'

let cached: LocalizationDatabase | undefined

export function localizationSqlitePath(): string {
  return process.env.LOCALIZATION_SQLITE_PATH ?? DEFAULT_LOCALIZATION_SQLITE_PATH
}

export function getLocalizationDatabase(): LocalizationDatabase {
  if (cached) return cached
  cached = openLocalizationDatabase(localizationSqlitePath())
  return cached
}

export function setLocalizationDatabaseForTests(database: LocalizationDatabase | undefined): void {
  cached?.close()
  cached = database
}
