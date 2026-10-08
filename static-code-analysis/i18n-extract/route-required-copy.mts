import assert from 'node:assert/strict'
import {
  resolveLocalizationBatch,
  type LocalizationDatabase,
} from '@vouchington/localization-compiler'
import type { RouteBoundsEntry } from './route-bounds.mts'

export function verifyRequiredRouteCopy(
  database: LocalizationDatabase,
  routes: readonly RouteBoundsEntry[],
  chromeSelector: string,
  staffActionAliases: readonly string[],
) {
  const resolve = (pattern: string) => {
    const route = routes.find(entry => entry.pattern === pattern)
    assert.ok(route, `Missing ${pattern} route`)
    return resolveLocalizationBatch(database, {
      consumer: 'web',
      locales: ['en'],
      selectors: [chromeSelector, route.selectorId],
    }).messages
  }
  const requireAliases = (pattern: string, aliases: readonly string[]) => {
    const messages = resolve(pattern)
    for (const alias of aliases)
      assert.ok(Object.hasOwn(messages, alias), `Missing ${pattern}: ${alias}`)
  }
  requireAliases('/plans', [
    'extracted.memberships.benefitCatalog.access_0c11c1a5',
    'extracted.memberships.benefitCatalog.supportServiceLevelTooltip_0c11c1c2',
  ])
  requireAliases('/oauth/consent', ['shared.oauth.consent.title', 'shared.oauth.consent.allow'])
  for (const [pattern, alias] of [
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
  ])
    requireAliases(pattern!, [alias!])
  assert.ok(staffActionAliases.length > 0)
  for (const pattern of [
    '/moderation-transparency',
    '/communities/[slug]/settings/moderation/analytics',
  ])
    requireAliases(pattern, staffActionAliases)
  const chrome = resolveLocalizationBatch(database, {
    consumer: 'web',
    locales: ['en'],
    selectors: [chromeSelector],
  })
  for (const alias of [
    'extracted.app.forbidden.accessDenied_cc11d415',
    'extracted.app.unauthorized.signInRequired_255346f2',
    'extracted.components.keyboardShortcutsDialog.viewAllShortcuts_8576e656',
  ])
    assert.ok(Object.hasOwn(chrome.messages, alias), `Missing chrome: ${alias}`)
  const empty = routes.find(route => !route.hasMembership)
  assert.ok(empty, 'Missing empty route selector')
  const knownEmpty = resolveLocalizationBatch(database, {
    consumer: 'web',
    locales: ['en'],
    selectors: [chromeSelector, empty.selectorId],
  })
  assert.deepEqual(knownEmpty.messages, chrome.messages)
  const unknown = resolveLocalizationBatch(database, {
    consumer: 'web',
    locales: ['en'],
    selectors: [chromeSelector, 'web.route.ffffffffffffffff.ffffffffffffffff'],
  })
  assert.deepEqual(unknown.messages, {})
  return [
    'includes plan benefit copy assembled from finite keys',
    'includes OAuth consent copy in the consent route selector',
    'includes dynamically imported copy on /login',
    'includes dynamically imported copy on /growth',
    'includes dynamically imported copy on /admin/moderation-analytics',
    'includes dynamically imported copy on /communities/[slug]',
    'includes dynamically imported copy on /topic-recommendations',
    'delivers every staff action label the transparency panel renders on /moderation-transparency',
    'delivers every staff action label the transparency panel renders on /communities/[slug]/settings/moderation/analytics',
    'keeps global status and navbar dialog copy in chrome',
    'distinguishes a known empty route from an unknown exact selector',
  ]
}
