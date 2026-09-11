import part0 from './extracted-misc/aiCosts.ts'
import part1 from './extracted-misc/aliases.ts'
import part2 from './extracted-misc/analytics.ts'
import part3 from './extracted-misc/apiKeys.ts'
import part4 from './extracted-misc/appSidebar.ts'
import part5 from './extracted-misc/apple.ts'
import part6 from './extracted-misc/applications.ts'
import part7 from './extracted-misc/apply.ts'
import part8 from './extracted-misc/bans.ts'
import part9 from './extracted-misc/cards.ts'
import part10 from './extracted-misc/carousel.ts'
import part11 from './extracted-misc/category.ts'
import part12 from './extracted-misc/channels.ts'
import part13 from './extracted-misc/commandSearch.ts'
import part14 from './extracted-misc/contactid.ts'
import part15 from './extracted-misc/contacts.ts'
import part16 from './extracted-misc/conversationid.ts'
import part17 from './extracted-misc/crawlers.ts'
import part18 from './extracted-misc/crawlid.ts'
import part19 from './extracted-misc/dismissedRecommendations.ts'
import part20 from './extracted-misc/disputes.ts'
import part21 from './extracted-misc/followers.ts'
import part22 from './extracted-misc/following.ts'
import part23 from './extracted-misc/friendRecommendations.ts'
import part24 from './extracted-misc/github.ts'
import part25 from './extracted-misc/household.ts'
import part26 from './extracted-misc/id.ts'
import part27 from './extracted-misc/identity.ts'
import part28 from './extracted-misc/idorusername.ts'
import part29 from './extracted-misc/invites.ts'
import part30 from './extracted-misc/language.ts'
import part31 from './extracted-misc/linkPostMedia.ts'
import part32 from './extracted-misc/linkedin.ts'
import part33 from './extracted-misc/login.ts'
import part34 from './extracted-misc/manageSource.ts'
import part35 from './extracted-misc/member.ts'
import part36 from './extracted-misc/members.ts'
import part37 from './extracted-misc/membership.ts'
import part38 from './extracted-misc/mfaReauthDialog.ts'
import part39 from './extracted-misc/microsoft.ts'
import part40 from './extracted-misc/modlog.ts'
import part41 from './extracted-misc/newsPreferences.ts'
import part42 from './extracted-misc/newsSources.ts'
import part43 from './extracted-misc/notices.ts'
import part44 from './extracted-misc/notificationRedirect.ts'
import part45 from './extracted-misc/offline.ts'
import part46 from './extracted-misc/pinnedPosts.ts'
import part47 from './extracted-misc/plans.ts'
import part48 from './extracted-misc/podcastPlayer.ts'
import part49 from './extracted-misc/postCard.ts'
import part50 from './extracted-misc/preferences.ts'
import part51 from './extracted-misc/privacy.ts'
import part52 from './extracted-misc/privacyForm.ts'
import part53 from './extracted-misc/profile.ts'
import part54 from './extracted-misc/removedPosts.ts'
import part55 from './extracted-misc/rewardsProgramPointValuations.ts'
import part56 from './extracted-misc/rewardsProgramStatuses.ts'
import part57 from './extracted-misc/routes.ts'
import part58 from './extracted-misc/rssFeedItems.ts'
import part59 from './extracted-misc/sidebar.ts'
import part60 from './extracted-misc/similarity.ts'
import part61 from './extracted-misc/slug.ts'
import part62 from './extracted-misc/social.ts'
import part63 from './extracted-misc/spendingCategories.ts'
import part64 from './extracted-misc/testMarkdownHtml.ts'
import part65 from './extracted-misc/threadid.ts'
import part66 from './extracted-misc/topicid.ts'
import part67 from './extracted-misc/ui.ts'
import part68 from './extracted-misc/userProfileCollections.ts'
import part69 from './extracted-misc/votes.ts'
import part70 from './extracted-misc/warnings.ts'
import part71 from './extracted-misc/webSearch.ts'
import part72 from './extracted-misc/x.ts'

function merge(parts: Array<Record<string, unknown>>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const part of parts) mergeInto(output, part)
  return output
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      /* v8 ignore next -- generated chunks in this barrel use unique top-level namespaces */
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
  part57,
  part58,
  part59,
  part60,
  part61,
  part62,
  part63,
  part64,
  part65,
  part66,
  part67,
  part68,
  part69,
  part70,
  part71,
  part72,
])
