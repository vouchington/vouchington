import {
  openLocalizationDatabase,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'

const DEFAULT_LOCALIZATION_SQLITE_PATH = '/app/localization/catalog.sqlite'

export function localizationSqlitePath(): string {
  return process.env.LOCALIZATION_SQLITE_PATH ?? DEFAULT_LOCALIZATION_SQLITE_PATH
}

let cached: LocalizationDatabase | undefined

export function getLocalizationDatabase(): LocalizationDatabase {
  cached ??= openLocalizationDatabase(localizationSqlitePath())
  return cached
}
