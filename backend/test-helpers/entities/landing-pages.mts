import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { insertTestUrlDirect } from './urls.mts'

export async function createTestLandingPage(
  userId: string,
  label: string,
): Promise<{ landingPageId: string; slug: string }> {
  const slug = `test-lp-${v7()}`
  const { rows } = await write(
    sql`/* createTestLandingPage */
    INSERT INTO user_landing_pages (user_id, slot, title, slug, is_default)
    SELECT ${userId}, candidate.slot, ${label}, ${slug}, FALSE
    FROM generate_series(1, 20) candidate(slot)
    WHERE NOT EXISTS (
      SELECT 1 FROM user_landing_pages page WHERE page.user_id = ${userId} AND page.slot = candidate.slot
    )
    ORDER BY candidate.slot LIMIT 1
    RETURNING id
  `,
  )
  return { landingPageId: rows[0]!.id as string, slug }
}

export async function createTestLandingPageLinkItem(
  landingPageId: string,
  label: string,
  url: string,
): Promise<{ landingPageItemId: string }> {
  const urlRecord = await insertTestUrlDirect(null, url)
  if (!urlRecord) throw new Error(`Failed to create test landing page URL: ${url}`)
  const { rows } = await write(
    sql`/* createTestLandingPageLinkItem */
    INSERT INTO user_landing_page_items (landing_page_id, item_type, link_label, url_id, sort_order)
    SELECT ${landingPageId}, 'link', ${label}, ${urlRecord.id}, COALESCE(MAX(sort_order), -1) + 1
    FROM user_landing_page_items WHERE landing_page_id = ${landingPageId}
    RETURNING id
  `,
  )
  return { landingPageItemId: rows[0]!.id as string }
}

export async function createTestLandingPageReviewItem(
  landingPageId: string,
  reviewId: string,
): Promise<void> {
  await write(
    sql`/* createTestLandingPageReviewItem */
    INSERT INTO user_landing_page_items (landing_page_id, item_type, review_post_id, sort_order)
    SELECT ${landingPageId}, 'review', ${reviewId}, COALESCE(MAX(sort_order), -1) + 1
    FROM user_landing_page_items WHERE landing_page_id = ${landingPageId}
  `,
  )
}

export async function createTestLandingPageGroupedReviewItem(
  landingPageId: string,
  topicId: string,
  reviewId: string,
): Promise<void> {
  const { rows } = await write<{ id: string }>(
    sql`/* createTestLandingPageGroupedReviewItem:item */
    INSERT INTO user_landing_page_items (landing_page_id, item_type, topic_id, sort_order)
    SELECT ${landingPageId}, 'topic_group', ${topicId}, COALESCE(MAX(sort_order), -1) + 1
    FROM user_landing_page_items WHERE landing_page_id = ${landingPageId}
    RETURNING id
  `,
  )
  await write(
    sql`/* createTestLandingPageGroupedReviewItem:member */
    INSERT INTO user_landing_page_group_members (landing_page_item_id, member_type, review_post_id)
    VALUES (${rows[0]!.id}, 'review', ${reviewId})
  `,
  )
}

export async function createTestLandingPageProfileLinkItem(
  userId: string,
  landingPageId: string,
  requestedProfileLinkId?: string,
): Promise<{ profileLinkId: string; landingPageItemId: string }> {
  const { rows: linkRows } = await write(
    sql`/* createTestLandingPageProfileLinkItem:profileLink */
    INSERT INTO user_profile_links (id, user_id, link_type, name)
    VALUES (COALESCE(${requestedProfileLinkId ?? null}::uuid, uuidv7()), ${userId}, 'url', ${'Test Profile Link'})
    RETURNING id
  `,
  )
  const profileLinkId = linkRows[0]!.id as string

  const { rows: itemRows } = await write(
    sql`/* createTestLandingPageProfileLinkItem:item */
    INSERT INTO user_landing_page_items (landing_page_id, item_type, profile_link_id, sort_order)
    SELECT ${landingPageId}, 'profile_link', ${profileLinkId}, COALESCE(MAX(sort_order), -1) + 1
    FROM user_landing_page_items WHERE landing_page_id = ${landingPageId}
    RETURNING id
  `,
  )
  return { profileLinkId, landingPageItemId: itemRows[0]!.id as string }
}

export async function createTestReferralProgramLink(input: {
  userId: string
  referralProgramId: string
  url: string
  label: string
}): Promise<string> {
  const urlRecord = await insertTestUrlDirect(input.userId, input.url)
  if (!urlRecord) {
    throw new Error(`Failed to create URL for referral program link: ${input.url}`)
  }

  const { rows } = await write(
    sql`/* createTestReferralProgramLink */
    INSERT INTO user_referral_program_links (
      user_id,
      referral_program_topic_id,
      url_id,
      label,
      activated_at,
      created_via
    )
    VALUES (
      ${input.userId},
      ${input.referralProgramId},
      ${urlRecord.id},
      ${input.label},
      CURRENT_TIMESTAMP,
      'system'
    )
    RETURNING id
  `,
  )

  return rows[0]!.id as string
}
