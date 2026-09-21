import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ProfileLink } from '../profile-links.mts'
import { buildReviewMap } from './shared.mts'
import { getLandingPageItemRows } from './reads.mts'
import { getLandingPageReferralLinksByIds, getLandingPageTopicsByIds } from './topic-lookups.mts'
import type {
  LandingPage,
  LandingPageCandidateReview,
  LandingPageItem,
  LandingPageTopicGroupEntry,
  LandingPageWithItems,
} from './types.mts'
async function getProfileLinksByIds(
  userId: string,
  ids: string[],
): Promise<Map<string, ProfileLink>> {
  if (ids.length === 0) return new Map()
  const { rows } = await read(sql`/* getProfileLinksByIds */
    SELECT pl.id, pl.user_id, pl.link_type, pl.sort_order, pl.url_id, u.url, pl.handle, pl.name, pl.image_id, pl.created_at, pl.updated_at,
      CASE WHEN placement.id IS NULL THEN NULL ELSE jsonb_build_object(
        'placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id
      ) END AS image_placement
    FROM user_profile_links pl
    LEFT JOIN urls u ON u.id = pl.url_id
    LEFT JOIN image_surface_placements surface
      ON surface.user_profile_link_id = pl.id AND surface.surface_kind = 'user-profile-link-image'
    LEFT JOIN media_placements placement
      ON placement.id = surface.placement_id AND placement.retired_at IS NULL
      AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
    WHERE pl.user_id = ${userId}
      AND pl.id = ANY(${ids}::uuid[])
  `)
  return new Map((rows as ProfileLink[]).map(link => [link.id, link]))
}
async function getReviewsByIds(
  userId: string,
  ids: string[],
  publicOnly: boolean,
): Promise<Map<string, LandingPageCandidateReview>> {
  if (ids.length === 0) return new Map()
  const query = sql`/* getReviewsByIds */
    SELECT
      p.id,
      p.title,
      p.declared_language,
      p.lingua_rs_detected_language,
      (
        SELECT slug
        FROM post_slugs
        WHERE post_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS slug,
      p.markdown,
      p.created_at,
      prtr.topic_id,
      prtr.rating,
      prtr.order_index,
      t.name AS topic_name,
      t.slug AS topic_slug
    FROM posts p
    LEFT JOIN post_review_topic_ratings prtr ON prtr.post_id = p.id
    LEFT JOIN topics t ON t.id = prtr.topic_id AND t.deleted_at IS NULL AND t.merged_into_topic_id IS NULL
    WHERE p.created_by_id = ${userId}
      AND p.id = ANY(${ids}::uuid[])
      AND p.post_type = 'review'
      AND p.deleted_at IS NULL
  `
  if (publicOnly) {
    query.append(sql`
      AND EXISTS (
        SELECT 1
        FROM view_public_post_eligibility eligibility
        WHERE eligibility.post_id = p.id
      )`)
  }
  query.append(sql` ORDER BY p.id DESC, prtr.order_index ASC`)
  const { rows } = await read(query)
  return buildReviewMap(rows)
}
async function getGroupMemberRows(groupItemIds: string[]) {
  if (groupItemIds.length === 0) return []
  const { rows } = await read(sql`/* getGroupMemberRows */
    SELECT id, landing_page_item_id, member_type, review_id, referral_link_id
    FROM user_landing_page_group_members
    WHERE landing_page_item_id = ANY(${groupItemIds}::uuid[])
    ORDER BY sort_order ASC, id ASC
  `)
  return rows as Array<{
    id: string
    landing_page_item_id: string
    member_type: 'review' | 'referral_link'
    review_id: string | null
    referral_link_id: string | null
  }>
}
export async function resolveLandingPageWithItems(
  page: LandingPage,
  options?: { publicOnly?: boolean },
): Promise<LandingPageWithItems> {
  const publicOnly = options?.publicOnly ?? false
  const itemRows = await getLandingPageItemRows(page.id)
  const groupRows = itemRows.filter(item => item.item_type === 'topic_group')
  const groupMembers = await getGroupMemberRows(groupRows.map(group => group.id))
  const reviewIds = itemRows.flatMap(item => (item.review_id ? [item.review_id] : []))
  const referralLinkIds = itemRows.flatMap(item =>
    item.referral_link_id ? [item.referral_link_id] : [],
  )
  const topicIds = itemRows.flatMap(item => (item.topic_id ? [item.topic_id] : []))
  const [profileLinks, reviews, referralLinks, topics] = await Promise.all([
    getProfileLinksByIds(
      page.user_id,
      itemRows.flatMap(item => (item.profile_link_id ? [item.profile_link_id] : [])),
    ),
    getReviewsByIds(
      page.user_id,
      [
        ...new Set([
          ...reviewIds,
          ...groupMembers.flatMap(member => (member.review_id ? [member.review_id] : [])),
        ]),
      ],
      publicOnly,
    ),
    getLandingPageReferralLinksByIds(
      page.user_id,
      [
        ...new Set([
          ...referralLinkIds,
          ...groupMembers.flatMap(member =>
            member.referral_link_id ? [member.referral_link_id] : [],
          ),
        ]),
      ],
      publicOnly,
    ),
    getLandingPageTopicsByIds(topicIds),
  ])
  const groupMembersByItemId = new Map<string, LandingPageTopicGroupEntry[]>()
  for (const member of groupMembers) {
    const entries = groupMembersByItemId.get(member.landing_page_item_id) ?? []
    if (member.member_type === 'review' && member.review_id) {
      const review = reviews.get(member.review_id)
      if (review) entries.push({ id: member.id, type: 'review', review })
    }
    if (member.member_type === 'referral_link' && member.referral_link_id) {
      const referralLink = referralLinks.get(member.referral_link_id)
      if (referralLink)
        entries.push({ id: member.id, type: 'referral_link', referral_link: referralLink })
    }
    groupMembersByItemId.set(member.landing_page_item_id, entries)
  }
  const items: LandingPageItem[] = []
  for (const item of itemRows) {
    if (item.item_type === 'profile_link' && item.profile_link_id) {
      const profileLink = profileLinks.get(item.profile_link_id)
      if (profileLink) items.push({ id: item.id, type: 'profile_link', profile_link: profileLink })
      continue
    }
    if (item.item_type === 'review' && item.review_id) {
      const review = reviews.get(item.review_id)
      if (review) items.push({ id: item.id, type: 'review', review })
      continue
    }
    if (item.item_type === 'referral_link' && item.referral_link_id) {
      const referralLink = referralLinks.get(item.referral_link_id)
      if (referralLink)
        items.push({ id: item.id, type: 'referral_link', referral_link: referralLink })
      continue
    }
    if (item.item_type === 'topic_group' && item.topic_id) {
      const topic = topics.get(item.topic_id)
      const entries = groupMembersByItemId.get(item.id) ?? []
      if (topic && entries.length > 0)
        items.push({ id: item.id, type: 'topic_group', topic, entries })
    } else if (item.item_type === 'link' && item.link_label && item.link_url) {
      items.push({ id: item.id, type: 'link', label: item.link_label, url: item.link_url })
    }
  }
  return { ...page, items }
}
