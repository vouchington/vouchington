import { getLandingPageProfileLinksByIds, getLandingPageReviewsByIds } from './item-lookups.mts'
import { read, type QueryExecutor, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getLandingPageItemRows } from './reads.mts'
import { getLandingPageReferralLinksByIds, getLandingPageTopicsByIds } from './topic-lookups.mts'
import type {
  LandingPage,
  LandingPageItem,
  LandingPageTopicGroupEntry,
  LandingPageWithItems,
  LandingPageSelections,
} from './types.mts'
async function getGroupMemberRows(groupItemIds: string[], options?: QueryOptions) {
  if (groupItemIds.length === 0) return []
  const { rows } = await read(
    sql`/* getGroupMemberRows */
    SELECT id, landing_page_item_id, member_type, review_post_id, referral_link_id
    FROM user_landing_page_group_members
    WHERE landing_page_item_id = ANY(${groupItemIds}::uuid[])
    ORDER BY sort_order ASC, id ASC
  `,
    options,
  )
  return rows as Array<{
    id: string
    landing_page_item_id: string
    member_type: 'review' | 'referral_link'
    review_post_id: string | null
    referral_link_id: string | null
  }>
}
export async function resolveLandingPageWithItems(
  page: LandingPage,
  options?: { publicOnly?: boolean; query?: QueryExecutor; selections?: LandingPageSelections },
): Promise<LandingPageWithItems> {
  const publicOnly = options?.publicOnly ?? false
  const itemRows = await getLandingPageItemRows(page.id, { query: options?.query })
  const groupRows = itemRows.filter(item => item.item_type === 'topic_group')
  const groupMembers = await getGroupMemberRows(
    groupRows.map(group => group.id),
    { query: options?.query },
  )
  const reviewIds = itemRows.flatMap(item => (item.review_post_id ? [item.review_post_id] : []))
  const referralLinkIds = itemRows.flatMap(item =>
    item.referral_link_id ? [item.referral_link_id] : [],
  )
  const topicIds = itemRows.flatMap(item => (item.topic_id ? [item.topic_id] : []))
  const [profileLinks, reviews, referralLinks, topics] = await Promise.all([
    options?.selections?.profileLinksById ??
      getLandingPageProfileLinksByIds(
        page.user_id,
        itemRows.flatMap(item => (item.profile_link_id ? [item.profile_link_id] : [])),
      ),
    options?.selections?.reviewsById ??
      getLandingPageReviewsByIds(
        page.user_id,
        [
          ...new Set([
            ...reviewIds,
            ...groupMembers.flatMap(member =>
              member.review_post_id ? [member.review_post_id] : [],
            ),
          ]),
        ],
        publicOnly,
      ),
    options?.selections?.referralLinksById ??
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
    getLandingPageTopicsByIds(topicIds, { query: options?.query }),
  ])
  const groupMembersByItemId = new Map<string, LandingPageTopicGroupEntry[]>()
  for (const member of groupMembers) {
    const entries = groupMembersByItemId.get(member.landing_page_item_id) ?? []
    if (member.member_type === 'review' && member.review_post_id) {
      const review = reviews.get(member.review_post_id)
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
    if (item.item_type === 'review' && item.review_post_id) {
      const review = reviews.get(item.review_post_id)
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
    } else if (item.item_type === 'link' && item.link_label && item.url) {
      items.push({ id: item.id, type: 'link', label: item.link_label, url: item.url })
    }
  }
  return { ...page, items }
}
