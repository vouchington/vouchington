import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { isHttpUrlWithoutFragment, validateUUID } from '@modules/utils'
import { getMyLandingPageCandidates } from './candidates.mts'
import { getMyLandingPage } from './get.mts'
import { assertNoDuplicateSelection, uniqueTopicMapFromCandidates } from './shared.mts'
import { getLandingPageRowForUser } from './reads.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import type { LandingPageItemInput, LandingPageWithItems } from './types.mts'
import { buildLandingPageInsertRows } from './replace-item-rows.mts'

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
): Promise<LandingPageWithItems> {
  await getLandingPageRowForUser(userId, pageId)
  const candidates = await getMyLandingPageCandidates(userId)
  const profileLinksById = new Map(candidates.profile_links.map(link => [link.id, link]))
  const reviewsById = new Map(candidates.reviews.map(review => [review.id, review]))
  const referralLinksById = new Map(candidates.referral_links.map(link => [link.id, link]))
  const topicsById = uniqueTopicMapFromCandidates(candidates.reviews, candidates.referral_links)
  const seenSelections = new Set<string>()

  for (const item of items) {
    if (item.type === 'profile_link') {
      validateUUID(item.profile_link_id)
      assert(profileLinksById.has(item.profile_link_id), 400, 'Invalid profile_link_id')
      assertNoDuplicateSelection('profile_link', item.profile_link_id, seenSelections)
      continue
    }
    if (item.type === 'review') {
      validateUUID(item.review_id)
      assert(reviewsById.has(item.review_id), 400, 'Invalid review_id')
      assertNoDuplicateSelection('review', item.review_id, seenSelections)
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

    assert(item.type === 'topic_group', 400, `Invalid item type: ${String(item.type)}`)
    validateUUID(item.topic_id)
    assert(topicsById.has(item.topic_id), 400, 'Invalid topic_id')
    assertNoDuplicateSelection('topic_group', item.topic_id, seenSelections)
    assert(item.entries.length > 0, 400, 'Topic groups must contain at least one entry')

    for (const entry of item.entries) {
      if (entry.type === 'review') {
        validateUUID(entry.review_id)
        const review = reviewsById.get(entry.review_id)
        assert(review, 400, 'Invalid review_id')
        assert(
          review.review_topic_ratings.some(topic => topic.topic_id === item.topic_id),
          400,
          'Review does not match the selected topic',
        )
        assertNoDuplicateSelection('review', entry.review_id, seenSelections)
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
  const { groupMemberRows, itemRows } = buildLandingPageInsertRows(items)
  await using query = await beginTransaction()
  await replaceLandingPageItemRows(query, pageId, itemRows, groupMemberRows)
  await query.commit()
  // Public landing-page GET responses are edge-cached and tagged user:<username> (see
  // ts-shared/cache/cache-tags.mts), so a reorder/replace of items must purge that tag.
  await invalidate.users(userId)
  return getMyLandingPage(userId, pageId)
}

async function replaceLandingPageItemRows(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  pageId: string,
  itemRows: ReturnType<typeof buildLandingPageInsertRows>['itemRows'],
  groupMemberRows: ReturnType<typeof buildLandingPageInsertRows>['groupMemberRows'],
): Promise<void> {
  await query(sql`/* replaceMyLandingPageItems */
      DELETE FROM user_landing_page_group_members
      WHERE landing_page_item_id IN (
        SELECT id FROM user_landing_page_items WHERE landing_page_id = ${pageId}
      )
    `)
  await query(
    sql`/* replaceMyLandingPageItems */ DELETE FROM user_landing_page_items WHERE landing_page_id = ${pageId}`,
  )
  return insertLandingPageItemsAndGroupMembers(query, pageId, itemRows, groupMemberRows)
}

async function insertLandingPageItemsAndGroupMembers(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  pageId: string,
  itemRows: ReturnType<typeof buildLandingPageInsertRows>['itemRows'],
  groupMemberRows: ReturnType<typeof buildLandingPageInsertRows>['groupMemberRows'],
): Promise<void> {
  await query(sql`/* replaceMyLandingPageItems:insertItems */
      INSERT INTO user_landing_page_items (
        landing_page_id, item_type, sort_order, profile_link_id, review_id,
        referral_link_id, topic_id, link_label, link_url
      )
      SELECT
        ${pageId}::uuid,
        input.item_type::user_landing_page_item_types,
        input.sort_order,
        input.profile_link_id,
        input.review_id,
        input.referral_link_id,
        input.topic_id,
        input.link_label,
        input.link_url
      FROM UNNEST(
        ${itemRows.map(row => row.type)}::text[],
        ${itemRows.map(row => row.sortOrder)}::integer[],
        ${itemRows.map(row => row.profileLinkId)}::uuid[],
        ${itemRows.map(row => row.reviewId)}::uuid[],
        ${itemRows.map(row => row.referralLinkId)}::uuid[],
        ${itemRows.map(row => row.topicId)}::uuid[],
        ${itemRows.map(row => row.linkLabel)}::text[],
        ${itemRows.map(row => row.linkUrl)}::text[]
      ) AS input(
        item_type, sort_order, profile_link_id, review_id, referral_link_id,
        topic_id, link_label, link_url
      )
    `)

  await query(sql`/* replaceMyLandingPageItems:insertGroupMembers */
      INSERT INTO user_landing_page_group_members (
        landing_page_item_id, member_type, sort_order, review_id, referral_link_id
      )
      SELECT
        item.id,
        input.member_type::user_landing_page_group_member_types,
        input.sort_order,
        input.review_id,
        input.referral_link_id
      FROM UNNEST(
        ${groupMemberRows.map(row => row.parentSortOrder)}::integer[],
        ${groupMemberRows.map(row => row.type)}::text[],
        ${groupMemberRows.map(row => row.sortOrder)}::integer[],
        ${groupMemberRows.map(row => row.reviewId)}::uuid[],
        ${groupMemberRows.map(row => row.referralLinkId)}::uuid[]
      ) AS input(parent_sort_order, member_type, sort_order, review_id, referral_link_id)
      JOIN user_landing_page_items item
        ON item.landing_page_id = ${pageId}::uuid
       AND item.sort_order = input.parent_sort_order
  `)
}
