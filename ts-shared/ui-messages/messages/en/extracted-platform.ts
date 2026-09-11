import part0 from './extracted-platform/api.ts'
import part1 from './extracted-platform/app.ts'
import part2 from './extracted-platform/asides.ts'
import part3 from './extracted-platform/auth.ts'
import part4 from './extracted-platform/chat.ts'
import part5 from './extracted-platform/components.ts'
import part6 from './extracted-platform/home.ts'
import part7 from './extracted-platform/intents/admin.ts'
import part8 from './extracted-platform/intents/productCommunication.ts'
import part9 from './extracted-platform/intents/productFediverse.ts'
import part10 from './extracted-platform/intents/productLists.ts'
import part11 from './extracted-platform/intents/productMediaNews.ts'
import part12 from './extracted-platform/intents/productMediaPodcasts.ts'
import part13 from './extracted-platform/intents/productMediaVideos.ts'
import part14 from './extracted-platform/intents/productOther.ts'
import part15 from './extracted-platform/intents/productPosts.ts'
import part16 from './extracted-platform/intents/productSearch.ts'
import part17 from './extracted-platform/intents/productSettings.ts'
import part18 from './extracted-platform/intents/productSocial.ts'
import part19 from './extracted-platform/lib/bookmarkRouteConfigData.ts'
import part20 from './extracted-platform/lib/bookmarkRouteConfigDataMedia.ts'
import part21 from './extracted-platform/lib/feedRouteConfigData.ts'
import part22 from './extracted-platform/lib/keyboardShortcuts.ts'
import part23 from './extracted-platform/lib/routeConfigs.ts'
import part24 from './extracted-platform/navbar.ts'
import part25 from './extracted-platform/navigation.ts'
import part26 from './extracted-platform/shared/agentBadge.ts'
import part27 from './extracted-platform/shared/browsePageHeader.ts'
import part28 from './extracted-platform/shared/clientSearchForm.ts'
import part29 from './extracted-platform/shared/entityBookmarkButton.ts'
import part30 from './extracted-platform/shared/entityBookmarkButtonPresets.ts'
import part31 from './extracted-platform/shared/followButton.ts'
import part32 from './extracted-platform/shared/followerSendAudienceToggle.ts'
import part33 from './extracted-platform/shared/followerSendDialog.ts'
import part34 from './extracted-platform/shared/followerSendPicker.ts'
import part35 from './extracted-platform/shared/followerSendSelectedBadges.ts'
import part36 from './extracted-platform/shared/followerShareActionButtons.ts'
import part37 from './extracted-platform/shared/hideButton.ts'
import part38 from './extracted-platform/shared/issueWarningDialog.ts'
import part39 from './extracted-platform/shared/listFilters.ts'
import part40 from './extracted-platform/shared/listSearchError.ts'
import part41 from './extracted-platform/shared/paginatedListFooter.ts'
import part42 from './extracted-platform/shared/reportDialog.ts'
import part43 from './extracted-platform/shared/reportMenuItem.ts'
import part44 from './extracted-platform/shared/reportReasonFieldset.ts'
import part45 from './extracted-platform/shared/rssFeedLink.ts'
import part46 from './extracted-platform/shared/saveButton.ts'
import part47 from './extracted-platform/shared/searchInput.ts'
import part48 from './extracted-platform/shared/sharedByline.ts'
import part49 from './extracted-platform/shared/statusPage.ts'
import part50 from './extracted-platform/shared/timeAgo.ts'
import part51 from './extracted-platform/shared/timeAgoFormat.ts'
import part52 from './extracted-platform/shared/turnstileField.ts'
import part53 from './extracted-platform/shared/usernameRequiredDialog.ts'
import part54 from './extracted-platform/shared/viewModeDropdown.ts'
import part55 from './extracted-platform/validations.ts'
import part56 from './extracted-platform/shared/embedPreviewCard.ts'

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
  part54,
  part55,
  part56,
])
