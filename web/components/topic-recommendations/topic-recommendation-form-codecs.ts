import type { TopicRecommendationMutationInput } from '@/lib/api/client/topic-recommendations'
import type { Post } from '@/types/posts'

export function aliasesToText(aliases?: string[] | null): string {
  return aliases?.join('\n') ?? ''
}

export function hostnamesToText(hostnames?: Array<{ hostname: string }> | null): string {
  return hostnames?.map(hostname => hostname.hostname).join('\n') ?? ''
}

export function parseAliases(text: string): string[] {
  return text.split('\n').flatMap(alias => (alias.trim() ? [alias.trim()] : []))
}

export function parseHostnames(text: string): string[] {
  return text.split('\n').flatMap(hostname => (hostname.trim() ? [hostname.trim()] : []))
}

export function parseLandingPageUrls(text: string): string[] {
  return text.split('\n').flatMap(url => (url.trim() ? [url.trim()] : []))
}

export function landingPageUrlsToText(urls?: string[] | null): string {
  return urls?.join('\n') ?? ''
}

export function buildTopicRecommendationMutationInput(input: {
  title: string
  markdown: string
  topic_title: string
  topic_slug: string
  topic_markdown: string
  topic_hostname: string
  topic_hostnames: string
  topic_aliases: string
  topic_type: string
  example_referral_link: string
  landing_page_urls: string
}): TopicRecommendationMutationInput {
  return {
    title: input.title || undefined,
    markdown: input.markdown,
    ...buildTopicRecommendationFieldsPayload(input),
  }
}

export function buildTopicRecommendationFieldsPayload(input: {
  topic_title: string
  topic_slug: string
  topic_markdown: string
  topic_hostname: string
  topic_hostnames: string
  topic_aliases: string
  topic_type: string
  example_referral_link: string
  landing_page_urls: string
}) {
  return {
    topic_title: input.topic_title,
    topic_slug: input.topic_slug,
    topic_markdown: input.topic_markdown || undefined,
    topic_hostname: input.topic_hostname || undefined,
    topic_hostnames: parseHostnames(input.topic_hostnames),
    topic_aliases: parseAliases(input.topic_aliases),
    topic_type: input.topic_type as 'topic' | 'referral_program' | 'card',
    example_referral_link: input.example_referral_link.trim() || undefined,
    landing_page_urls: parseLandingPageUrls(input.landing_page_urls),
  }
}

export function getRecommendationFormDefaults(
  recommendation?: Pick<Post, 'title' | 'markdown' | 'topic_recommendation'>,
) {
  return {
    title: recommendation?.title ?? '',
    markdown: recommendation?.markdown ?? '',
    topic_title: recommendation?.topic_recommendation?.topic_title ?? '',
    topic_slug: recommendation?.topic_recommendation?.topic_slug ?? '',
    topic_markdown: recommendation?.topic_recommendation?.topic_markdown ?? '',
    topic_hostname: recommendation?.topic_recommendation?.hostname?.hostname ?? '',
    topic_hostnames: hostnamesToText(recommendation?.topic_recommendation?.hostnames),
    topic_aliases: aliasesToText(recommendation?.topic_recommendation?.aliases),
    topic_type: recommendation?.topic_recommendation?.topic_type ?? 'topic',
    example_referral_link: recommendation?.topic_recommendation?.example_referral_link ?? '',
    landing_page_urls: landingPageUrlsToText(
      recommendation?.topic_recommendation?.landing_page_urls,
    ),
  }
}
