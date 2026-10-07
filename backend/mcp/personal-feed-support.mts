import { loadCommunityForViewer } from '@services/communities'
import type { PostFeedType, RssFeedItemFeedType, ReferralLinksFeedType } from '@services/feeds'
import { resolveHashtagTopicSearch } from '@services/search-params'
import type { PrivateUser } from '@services/users/types'
import type { FilterablePostType } from '@ts-shared/feed-capabilities'
import createHttpError from 'http-errors'
import { INVALID_CURSOR_RESULT } from './paged-search.mts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

export type CommonArgs = {
  limit?: number
  after?: string
  community?: string
  q?: string
  text_search_query?: string
  time_range?: '1d' | '1w' | '1m' | '1y' | 'all'
  min_score_follow_topics?: number
}
export type PostArgs = CommonArgs & {
  feed_type: PostFeedType
  post_types?: FilterablePostType[]
  sort?: 'new' | 'hot'
  min_score_follow_users?: number
}
export type ItemArgs = CommonArgs & {
  feed_type: RssFeedItemFeedType
  min_score_follow_rss_feeds?: number
  has_related_posts?: boolean
  media_types?: Array<'article' | 'audio' | 'video'>
}
export type ReferralArgs = { feed_type: ReferralLinksFeedType; limit?: number; after?: string }
export type PageInfo = {
  has_next_page: boolean
  start_cursor: string | null
  end_cursor: string | null
}
export type FeedItem = {
  id: string
  entity_id: string
  delivery_type: 'direct' | 'share'
  shared_by_id: string | null
  shared_at: string | null
}
export type FeedResult =
  | { success: true; results: FeedItem[]; page_info: PageInfo }
  | typeof INVALID_CURSOR_RESULT
export type ReferralRow = {
  id: string
  user_id: string
  referral_program_id: string
  referral_program_name: string
  referral_program_slug: string
  url: string
  label: string | null
}
export type ReferralResult =
  | { success: true; results: ReferralRow[]; page_info: PageInfo }
  | typeof INVALID_CURSOR_RESULT

export const MAX_LIMIT = 100
export const pageProperties = {
  limit: { type: 'integer', minimum: 1, description: 'Defaults to 25; clamped to 100.' },
  after: { type: 'string', description: 'Previous page_info.end_cursor.' },
}
export const commonProperties = {
  ...pageProperties,
  community: {
    type: 'string',
    description: 'Community UUID or slug, ignored for follow_users as on REST.',
  },
  q: { type: 'string', description: 'Keyword or hashtag search.' },
  text_search_query: { type: 'string' },
  time_range: { type: 'string', enum: ['1d', '1w', '1m', '1y', 'all'] },
  min_score_follow_topics: { type: 'number' },
}
export function feedItemSchema(component: 'Post' | 'ViewRssFeedItem') {
  return closedObject({
    id: pickProperties(component, ['id']).id!,
    entity_id: pickProperties(component, ['id']).id!,
    delivery_type: { type: 'string', enum: ['direct', 'share'] },
    shared_by_id: { type: ['string', 'null'] },
    shared_at: { type: ['string', 'null'], format: 'date-time' },
  })
}
export const referralSchema = closedObject(
  pickProperties('ReferralLinkFeedRow', [
    'id',
    'user_id',
    'referral_program_id',
    'referral_program_name',
    'referral_program_slug',
    'url',
    'label',
  ]),
)

export async function getCommunityId(
  currentUser: PrivateUser,
  feedType: PostFeedType | RssFeedItemFeedType,
  community: string | undefined,
): Promise<string | undefined> {
  if (!community || feedType === 'follow_users') return undefined
  try {
    return (await loadCommunityForViewer(currentUser, community)).community.id
  } catch (err: unknown) {
    if (createHttpError.isHttpError(err) && (err.status === 403 || err.status === 404)) {
      return undefined
    }
    throw err
  }
}

export async function hashtagOptions(q: string | undefined) {
  const parsed = await resolveHashtagTopicSearch(q)
  return {
    has_unknown_hashtag: parsed.hasUnknown,
    ...(q && parsed.textSearchQuery ? { text_search_query: parsed.textSearchQuery } : {}),
    ...(parsed.topicIds.length ? { hashtag_topic_ids: parsed.topicIds } : {}),
    ...(parsed.filters.some(filter => filter.kind === 'exact_alias')
      ? {
          hashtag_alias_ids: parsed.filters.flatMap(filter =>
            filter.kind === 'exact_alias' ? [filter.aliasId] : [],
          ),
        }
      : {}),
  }
}
