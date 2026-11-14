import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import { isHttpUrlWithoutFragment, validateUUID } from '@modules/utils'
import { getSelectedLandingPageCandidates } from './selected-candidates.mts'
import { assertLandingPageItemLimit } from './limits.mts'
import { resolveLandingPageWithItems } from './resolve-items.mts'
import { assertNoDuplicateSelection } from './shared.mts'
import { getLandingPageRowForUser } from './reads.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import type { LandingPage, LandingPageItemInput, LandingPageWithItems } from './types.mts'
import { buildLandingPageInsertRows } from './replace-item-rows.mts'
import { replaceLandingPageItemRows } from './replace-item-writes.mts'
import { registerLandingPageLinkUrls } from './link-urls.mts'

const MAX_LINK_LABEL_LENGTH = 100
const MAX_LINK_URL_LENGTH = 2048

function validateLinkLabel(label: unknown): string {
  assert(typeof label === 'string', 400, 'link label must be a string')
  const trimmed = label.trim()
  assert(trimmed.length > 0, 400, 'link label is required')
  assert(
    trimmed.length <= MAX_LINK_LABEL_LENGTH,
    400,
    `link label must be at most ${MAX_LINK_LABEL_LENGTH} characters`,
  )
  return trimmed
}

function validateLinkUrl(url: unknown): string {
  assert(typeof url === 'string', 400, 'link url must be a string')
  const trimmed = url.trim()
  assert(trimmed.length > 0, 400, 'link url is required')
  assert(
    trimmed.length <= MAX_LINK_URL_LENGTH,
    400,
    `link url must be at most ${MAX_LINK_URL_LENGTH} characters`,
  )
  assert(
    isHttpUrlWithoutFragment(trimmed),
    400,
    'link url must be a valid http or https URL without a fragment',
  )
  return trimmed
}

export async function replaceMyLandingPageItems(
  userId: string,
  pageId: string,
  items: LandingPageItemInput[],
  preloadedPage?: LandingPage,
): Promise<LandingPageWithItems> {
  if (preloadedPage) {
    assert(
      preloadedPage.id === pageId && preloadedPage.user_id === userId,
      404,
      'Landing page not found',
    )
  } else {
    await getLandingPageRowForUser(userId, pageId)
  }
  assertLandingPageItemLimit(items)
  const { profileLinksById, reviewsById, referralLinksById, topicsById } =
    await getSelectedLandingPageCandidates(userId, items)
  const seenSelections = new Set<string>()

  for (const item of items) {
    if (item.type === 'profile_link') {
      validateUUID(item.profile_link_id)
      assert(profileLinksById.has(item.profile_link_id), 400, 'Invalid profile_link_id')
      assertNoDuplicateSelection('profile_link', item.profile_link_id, seenSelections)
      continue
    }
    if (item.type === 'review') {
      validateUUID(item.review_post_id)
      assert(reviewsById.has(item.review_post_id), 400, 'Invalid review_post_id')
      assertNoDuplicateSelection('review', item.review_post_id, seenSelections)
      continue
    }
    if (item.type === 'referral_link') {
      validateUUID(item.referral_link_id)
      assert(referralLinksById.has(item.referral_link_id), 400, 'Invalid referral_link_id')
      assertNoDuplicateSelection('referral_link', item.referral_link_id, seenSelections)
      continue
    }

    if (item.type === 'link') {
      validateLinkLabel(item.label)
      validateLinkUrl(item.url)
      continue
    }

    assert(item.type === 'topic_group', 400, `Invalid item type: ${item.type}`)
    validateUUID(item.topic_id)
    assert(topicsById.has(item.topic_id), 400, 'Invalid topic_id')
    assertNoDuplicateSelection('topic_group', item.topic_id, seenSelections)
    assert(item.entries.length > 0, 400, 'Topic groups must contain at least one entry')

    for (const entry of item.entries) {
      if (entry.type === 'review') {
        validateUUID(entry.review_post_id)
        const review = reviewsById.get(entry.review_post_id)
        assert(review, 400, 'Invalid review_post_id')
        assert(
          review.review_topic_ratings.some(topic => topic.topic_id === item.topic_id),
          400,
          'Review does not match the selected topic',
        )
        assertNoDuplicateSelection('review', entry.review_post_id, seenSelections)
        continue
      }

      validateUUID(entry.referral_link_id)
      const referralLink = referralLinksById.get(entry.referral_link_id)
      assert(referralLink, 400, 'Invalid referral_link_id')
      assert(
        referralLink.referral_program_id === item.topic_id,
        400,
        'Referral link does not match the selected topic',
      )
      assertNoDuplicateSelection('referral_link', entry.referral_link_id, seenSelections)
    }
  }
  await using query = await beginTransaction()
  const page = await getLandingPageRowForUser(userId, pageId, { query })
  const urls = await registerLandingPageLinkUrls(userId, items, query)
  const { groupMemberRows, itemRows } = buildLandingPageInsertRows(items, urls.idsByInput)
  await replaceLandingPageItemRows(query, pageId, itemRows, groupMemberRows)
  const result = await resolveLandingPageWithItems(page, {
    query,
    selections: { profileLinksById, reviewsById, referralLinksById },
  })
  await query.commit()
  await invalidate.urls(...urls.records.flatMap(url => [url.id, url.url]))
  await invalidate.users(userId)
  return result
}
