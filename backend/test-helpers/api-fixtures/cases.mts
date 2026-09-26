import { engineeringOpsApiFixtureCases } from './engineering-ops-cases.mts'
import { dynamicConfigApiFixtureCases } from './dynamic-config-cases.mts'
import { nativeDomainUrlApiFixtureCases } from './native-domain-url-cases.mts'
import { nativePaidCrawlApiFixtureCases } from './native-paid-crawl-cases.mts'
import { nativeCopyrightApiFixtureCases } from './native-copyright-cases.mts'
import { nativeHouseholdApiFixtureCases } from './native-household-cases.mts'
import { nativeCardApiFixtureCases } from './native-card-cases.mts'
import { nativePointValuationApiFixtureCases } from './native-point-valuation-cases.mts'
import { nativeSpendingCategoryApiFixtureCases } from './native-spending-category-cases.mts'
import { nativeRewardsStatusApiFixtureCases } from './native-rewards-status-cases.mts'
import { nativeHouseholdPaginationApiFixtureCases } from './native-household-pagination-cases.mts'
import { nativeAccountPaginationApiFixtureCases } from './native-account-pagination-cases.mts'
import { nativeCommentThreadApiFixtureCases } from './native-comment-thread-cases.mts'
import { nativeCommentAncestorPaginationApiFixtureCases } from './native-comment-ancestor-pagination-cases.mts'
import { nativeLandingPageApiFixtureCases } from './native-landing-page-cases.mts'
import { nativeListApiFixtureCases } from './native-list-cases.mts'
import { nativeAiCostApiFixtureCases } from './native-ai-cost-cases.mts'
import { nativeMessageApiFixtureCases } from './native-message-cases.mts'
import { nativeMembershipApiFixtureCases } from './native-membership-cases.mts'
import { nativeImportExportApiFixtureCases } from './native-import-export-cases.mts'
import { nativeModerationApiFixtureCases } from './native-moderation-cases.mts'
import { nativeTagsBookmarksApiFixtureCases } from './native-tags-bookmarks-cases.mts'
import { nativeUserAccountDataApiFixtureCases } from './native-user-account-data-cases.mts'
import { nativeUserProfileApiFixtureCases } from './native-user-profile-cases.mts'
import { nativeOAuthBrokerApiFixtureCases } from './native-oauth-broker-cases.mts'
import { oauthAppApiFixtureCases } from './oauth-app-cases.mts'
import { oauthManagementApiFixtureCases } from './oauth-management-cases.mts'
import { referralApiFixtureCases } from './referral-cases.mts'
import { swiftApiFixtureCases } from './swift-cases.mts'
import type { ApiFixtureCase, ResolvedApiFixtureCase } from './types.mts'
import { webApiFixtureCases } from './web-cases.mts'

function fromCaseFile(caseFile: string, cases: ApiFixtureCase[]): ResolvedApiFixtureCase[] {
  return cases.map(fixtureCase => {
    if (!fixtureCase.route)
      throw new Error(`API fixture "${fixtureCase.id}" is missing route metadata`)
    return {
      ...fixtureCase,
      route: fixtureCase.route,
      backendResponseContractKey:
        fixtureCase.backendResponseContractKey ??
        `${fixtureCase.method}:${fixtureCase.route.routeTemplate}`,
      source: { caseFile },
    }
  })
}

export const apiFixtureCases: ResolvedApiFixtureCase[] = [
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-ai-cost-cases.mts',
    nativeAiCostApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-oauth-broker-cases.mts',
    nativeOAuthBrokerApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/oauth-management-cases.mts',
    oauthManagementApiFixtureCases,
  ),
  ...fromCaseFile('backend/test-helpers/api-fixtures/oauth-app-cases.mts', oauthAppApiFixtureCases),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-spending-category-cases.mts',
    nativeSpendingCategoryApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-rewards-status-cases.mts',
    nativeRewardsStatusApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-point-valuation-cases.mts',
    nativePointValuationApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-card-cases.mts',
    nativeCardApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-account-pagination-cases.mts',
    nativeAccountPaginationApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-household-cases.mts',
    nativeHouseholdApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-household-pagination-cases.mts',
    nativeHouseholdPaginationApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/dynamic-config-cases.mts',
    dynamicConfigApiFixtureCases,
  ),
  ...fromCaseFile('backend/test-helpers/api-fixtures/web-cases.mts', webApiFixtureCases),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-tags-bookmarks-cases.mts',
    nativeTagsBookmarksApiFixtureCases,
  ),
  ...fromCaseFile('backend/test-helpers/api-fixtures/referral-cases.mts', referralApiFixtureCases),
  ...fromCaseFile('backend/test-helpers/api-fixtures/swift-cases.mts', swiftApiFixtureCases),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-comment-thread-cases.mts',
    nativeCommentThreadApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-comment-ancestor-pagination-cases.mts',
    nativeCommentAncestorPaginationApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-list-cases.mts',
    nativeListApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-landing-page-cases.mts',
    nativeLandingPageApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-message-cases.mts',
    nativeMessageApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-membership-cases.mts',
    nativeMembershipApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-import-export-cases.mts',
    nativeImportExportApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-moderation-cases.mts',
    nativeModerationApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-user-account-data-cases.mts',
    nativeUserAccountDataApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-user-profile-cases.mts',
    nativeUserProfileApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-domain-url-cases.mts',
    nativeDomainUrlApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-paid-crawl-cases.mts',
    nativePaidCrawlApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/native-copyright-cases.mts',
    nativeCopyrightApiFixtureCases,
  ),
  ...fromCaseFile(
    'backend/test-helpers/api-fixtures/engineering-ops-cases.mts',
    engineeringOpsApiFixtureCases,
  ),
]
