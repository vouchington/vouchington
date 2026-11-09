import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { buildLandingPageInsertRows } from './replace-item-rows.mts'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'

export async function replaceLandingPageItemRows(
  query: TransactionQuery,
  pageId: string,
  itemRows: ReturnType<typeof buildLandingPageInsertRows>['itemRows'],
  groupMemberRows: ReturnType<typeof buildLandingPageInsertRows>['groupMemberRows'],
): Promise<void> {
  await lockTopicRssFeedAttachmentLifecycles(
    query,
    itemRows.flatMap(row => (row.topicId ? [row.topicId] : [])),
  )
  // Every existing item is replaced or deleted. Lock that actual write set in the same order
  // for both paths, including sparse pages whose first selection disappeared through a FK cascade.
  await query(sql`/* replaceMyLandingPageItems:lockWrittenItems */
    SELECT id FROM user_landing_page_items WHERE landing_page_id = ${pageId}
    ORDER BY sort_order, id FOR UPDATE`)
  if (itemRows.length === 0) {
    // A fresh statement sees the complete tail committed by any writer the lock scan waited for.
    await query(sql`/* replaceMyLandingPageItems:clearRemaining */
      DELETE FROM user_landing_page_items WHERE landing_page_id = ${pageId}`)
    return
  }
  // ast-grep-ignore: no-three-sequential-awaits -- Item writes must precede clearing their old groups and surplus positions before replacement group rows can be inserted.
  await upsertLandingPageItems(query, pageId, itemRows)
  await query(sql`/* replaceMyLandingPageItems:clearGroupMembers */
    DELETE FROM user_landing_page_group_members member
    USING user_landing_page_items item
    WHERE member.landing_page_item_id = item.id AND item.landing_page_id = ${pageId}`)
  await query(sql`/* replaceMyLandingPageItems:deleteSurplus */
    DELETE FROM user_landing_page_items
    WHERE landing_page_id = ${pageId} AND sort_order >= ${itemRows.length}`)
  await insertLandingPageGroupMembers(query, pageId, groupMemberRows)
}

async function upsertLandingPageItems(
  query: TransactionQuery,
  pageId: string,
  itemRows: ReturnType<typeof buildLandingPageInsertRows>['itemRows'],
): Promise<void> {
  await query(sql`/* replaceMyLandingPageItems:upsertItems */
      INSERT INTO user_landing_page_items (
        landing_page_id, item_type, sort_order, profile_link_id, review_post_id,
        referral_link_id, topic_id, link_label, url_id
      )
      SELECT
        ${pageId}::uuid,
        input.item_type::user_landing_page_item_types,
        input.sort_order,
        input.profile_link_id,
        input.review_post_id,
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
        item_type, sort_order, profile_link_id, review_post_id, referral_link_id,
        topic_id, link_label, url_id
      )
      ORDER BY input.sort_order
      ON CONFLICT (landing_page_id, sort_order) DO UPDATE SET
        item_type = EXCLUDED.item_type,
        profile_link_id = EXCLUDED.profile_link_id,
        review_post_id = EXCLUDED.review_post_id,
        referral_link_id = EXCLUDED.referral_link_id,
        topic_id = EXCLUDED.topic_id,
        link_label = EXCLUDED.link_label,
        url_id = EXCLUDED.url_id
    `)
}

async function insertLandingPageGroupMembers(
  query: TransactionQuery,
  pageId: string,
  groupMemberRows: ReturnType<typeof buildLandingPageInsertRows>['groupMemberRows'],
): Promise<void> {
  await query(sql`/* replaceMyLandingPageItems:insertGroupMembers */
      INSERT INTO user_landing_page_group_members (
        landing_page_item_id, member_type, sort_order, review_post_id, referral_link_id
      )
      SELECT
        item.id,
        input.member_type::user_landing_page_group_member_types,
        input.sort_order,
        input.review_post_id,
        input.referral_link_id
      FROM UNNEST(
        ${groupMemberRows.map(row => row.parentSortOrder)}::integer[],
        ${groupMemberRows.map(row => row.type)}::text[],
        ${groupMemberRows.map(row => row.sortOrder)}::integer[],
        ${groupMemberRows.map(row => row.reviewId)}::uuid[],
        ${groupMemberRows.map(row => row.referralLinkId)}::uuid[]
      ) AS input(parent_sort_order, member_type, sort_order, review_post_id, referral_link_id)
      JOIN user_landing_page_items item
        ON item.landing_page_id = ${pageId}::uuid
       AND item.sort_order = input.parent_sort_order
  `)
}
