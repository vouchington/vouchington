import {
  chromeSelectorId,
  routeSelectorId,
  type LocalizationCatalog,
} from '@vouchington/localization'

export function createRouteLocalizationFixture() {
  const chromeAliases = [
    'extracted.app.forbidden.accessDenied_cc11d415',
    'extracted.app.unauthorized.signInRequired_255346f2',
    'extracted.components.keyboardShortcutsDialog.viewAllShortcuts_8576e656',
  ]
  const chromeSelector = chromeSelectorId(chromeAliases)
  const memberships: Readonly<Record<string, readonly string[]>> = {
    '/plans': [
      'extracted.memberships.benefitCatalog.access_0c11c1a5',
      'extracted.memberships.benefitCatalog.supportServiceLevelTooltip_0c11c1c2',
    ],
    '/oauth/consent': ['shared.oauth.consent.title', 'shared.oauth.consent.allow'],
    '/login': ['extracted.auth.mfaStep.invalidVerificationCode_4ed23ad3'],
    '/growth': ['extracted.growth.contentHealth.contentHealth_845ce9e6'],
    '/admin/moderation-analytics': [
      'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodActions_2acb9bc4',
    ],
    '/communities/[slug]': ['extracted.communities.joinButton.join_fd30fe68'],
    '/topic-recommendations': [
      'extracted.topicRecommendations.topicRecommendationsTable.recommendation_bc92e0e3',
    ],
    '/moderation-transparency': ['moderation.staffActions.fixture'],
    '/communities/[slug]/settings/moderation/analytics': ['moderation.staffActions.fixture'],
    '/empty': [],
  }
  const routes = Object.entries(memberships).map(([pattern, aliases]) => ({
    pattern,
    selectorId: routeSelectorId(pattern, aliases),
    hasMembership: aliases.length > 0,
  }))
  const aliases = [...new Set([...chromeAliases, ...Object.values(memberships).flat()])]
  const catalog: LocalizationCatalog = {
    copies: [{ id: 'fixture.copy', descriptor: null }],
    aliases: aliases.map(alias => ({ consumer: 'web', alias, copyId: 'fixture.copy' })),
    translations: Object.fromEntries(
      ['en-US', 'es', 'fr', 'pt'].map(locale => [
        locale,
        [{ id: 'fixture.copy', value: `Fixture ${locale}` }],
      ]),
    ),
    routeSelectors: [
      { consumer: 'web', selectorId: chromeSelector },
      ...routes.map(route => ({ consumer: 'web' as const, selectorId: route.selectorId })),
    ],
    routeMembership: [
      ...chromeAliases.map(alias => ({
        consumer: 'web' as const,
        selectorId: chromeSelector,
        alias,
      })),
      ...routes.flatMap(route =>
        memberships[route.pattern]!.map(alias => ({
          consumer: 'web' as const,
          selectorId: route.selectorId,
          alias,
        })),
      ),
    ],
  }
  const sourceRouteRows = [
    ...chromeAliases.map(alias => ({ consumer: 'web', pattern: 'web.chrome', alias })),
    ...Object.entries(memberships).flatMap(([pattern, aliases]) =>
      aliases.length
        ? aliases.map(alias => ({ consumer: 'web', pattern, alias }))
        : [{ consumer: 'web', pattern }],
    ),
  ]
  return {
    sourceRouteRows,
    catalog,
    routes,
    chromeSelector,
    staffActionAliases: ['moderation.staffActions.fixture'],
  }
}
