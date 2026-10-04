import type { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { buildLandingPageInsertRows } from './replace-item-rows.mts'

export async function replaceLandingPageItemRows(
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
        referral_link_id, topic_id, link_label, url_id
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
        input.url_id
      FROM UNNEST(
        ${itemRows.map(row => row.type)}::text[],
        ${itemRows.map(row => row.sortOrder)}::integer[],
        ${itemRows.map(row => row.profileLinkId)}::uuid[],
        ${itemRows.map(row => row.reviewId)}::uuid[],
        ${itemRows.map(row => row.referralLinkId)}::uuid[],
        ${itemRows.map(row => row.topicId)}::uuid[],
        ${itemRows.map(row => row.linkLabel)}::text[],
        ${itemRows.map(row => row.urlId)}::uuid[]
      ) AS input(
        item_type, sort_order, profile_link_id, review_id, referral_link_id,
        topic_id, link_label, url_id
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
