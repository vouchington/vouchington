export * from './topic-hrefs'
export * from './list-hrefs'
import { createTopicPathname } from './topic-hrefs'

export type UserTab = 'reviews' | 'discussions' | 'comments' | 'landing'

type UserHrefInput = { username?: string | null; id: string }
type SlugInput = { slug: string }
type IdInput = { id: string }
type OptionalSlugInput = { slug?: string | null; id: string }
type HostnameInput = { hostname: string } | { id: string }

function idOrValue(input: string | IdInput): string {
  return typeof input === 'string' ? input : input.id
}

function slugOrValue(input: string | SlugInput): string {
  return typeof input === 'string' ? input : input.slug
}

function optionalSlugOrId(input: string | OptionalSlugInput): string {
  return typeof input === 'string' ? input : input.slug || input.id
}

export function createCrawlerPathname(crawler: string | IdInput, suffix = ''): string {
  return `/crawler/${idOrValue(crawler)}${suffix}`
}

export function createUserPathname(user: string | UserHrefInput, suffix = ''): string {
  const idOrUsername = typeof user === 'string' ? user : (user.username ?? user.id)
  return `/user/${idOrUsername}${suffix}`
}

export function userHref(user: UserHrefInput, tab?: UserTab): string {
  return createUserPathname(user, tab ? `/${tab}` : '')
}

export function createCommunityPathname(community: string | SlugInput, suffix = ''): string {
  return `/communities/${slugOrValue(community)}${suffix}`
}

export function communityHref(community: SlugInput): string {
  return `/communities/${community.slug}`
}

function communityPostsHref(community: string | SlugInput): string {
  return createCommunityPathname(community, '/posts')
}

export function communityPendingPostsHref(community: string | SlugInput): string {
  return `${communityPostsHref(community)}?post=pending`
}

export function createPostPathname(
  postTypeSlug: string,
  post: string | OptionalSlugInput,
  suffix = '',
) {
  return `/${postTypeSlug}/${optionalSlugOrId(post)}${suffix}`
}

export function reviewHref(review: string | OptionalSlugInput): string {
  return createPostPathname('review', review)
}

export function messagesHref(conversation: string | IdInput): string {
  return `/messages/${idOrValue(conversation)}`
}

export function modmailThreadHref(community: string | SlugInput, thread: string | IdInput): string {
  return `/messages/modmail/${slugOrValue(community)}/${idOrValue(thread)}`
}

export function urlHref(url: string | { url: string }, suffix = ''): string {
  const urlValue = typeof url === 'string' ? url : url.url
  return `/url/${encodeURIComponent(urlValue)}${suffix}`
}

export function urlCrawlHref(url: string | { url: string }, crawl: string | IdInput): string {
  return urlHref(url, `/crawls/${idOrValue(crawl)}`)
}

export function domainHref(domain: string | HostnameInput): string {
  return `/domain/${typeof domain === 'string' ? domain : 'hostname' in domain ? domain.hostname : domain.id}`
}

export function topicRecommendationHref(recommendation: string | SlugInput, suffix = ''): string {
  return `/topic-recommendations/${slugOrValue(recommendation)}${suffix}`
}

export function topicClaimHref(topic: string | SlugInput): string {
  return `/topic-claims/${slugOrValue(topic)}`
}

export function referralValidationHref(
  program: string | SlugInput,
  validation: string | SlugInput,
): string {
  return `${createTopicPathname({ topic_type: 'referral_program', slug: slugOrValue(program) }, '/validations')}/${slugOrValue(validation)}`
}

export function adminLandingPageAnalyticsHref(
  owner: string | { username: string },
  page: string | SlugInput,
): string {
  const username = typeof owner === 'string' ? owner : owner.username
  return `/landing/${username}/${slugOrValue(page)}/analytics`
}

export function landingPageHref(owner: string | { username: string }): string {
  const username = typeof owner === 'string' ? owner : owner.username
  return `/@${username}`
}

export function landingPageNamedHref(
  owner: string | { username: string },
  slug?: string | null,
): string {
  return slug ? `${landingPageHref(owner)}/${slug}` : landingPageHref(owner)
}

export function myLandingPageHref(page: string | SlugInput, suffix = ''): string {
  return `/my/landing-page/${slugOrValue(page)}${suffix}`
}

export function compareHref(slugPair: string): string {
  return `/compare/${slugPair}`
}

export function podcastsHref(): string {
  return '/podcasts'
}
export function podcastCategoryHref(category: string | SlugInput): string {
  return `/podcasts/${slugOrValue(category)}`
}

export function userTabForPostType(postType: string | undefined): UserTab | undefined {
  switch (postType) {
    case 'review': {
      return 'reviews'
    }
    case 'discussion':
    case 'story':
    case 'article':
    case 'blog_post': {
      return 'discussions'
    }
    case 'comment': {
      return 'comments'
    }
    default: {
      return undefined
    }
  }
}
