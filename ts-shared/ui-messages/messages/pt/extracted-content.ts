import part0 from './extracted-content/comments.ts'
import part1 from './extracted-content/compare.ts'
import part2 from './extracted-content/create.ts'
import part3 from './extracted-content/domains.ts'
import part4 from './extracted-content/edit.ts'
import part5 from './extracted-content/feed.ts'
import part6 from './extracted-content/lists.ts'
import part7 from './extracted-content/new.ts'
import part8 from './extracted-content/news.ts'
import part9 from './extracted-content/podcasts.ts'
import part10 from './extracted-content/postForm.ts'
import part11 from './extracted-content/posts/bankAccountFields.ts'
import part12 from './extracted-content/posts/bankAccountMoneyInput.ts'
import part13 from './extracted-content/posts/contributionGatedCta.ts'
import part14 from './extracted-content/posts/creditCardFields.ts'
import part15 from './extracted-content/posts/dataPointCreditCardProfileFields.ts'
import part16 from './extracted-content/posts/dataPointDetail.ts'
import part17 from './extracted-content/posts/dataPointFields.ts'
import part18 from './extracted-content/posts/dataPointProfileFields.ts'
import part19 from './extracted-content/posts/deletePostMenuItem.ts'
import part20 from './extracted-content/posts/discussInCommunityAction.ts'
import part21 from './extracted-content/posts/discussionFields.ts'
import part22 from './extracted-content/posts/editPostPage.ts'
import part23 from './extracted-content/posts/followerShareMenuItems.ts'
import part24 from './extracted-content/posts/pinCommunityPostMenuItem.ts'
import part25 from './extracted-content/posts/postAuthorAside.ts'
import part26 from './extracted-content/posts/postAutocomplete.ts'
import part27 from './extracted-content/posts/postDetail.ts'
import part28 from './extracted-content/posts/postDetailActions.ts'
import part29 from './extracted-content/posts/postDetailBadges.ts'
import part30 from './extracted-content/posts/postDetailImageButton.ts'
import part31 from './extracted-content/posts/postDetailImages.ts'
import part32 from './extracted-content/posts/postDetailMetadata.ts'
import part33 from './extracted-content/posts/postDetailOverflowMenu.ts'
import part34 from './extracted-content/posts/postDetailTabs.ts'
import part35 from './extracted-content/posts/postFilters.ts'
import part36 from './extracted-content/posts/postFollowContext.ts'
import part37 from './extracted-content/posts/postFormImagesFieldset.ts'
import part38 from './extracted-content/posts/postFormSections.ts'
import part39 from './extracted-content/posts/postList.ts'
import part40 from './extracted-content/posts/postListTopSection.ts'
import part41 from './extracted-content/posts/postLockButton.ts'
import part42 from './extracted-content/posts/postViewToggle.ts'
import part43 from './extracted-content/posts/reviewContentCounter.ts'
import part44 from './extracted-content/posts/reviewReferralPrograms.ts'
import part45 from './extracted-content/posts/starRating.ts'
import part46 from './extracted-content/posts/submitLinkForm.ts'
import part47 from './extracted-content/posts/topicAutocomplete.ts'
import part48 from './extracted-content/posts/unpublishFromCommunityMenuItem.ts'
import part49 from './extracted-content/reviewQueue.ts'
import part50 from './extracted-content/rssFeedCategories.ts'
import part51 from './extracted-content/sources.ts'
import part52 from './extracted-content/tags.ts'
import part53 from './extracted-content/topicClaims.ts'
import part54 from './extracted-content/topicRecommendations.ts'
import part55 from './extracted-content/topics.ts'
import part56 from './extracted-content/urls.ts'

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
