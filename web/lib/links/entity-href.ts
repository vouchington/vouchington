export * from './topic-hrefs'
export * from './list-hrefs'

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

export function communityPostsHref(community: string | SlugInput): string {
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

export function createAgentPathname(agent: string | OptionalSlugInput, suffix = ''): string {
  return `/agent/${optionalSlugOrId(agent)}${suffix}`
}

export function agentHref(agent: OptionalSlugInput): string {
  return `/agent/${optionalSlugOrId(agent)}`
}

export function agentConversationHref(
  agent: string | OptionalSlugInput,
  conversation: string | IdInput,
) {
  return createAgentPathname(agent, `/conversation/${idOrValue(conversation)}`)
}

export function chatSupportThreadHref(thread: string | IdInput): string {
  return `/chat/support/${idOrValue(thread)}`
}

export function messagesHref(conversation: string | IdInput): string {
  return `/messages/${idOrValue(conversation)}`
}

export function modmailThreadHref(community: string | SlugInput, thread: string | IdInput): string {
  return `/messages/modmail/${slugOrValue(community)}/${idOrValue(thread)}`
}

export function crmContactHref(contact: string | IdInput): string {
  return `/crm/${idOrValue(contact)}`
}

export function createUrlPathname(url: string | IdInput, suffix = ''): string {
  return `/url/${idOrValue(url)}${suffix}`
}

export function urlHref(url: string | IdInput): string {
  return `/url/${idOrValue(url)}`
}

export function createDomainPathname(domain: string | HostnameInput, suffix = ''): string {
  const idOrHostname =
    typeof domain === 'string' ? domain : 'hostname' in domain ? domain.hostname : domain.id
  return `/domain/${idOrHostname}${suffix}`
}

export function domainHref(domain: string | HostnameInput): string {
  return `/domain/${typeof domain === 'string' ? domain : 'hostname' in domain ? domain.hostname : domain.id}`
}

export function supportThreadHref(thread: string | IdInput): string {
  return `/support/threads/${idOrValue(thread)}`
}

export function supportContactHref(contact: string | IdInput): string {
  return `/support/contacts/${idOrValue(contact)}`
}

export function supportContactsHref(query = ''): string {
  return `/support/contacts${query}`
}

export function topicRecommendationHref(recommendation: string | IdInput, suffix = ''): string {
  return `/topic-recommendations/${idOrValue(recommendation)}${suffix}`
}

export function topicClaimHref(topic: string | IdInput): string {
  return `/topic-claims/${idOrValue(topic)}`
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

export function myLandingPagesHref(): string {
  return '/my/landing-pages'
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

export function plansHref(): string {
  return '/plans'
}

export function myMembershipHref(): string {
  return '/my/membership'
}

export function membershipGrantsHref(): string {
  return '/memberships/grants'
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
