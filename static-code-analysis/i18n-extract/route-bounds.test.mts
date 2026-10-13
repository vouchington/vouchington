import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compileLocalizationSqlite,
  openLocalizationDatabase,
  resolveLocalizationBatch,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'
import {
  createLocalizationBatch,
  serializeLocalizationBatch,
  DEFAULT_LOCALIZATION_BOUNDS,
} from '@vouchington/localization'
import { createRouteLocalizationFixture } from '../route-localization-fixtures.mts'
import { verifyRouteBounds } from './route-bounds.mts'

const fixture = createRouteLocalizationFixture()
describe('web route localization bounds', () => {
  let database: LocalizationDatabase
  let scratch: string
  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'vouchington-web-route-bounds-'))
    const sqlitePath = join(scratch, 'catalog.sqlite')
    compileLocalizationSqlite(fixture.catalog, sqlitePath)
    database = openLocalizationDatabase(sqlitePath)
  })
  afterAll(async () => {
    try {
      database?.close()
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true })
    }
  })
  it('resolves every generated route and locale through the real SQLite catalog', () => {
    expect(fixture.routes).toHaveLength(10)
    expect(new Set(fixture.routes.map(route => route.selectorId)).size).toBe(10)
    const report = verifyRouteBounds(database, fixture.routes, fixture.chromeSelector)
    expect(report.counts).toHaveLength(40)
    expect(Math.max(...report.counts)).toBeLessThanOrEqual(DEFAULT_LOCALIZATION_BOUNDS.maxMessages)
    const login = fixture.routes.find(route => route.pattern === '/login')!
    const combined = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector, login.selectorId],
    })
    const chrome = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector],
    })
    const route = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [login.selectorId],
    })
    expect(combined.messages).toEqual({ ...chrome.messages, ...route.messages })
    const exactBytes = Buffer.byteLength(
      serializeLocalizationBatch(
        createLocalizationBatch(database.revision, 300, combined.messages),
      ),
    )
    expect(report.serializedBatchBytes('en-US', combined.messages)).toBe(exactBytes)
    expect(() =>
      verifyRouteBounds(database, fixture.routes, fixture.chromeSelector, ['en-US'], {
        ...DEFAULT_LOCALIZATION_BOUNDS,
        maxMessages: 1,
      }),
    ).toThrow('messages')
    expect(() =>
      verifyRouteBounds(database, fixture.routes, fixture.chromeSelector, ['en-US'], {
        ...DEFAULT_LOCALIZATION_BOUNDS,
        maxBytes: 1,
      }),
    ).toThrow('bytes')
  })
  it('includes plan benefit copy assembled from finite keys', () => {
    const plans = fixture.routes.find(route => route.pattern === '/plans')
    if (!plans) throw new Error('Missing /plans route')
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector, plans.selectorId],
    })
    expect(batch.messages).toHaveProperty('extracted.memberships.benefitCatalog.access_0c11c1a5')
    expect(batch.messages).toHaveProperty(
      'extracted.memberships.benefitCatalog.supportServiceLevelTooltip_0c11c1c2',
    )
  })

  it('includes OAuth consent copy in the consent route selector', () => {
    const consent = fixture.routes.find(route => route.pattern === '/oauth/consent')
    if (!consent) throw new Error('Missing /oauth/consent route')
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector, consent.selectorId],
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
    const route = fixture.routes.find(entry => entry.pattern === pattern)
    if (!route) throw new Error(`Missing ${pattern} route`)
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector, route.selectorId],
    })
    expect(batch.messages).toHaveProperty(alias)
  })

  it.each(['/moderation-transparency', '/communities/[slug]/settings/moderation/analytics'])(
    'delivers every staff action label the transparency panel renders on %s',
    pattern => {
      const route = fixture.routes.find(entry => entry.pattern === pattern)
      if (!route) throw new Error(`Missing ${pattern} route`)
      const aliases = fixture.staffActionAliases
      const batch = resolveLocalizationBatch(database, {
        consumer: 'web',
        locales: ['en'],
        selectors: [fixture.chromeSelector, route.selectorId],
      })
      expect(aliases.length).toBeGreaterThan(0)
      for (const alias of aliases) expect(batch.messages).toHaveProperty([alias])
    },
  )

  it('keeps global status and navbar dialog copy in chrome', () => {
    const batch = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector],
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
    const empty = fixture.routes.find(route => !route.hasMembership)
    if (!empty) throw new Error('Missing empty route selector')
    const chrome = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector],
    })
    const knownEmpty = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector, empty.selectorId],
    })
    expect(knownEmpty.messages).toEqual(chrome.messages)
    const unknown = resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [fixture.chromeSelector, 'web.route.ffffffffffffffff.ffffffffffffffff'],
    })
    expect(unknown.messages).toEqual({})
  })
})
