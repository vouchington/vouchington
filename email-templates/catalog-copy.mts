import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aliasEnglishLocale,
  firstAvailableTranslation,
  leafForTranslation,
  type CatalogMessage,
  type LocalizationLeaf,
} from '@vouchington/localization'
import type { LocalizationDatabase } from '@vouchington/localization-compiler'
import { loadEmailCatalogMessages } from './catalog-json.mts'

export { emailMessagesFromCatalog, loadEmailCatalogMessages } from './catalog-json.mts'

export type EmailVars = Readonly<Record<string, string | number>>
export type EmailTranslator = (key: string, vars?: EmailVars) => string

const EMAIL_SELECTOR = 'email.*'
const EMAIL_CATALOG_DIRECTORY = resolveEmailCatalogDirectory()
const PLACEHOLDER = /\{([\w.-]+)\}/g
const pluralRules = new Map<string, Intl.PluralRules>()
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
  const prefix = `email.${family}.`
  const messages = emailLeaves(locale)
  return (key, vars) => {
    const id = `${prefix}${key}`
    const leaf = messages[id]
    if (leaf === undefined) throw new TypeError(`Missing email message "${id}"`)
    return formatLocalizationLeaf(leaf, locale, vars)
  }
}

export function emailOptional(
  translate: EmailTranslator,
  key: string,
  value: string | undefined,
  param = 'userName',
): string {
  return value === undefined || value.length === 0
    ? translate(`${key}.unnamed`)
    : translate(key, { [param]: value })
}

export function formatLocalizationLeaf(
  leaf: LocalizationLeaf,
  locale: string,
  vars: EmailVars = {},
): string {
  if (typeof leaf === 'string') return interpolate(leaf, vars)
  const tag = aliasEnglishLocale(locale)
  const count = Number(vars[leaf.valueParameter])
  if (!Number.isFinite(count)) {
    throw new TypeError(`Message requires numeric "${leaf.valueParameter}"`)
  }
  const category = pluralRule(tag).select(count)
  if (leaf.kind === 'plural') {
    return interpolate(leaf.forms[category] ?? leaf.forms.other, {
      ...vars,
      [leaf.valueParameter]: count,
    })
  }
  const selection = String(vars[leaf.selectParameter] ?? '')
  const forms = leaf.cases[selection]
  if (forms === undefined) {
    throw new TypeError(`Message has no case "${selection}"`)
  }
  return interpolate(forms[category] ?? forms.other, {
    ...vars,
    [leaf.valueParameter]: count,
  })
}

function interpolate(template: string, vars: EmailVars): string {
  return template.replaceAll(PLACEHOLDER, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

function pluralRule(locale: string): Intl.PluralRules {
  const existing = pluralRules.get(locale)
  if (existing) return existing
  const created = new Intl.PluralRules(locale)
  pluralRules.set(locale, created)
  return created
}

function emailLeaves(locale: string): Readonly<Record<string, LocalizationLeaf>> {
  const cached = batches.get(locale)
  if (cached) return cached
  const sqlite = sqlitePath()
  const messages = sqlite === undefined ? jsonLeaves(locale) : sqliteLeaves(sqlite, locale)
  batches.set(locale, messages)
  return messages
}

export function leavesFromCatalog(
  messages: readonly CatalogMessage[],
  locale: string,
): Record<string, LocalizationLeaf> {
  const locales = locale === 'en' ? ['en-US'] : [aliasEnglishLocale(locale), 'en-US']
  const leaves: Record<string, LocalizationLeaf> = {}
  for (const message of messages) {
    const value = firstAvailableTranslation(locales, message.translations)
    if (value === undefined) continue
    leaves[message.id] = leafForTranslation(message.descriptor, value)
  }
  return leaves
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
