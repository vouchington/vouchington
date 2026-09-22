import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  createLocalizationBatch,
  DEFAULT_LOCALIZATION_BOUNDS,
  leafForTranslation,
  parseDescriptor,
  serializeLocalizationBatch,
  type LocalizationBatch,
} from '@vouchington/localization'
import {
  compileLocalizationSqlite,
  loadCatalogDirectory,
  openLocalizationDatabase,
  resolveLocalizationBatch,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'
import {
  ROUTE_SELECTORS,
  WEB_CHROME_SELECTOR,
} from '../../web/lib/i18n/route-selectors.generated.mts'

describe('web route localization bounds', () => {
  let database: LocalizationDatabase
  let scratch: string

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'filaments-web-route-bounds-'))
    const source = join(import.meta.dirname, '../../localization/catalog')
    const { catalog } = await loadCatalogDirectory(source)
    const sqlitePath = join(scratch, 'catalog.sqlite')
    compileLocalizationSqlite(catalog, sqlitePath)
    database = openLocalizationDatabase(sqlitePath)
  }, 240_000)

  afterAll(async () => {
    database?.close()
    if (scratch) await rm(scratch, { recursive: true, force: true })
  })

  it('resolves every generated route and locale through the real SQLite catalog', () => {
    const locales = ['en-US', 'es', 'fr', 'pt'] as const
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
    const bySelectorLocale = new Map<
      string,
      Record<string, LocalizationBatch['messages'][string]>
    >()
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
    expect(ROUTE_SELECTORS).toHaveLength(420)
    expect(new Set(ROUTE_SELECTORS.map(route => route.selectorId)).size).toBe(420)
    for (const route of ROUTE_SELECTORS) {
      for (const locale of locales) {
        const messages = {
          ...bySelectorLocale.get(`${WEB_CHROME_SELECTOR}:${locale}`),
          ...bySelectorLocale.get(`${route.selectorId}:${locale}`),
        }
        const count = Object.keys(messages).length
        counts.push(count)
        if (count > DEFAULT_LOCALIZATION_BOUNDS.maxMessages)
          throw new Error(`${route.pattern} (${locale}) has ${count} messages`)
        const bytes = serializedBatchBytes(locale, messages)
        if (bytes > DEFAULT_LOCALIZATION_BOUNDS.maxBytes)
          throw new Error(`${route.pattern} (${locale}) has ${bytes} bytes`)
      }
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(DEFAULT_LOCALIZATION_BOUNDS.maxMessages)
    const login = ROUTE_SELECTORS.find(route => route.pattern === '/login')
    if (!login) throw new Error('Missing /login route')
    const resolved = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR, login.selectorId],
    })
    const expected = {
      ...bySelectorLocale.get(`${WEB_CHROME_SELECTOR}:en-US`),
      ...bySelectorLocale.get(`${login.selectorId}:en-US`),
    }
    expect(resolved.messages).toEqual(expected)
    expect(serializedBatchBytes('en-US', expected)).toBe(
      Buffer.byteLength(
        serializeLocalizationBatch(createLocalizationBatch(database.revision, 300, expected)),
      ),
    )
  }, 240_000)

  it('includes plan benefit copy assembled from finite keys', () => {
    const plans = ROUTE_SELECTORS.find(route => route.pattern === '/plans')
    if (!plans) throw new Error('Missing /plans route')
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR, plans.selectorId],
    })
    expect(batch.messages).toHaveProperty('extracted.memberships.benefitCatalog.access_0c11c1a5')
    expect(batch.messages).toHaveProperty(
      'extracted.memberships.benefitCatalog.supportServiceLevelTooltip_0c11c1c2',
    )
  })

  it('includes OAuth consent copy in the consent route selector', () => {
    const consent = ROUTE_SELECTORS.find(route => route.pattern === '/oauth/consent')
    if (!consent) throw new Error('Missing /oauth/consent route')
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR, consent.selectorId],
    })
    expect(batch.messages).toHaveProperty('shared.oauth.consent.title')
    expect(batch.messages).toHaveProperty('shared.oauth.consent.allow')
  })

  it.each([
    ['/login', 'extracted.auth.mfaStep.invalidVerificationCode_4ed23ad3'],
    ['/growth', 'extracted.growth.contentHealth.contentHealth_845ce9e6'],
    [
      '/admin/moderation-analytics',
      'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodActions_2acb9bc4',
    ],
    ['/communities/[slug]', 'extracted.communities.joinButton.join_fd30fe68'],
    [
      '/topic-recommendations',
      'extracted.topicRecommendations.topicRecommendationsTable.recommendation_bc92e0e3',
    ],
  ])('includes dynamically imported copy on %s', (pattern, alias) => {
    const route = ROUTE_SELECTORS.find(entry => entry.pattern === pattern)
    if (!route) throw new Error(`Missing ${pattern} route`)
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR, route.selectorId],
    })
    expect(batch.messages).toHaveProperty(alias)
  })

  it('keeps global status and navbar dialog copy in chrome', () => {
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR],
    })
    for (const alias of [
      'extracted.app.forbidden.accessDenied_cc11d415',
      'extracted.app.unauthorized.signInRequired_255346f2',
      'extracted.components.keyboardShortcutsDialog.viewAllShortcuts_8576e656',
    ]) {
      expect(batch.messages).toHaveProperty(alias)
    }
  })

  it('distinguishes a known empty route from an unknown exact selector', () => {
    const empty = ROUTE_SELECTORS.find(route => !route.hasMembership)
    if (!empty) throw new Error('Missing empty route selector')
    const chrome = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR],
    })
    const knownEmpty = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR, empty.selectorId],
    })
    expect(knownEmpty.messages).toEqual(chrome.messages)
    const unknown = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [WEB_CHROME_SELECTOR, 'web.route.ffffffffffffffff.ffffffffffffffff'],
    })
    expect(unknown.messages).toEqual({})
  })
})
