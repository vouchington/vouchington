import { getSiteUrl } from '@modules/utils'
import type {
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  PostReferralLinkEmailProps,
} from '@email-templates/core'

type TopicRecommendationInput = {
  id: string
  reason?: string | null
}

type TopicInput = {
  name: string
  slug: string
}

type ReferralProgramInput = {
  id: string
  link_count: number
}

type RssFeedInput = {
  id: string
  title: string
  home_page_url?: { url: string } | null
  rss_feed_url: { url: string }
  topic: {
    slug?: string | null
    markdown?: string | null
  }
}

export function buildFollowTopicsItems(
  recommendations: TopicRecommendationInput[],
  topics: Array<TopicInput | null | undefined>,
): FollowTopicsEmailProps['topics'] {
  return recommendations
    .map((result, index) => {
      const topic = topics[index]
      if (!topic) return null
      return {
        name: topic.name,
        url: getSiteUrl(`/topic/${topic.slug}`),
        reason: result.reason ?? undefined,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

export function buildReferralProgramItems(
  programs: ReferralProgramInput[],
  topics: Array<TopicInput | null | undefined>,
): PostReferralLinkEmailProps['referralPrograms'] {
  return programs
    .map((program, index) => {
      const topic = topics[index]
      if (!topic) return null
      return {
        name: topic.name,
        url: getSiteUrl(`/referral-program/${topic.slug}`),
        linkCount: program.link_count,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

export function buildFollowNewsSourceItems(
  feeds: Array<RssFeedInput | null | undefined>,
): FollowNewsSourcesEmailProps['sources'] {
  return feeds
    .map(feed => {
      if (!feed) return null
      return {
        name: feed.title,
        url: getSiteUrl(`/source/${feed.topic.slug ?? feed.id}`),
        description: feed.topic.markdown || undefined,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}
