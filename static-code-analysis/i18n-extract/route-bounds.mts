import assert from 'node:assert/strict'
import {
  canonicalJson,
  createLocalizationBatch,
  DEFAULT_LOCALIZATION_BOUNDS,
  leafForTranslation,
  parseDescriptor,
  serializeLocalizationBatch,
  type LocalizationBatch,
  type LocalizationBounds,
} from '@vouchington/localization'
import {
  resolveLocalizationBatch,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'

export type RouteBoundsEntry = Readonly<{
  pattern: string
  selectorId: string
  hasMembership: boolean
}>

export function verifyRouteBounds(
  database: LocalizationDatabase,
  routes: readonly RouteBoundsEntry[],
  chromeSelector: string,
  locales: readonly string[] = ['en-US', 'es', 'fr', 'pt'],
  bounds: LocalizationBounds = DEFAULT_LOCALIZATION_BOUNDS,
) {
  const routeRows = database.sqlite
    .prepare(
      `SELECT selector_id, alias FROM route_membership
         WHERE consumer = 'web'`,
    )
    .all() as { selector_id: string; alias: string }[]
  const translationRows = database.sqlite
    .prepare(
      `SELECT a.alias, c.id AS copy_id, c.descriptor_json, t.locale, t.value_json
         FROM consumer_aliases a
         JOIN copies c ON c.id = a.copy_id
         JOIN translations t ON t.copy_id = c.id
         WHERE a.consumer = 'web'`,
    )
    .all() as {
    alias: string
    copy_id: string
    descriptor_json: string
    locale: string
    value_json: string
  }[]
  const descriptors = new Map<string, ReturnType<typeof parseDescriptor>>()
  const values = new Map<string, Parameters<typeof leafForTranslation>[1]>()
  const messagesByCopyLocale = new Map<string, LocalizationBatch['messages'][string]>()
  const serializedMessagesByCopyLocale = new Map<string, string>()
  const serializedEntryBytes = new Map<string, number>()
  const bySelectorLocale = new Map<string, Record<string, LocalizationBatch['messages'][string]>>()
  const messagesByAliasLocale = new Map<string, LocalizationBatch['messages'][string]>()
  for (const row of translationRows) {
    let descriptor = descriptors.get(row.copy_id)
    if (descriptor === undefined) {
      descriptor = parseDescriptor(JSON.parse(row.descriptor_json))
      descriptors.set(row.copy_id, descriptor)
    }
    const translationKey = `${row.copy_id}:${row.locale}`
    let value: Parameters<typeof leafForTranslation>[1]
    if (values.has(translationKey)) {
      const cached = values.get(translationKey)
      if (cached === undefined) throw new Error(`Missing ${translationKey}`)
      value = cached
    } else {
      value = JSON.parse(row.value_json) as Parameters<typeof leafForTranslation>[1]
      values.set(translationKey, value)
    }
    let message = messagesByCopyLocale.get(translationKey)
    if (message === undefined) {
      message = leafForTranslation(descriptor, value)
      messagesByCopyLocale.set(translationKey, message)
    }
    messagesByAliasLocale.set(`${row.locale}:${row.alias}`, message)
    let serializedMessage = serializedMessagesByCopyLocale.get(translationKey)
    if (serializedMessage === undefined) {
      serializedMessage = canonicalJson(message)
      serializedMessagesByCopyLocale.set(translationKey, serializedMessage)
    }
    const serializedValueKey = `${row.locale}:${row.alias}`
    if (!serializedEntryBytes.has(serializedValueKey)) {
      const aliasJson = JSON.stringify(row.alias)
      serializedEntryBytes.set(
        serializedValueKey,
        Buffer.byteLength(aliasJson) + 1 + Buffer.byteLength(serializedMessage),
      )
    }
  }
  for (const row of routeRows) {
    for (const locale of locales) {
      const message = messagesByAliasLocale.get(`${locale}:${row.alias}`)
      if (message === undefined) throw new Error(`Missing ${locale}:${row.alias}`)
      const key = `${row.selector_id}:${locale}`
      const messages = bySelectorLocale.get(key) ?? {}
      messages[row.alias] = message
      bySelectorLocale.set(key, messages)
    }
  }
  const emptyBatchBytes = Buffer.byteLength(
    serializeLocalizationBatch(createLocalizationBatch(database.revision, 300, {})),
  )
  const serializedBatchBytes = (
    locale: string,
    messages: Record<string, LocalizationBatch['messages'][string]>,
  ) => {
    const aliases = Object.keys(messages)
    if (aliases.length === 0) return emptyBatchBytes
    let entryBytes = 0
    for (const alias of aliases) {
      const bytes = serializedEntryBytes.get(`${locale}:${alias}`)
      if (bytes === undefined) throw new Error(`Missing serialized ${locale}:${alias}`)
      entryBytes += bytes
    }
    return emptyBatchBytes + entryBytes + aliases.length - 1
  }
  const counts: number[] = []
  for (const route of routes) {
    for (const locale of locales) {
      const messages = {
        ...bySelectorLocale.get(`${chromeSelector}:${locale}`),
        ...bySelectorLocale.get(`${route.selectorId}:${locale}`),
      }
      const count = Object.keys(messages).length
      counts.push(count)
      if (count > bounds.maxMessages)
        throw new Error(`${route.pattern} (${locale}) has ${count} messages`)
      const bytes = serializedBatchBytes(locale, messages)
      if (bytes > bounds.maxBytes)
        throw new Error(`${route.pattern} (${locale}) has ${bytes} bytes`)
    }
  }
  assert.ok(Math.max(...counts) <= bounds.maxMessages)
  const login = routes.find(route => route.pattern === '/login')
  if (!login) throw new Error('Missing /login route')
  const resolved = resolveLocalizationBatch(database, {
    consumer: 'web',
    locales: ['en'],
    selectors: [chromeSelector, login.selectorId],
  })
  const expected = {
    ...bySelectorLocale.get(`${chromeSelector}:en-US`),
    ...bySelectorLocale.get(`${login.selectorId}:en-US`),
  }
  assert.deepEqual(resolved.messages, expected)
  assert.equal(
    serializedBatchBytes('en-US', expected),
    Buffer.byteLength(
      serializeLocalizationBatch(createLocalizationBatch(database.revision, 300, expected)),
    ),
  )
  return { counts, serializedBatchBytes }
}
