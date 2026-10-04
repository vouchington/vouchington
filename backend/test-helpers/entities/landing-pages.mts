import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { insertTestUrlDirect } from './urls.mts'

export async function createTestLandingPage(
  userId: string,
  label: string,
): Promise<{ landingPageId: string; slug: string }> {
  const slug = `test-lp-${v7()}`
  const { rows } = await write(sql`
    INSERT INTO user_landing_pages (user_id, title, slug, is_default)
    VALUES (${userId}, ${label}, ${slug}, FALSE)
    RETURNING id
  `)
  return { landingPageId: rows[0]!.id as string, slug }
}

export async function createTestLandingPageLinkItem(
  landingPageId: string,
  label: string,
  url: string,
): Promise<{ landingPageItemId: string }> {
  const urlRecord = await insertTestUrlDirect(null, url)
  if (!urlRecord) throw new Error(`Failed to create test landing page URL: ${url}`)
  const { rows } = await write(sql`
    INSERT INTO user_landing_page_items (landing_page_id, item_type, link_label, url_id)
    VALUES (${landingPageId}, 'link', ${label}, ${urlRecord.id})
    RETURNING id
  `)
  return { landingPageItemId: rows[0]!.id as string }
}

export async function createTestLandingPageReviewItem(
  landingPageId: string,
  reviewId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO user_landing_page_items (landing_page_id, item_type, review_id)
    VALUES (${landingPageId}, 'review', ${reviewId})
  `)
}

export async function createTestLandingPageGroupedReviewItem(
  landingPageId: string,
  topicId: string,
  reviewId: string,
): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO user_landing_page_items (landing_page_id, item_type, topic_id)
    VALUES (${landingPageId}, 'topic_group', ${topicId})
    RETURNING id
  `)
  await write(sql`
    INSERT INTO user_landing_page_group_members (landing_page_item_id, member_type, review_id)
    VALUES (${rows[0]!.id}, 'review', ${reviewId})
  `)
}

export async function createTestLandingPageProfileLinkItem(
  userId: string,
  landingPageId: string,
): Promise<{ profileLinkId: string; landingPageItemId: string }> {
  const { rows: linkRows } = await write(sql`
    INSERT INTO user_profile_links (user_id, link_type, name)
    VALUES (${userId}, 'url', ${'Test Profile Link'})
    RETURNING id
  `)
  const profileLinkId = linkRows[0]!.id as string

  const { rows: itemRows } = await write(sql`
    INSERT INTO user_landing_page_items (landing_page_id, item_type, profile_link_id)
    VALUES (${landingPageId}, 'profile_link', ${profileLinkId})
    RETURNING id
  `)
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

  const { rows } = await write(sql`
    INSERT INTO user_referral_program_links (
      user_id,
      referral_program_id,
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
  `)

  return rows[0]!.id as string
}
