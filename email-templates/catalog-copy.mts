import {
  createEmailTranslator,
  leavesFromCatalog,
  loadEmailCatalogMessages,
  type EmailTranslator,
} from '@vouchington/email'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CatalogMessage, LocalizationLeaf } from '@vouchington/localization'
import type { LocalizationDatabase } from '@vouchington/localization-compiler'

const EMAIL_SELECTOR = 'email.*'
const EMAIL_CATALOG_DIRECTORY = resolveEmailCatalogDirectory()
const require = createRequire(import.meta.url)

const batches = new Map<string, Readonly<Record<string, LocalizationLeaf>>>()
let jsonMessages: CatalogMessage[] | undefined
let database: LocalizationDatabase | undefined
let databasePath: string | undefined

export function resolveEmailCatalogDirectory(moduleUrl = import.meta.url): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl))
  const packageDirectory =
    basename(moduleDirectory) === 'dist' ? dirname(moduleDirectory) : moduleDirectory
  return join(packageDirectory, '..', 'localization', 'catalog')
}

export function resetEmailCatalogCache(): void {
  batches.clear()
  jsonMessages = undefined
  database?.close()
  database = undefined
  databasePath = undefined
}

export function emailCopy(locale: string, family: string): EmailTranslator {
  return createEmailTranslator(emailLeaves(locale), locale, family)
}

function emailLeaves(locale: string): Readonly<Record<string, LocalizationLeaf>> {
  const cached = batches.get(locale)
  if (cached) return cached
  const sqlite = sqlitePath()
  const messages = sqlite === undefined ? jsonLeaves(locale) : sqliteLeaves(sqlite, locale)
  batches.set(locale, messages)
  return messages
}

function sqlitePath(): string | undefined {
  const fromEnv = process.env.LOCALIZATION_SQLITE_PATH
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  return undefined
}

function sqliteLeaves(path: string, locale: string): Readonly<Record<string, LocalizationLeaf>> {
  if (!existsSync(path)) {
    throw new Error(`Localization sqlite is missing at ${path}`)
  }
  if (databasePath !== path || database === undefined) {
    database?.close()
    const { openLocalizationDatabase } =
      require('@vouchington/localization-compiler') as typeof import('@vouchington/localization-compiler')
    database = openLocalizationDatabase(path)
    databasePath = path
  }
  const { resolveLocalizationBatch } =
    require('@vouchington/localization-compiler') as typeof import('@vouchington/localization-compiler')
  return resolveLocalizationBatch(database, {
    consumer: 'email',
    locales: locale === 'en' ? ['en'] : [locale, 'en'],
    selectors: [EMAIL_SELECTOR],
  }).messages
}

function jsonLeaves(locale: string): Readonly<Record<string, LocalizationLeaf>> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Email copy requires LOCALIZATION_SQLITE_PATH in production')
  }
  return leavesFromCatalog(loadJsonMessages(), locale)
}

function loadJsonMessages(): CatalogMessage[] {
  if (jsonMessages) return jsonMessages
  jsonMessages = loadEmailCatalogMessages(EMAIL_CATALOG_DIRECTORY)
  return jsonMessages
}
