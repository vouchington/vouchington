import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
import type {
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  PostReferralLinkEmailProps,
} from '@email-templates/core'

type Recipient = { username: string | null }

type TopicRecommendationInput = {
  id: string
  reason: string
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
  topic: {
    slug: string
    markdown: string
  }
}

export function buildFollowTopicsEmailVariables(
  recipient: Recipient,
  recommendations: TopicRecommendationInput[],
  topics: Array<TopicInput | null | undefined>,
): FollowTopicsEmailProps | null {
  const items = buildFollowTopicsItems(recommendations, topics)
  if (items.length === 0) return null
  return {
    userName: recipient.username ?? undefined,
    topics: items,
    settingsUrl: getSiteUrl('/my/topics/following'),
    unsubscribeUrl: getSiteUrl('/my/notification-settings'),
    physicalAddress: getMarketingPostalAddress(),
  }
}

export function buildReferralProgramEmailVariables(
  recipient: Recipient,
  programs: ReferralProgramInput[],
  topics: Array<TopicInput | null | undefined>,
): PostReferralLinkEmailProps | null {
  const referralPrograms = buildReferralProgramItems(programs, topics)
  if (referralPrograms.length === 0) return null
  return {
    userName: recipient.username ?? undefined,
    referralPrograms,
    settingsUrl: getSiteUrl('/my/referral-links'),
    unsubscribeUrl: getSiteUrl('/my/notification-settings'),
    physicalAddress: getMarketingPostalAddress(),
  }
}

export function buildFollowNewsSourcesEmailVariables(
  recipient: Recipient,
  feeds: Array<RssFeedInput | null | undefined>,
): FollowNewsSourcesEmailProps | null {
  const sources = buildFollowNewsSourceItems(feeds)
  if (sources.length === 0) return null
  return {
    userName: recipient.username ?? undefined,
    sources,
    settingsUrl: getSiteUrl('/my/news-sources'),
    unsubscribeUrl: getSiteUrl('/my/notification-settings'),
    physicalAddress: getMarketingPostalAddress(),
  }
}

function buildFollowTopicsItems(
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
        reason: result.reason,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

function buildReferralProgramItems(
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

function buildFollowNewsSourceItems(
  feeds: Array<RssFeedInput | null | undefined>,
): FollowNewsSourcesEmailProps['sources'] {
  return feeds
    .map(feed => {
      if (!feed) return null
      return {
        name: feed.title,
        url: getSiteUrl(`/source/${feed.topic.slug}`),
        description: feed.topic.markdown || undefined,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}
