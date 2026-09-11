import part0 from './extracted-account/accountStatus.ts'
import part1 from './extracted-account/apiKeysManager.ts'
import part2 from './extracted-account/data.ts'
import part3 from './extracted-account/emailManager.ts'
import part4 from './extracted-account/identityVerification.ts'
import part5 from './extracted-account/importExport.ts'
import part6 from './extracted-account/messages.ts'
import part7 from './extracted-account/my/analyticsConversionFunnel.ts'
import part8 from './extracted-account/my/analyticsItemClicksTable.ts'
import part9 from './extracted-account/my/analyticsUtmBreakdownChart.ts'
import part10 from './extracted-account/my/analyticsVisitTrendChart.ts'
import part11 from './extracted-account/my/apiKeysManager.ts'
import part12 from './extracted-account/my/audienceSelect.ts'
import part13 from './extracted-account/my/bookmarkPageHeader.ts'
import part14 from './extracted-account/my/cardsManager.ts'
import part15 from './extracted-account/my/emailManager.ts'
import part16 from './extracted-account/my/error.ts'
import part17 from './extracted-account/my/findFriendsTabs.ts'
import part18 from './extracted-account/my/friendRecommendationsList.ts'
import part19 from './extracted-account/my/householdManager.ts'
import part20 from './extracted-account/my/identityDisplayNameSourceSection.ts'
import part21 from './extracted-account/my/identityForm.ts'
import part22 from './extracted-account/my/identityProfileImageSection.ts'
import part23 from './extracted-account/my/identityUsernameSection.ts'
import part24 from './extracted-account/my/landingPageAnalyticsDashboard.ts'
import part25 from './extracted-account/my/landingPageEditor.ts'
import part26 from './extracted-account/my/landingPagesIndex.ts'
import part27 from './extracted-account/my/landingPagesManager.ts'
import part28 from './extracted-account/my/landingPagesManagerSections.ts'
import part29 from './extracted-account/my/mfaReauthDialog.ts'
import part30 from './extracted-account/my/mfaStatusBanner.ts'
import part31 from './extracted-account/my/newsPreferencesForm.ts'
import part32 from './extracted-account/my/passkeyManager.ts'
import part33 from './extracted-account/my/pointValuationsManager.ts'
import part34 from './extracted-account/my/preferencesForm.ts'
import part35 from './extracted-account/my/privacyForm.ts'
import part36 from './extracted-account/my/profileForm.ts'
import part37 from './extracted-account/my/profileLinkForm.ts'
import part38 from './extracted-account/my/profileLinkRow.ts'
import part39 from './extracted-account/my/profileLinkTypeSelect.ts'
import part40 from './extracted-account/my/profileLinks.ts'
import part41 from './extracted-account/my/referralClicksPage.ts'
import part42 from './extracted-account/my/referralLinksManager.ts'
import part43 from './extracted-account/my/rewardsProgramStatusesManager.ts'
import part44 from './extracted-account/my/settingsNav.ts'
import part45 from './extracted-account/my/settingsRoutes.ts'
import part46 from './extracted-account/my/spendingCategoriesManager.ts'
import part47 from './extracted-account/my/totpManager.ts'
import part48 from './extracted-account/notifications.ts'
import part49 from './extracted-account/passkeyManager.ts'
import part50 from './extracted-account/settings.ts'
import part51 from './extracted-account/support.ts'
import part52 from './extracted-account/totpManager.ts'
import part53 from './extracted-account/users.ts'

function merge(parts: Array<Record<string, unknown>>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const part of parts) mergeInto(output, part)
  return output
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default merge([
  part0,
  part1,
  part2,
  part3,
  part4,
  part5,
  part6,
  part7,
  part8,
  part9,
  part10,
  part11,
  part12,
  part13,
  part14,
  part15,
  part16,
  part17,
  part18,
  part19,
  part20,
  part21,
  part22,
  part23,
  part24,
  part25,
  part26,
  part27,
  part28,
  part29,
  part30,
  part31,
  part32,
  part33,
  part34,
  part35,
  part36,
  part37,
  part38,
  part39,
  part40,
  part41,
  part42,
  part43,
  part44,
  part45,
  part46,
  part47,
  part48,
  part49,
  part50,
  part51,
  part52,
  part53,
])
