import { createEntityRelation } from '@/lib/api/client/entity-relations'
import { createCommunityPost } from '@/lib/api/client/posts'
import { loadMyCommunities } from '@/lib/api/client/communities'
import onError from '@/lib/on-error'
import type { Community } from '@/types/api-responses'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'

export async function loadAvailableCommunities(
  onAvailableCommunities?: (communities: NewsCommunityDiscussionTarget[]) => void,
): Promise<NewsCommunityDiscussionTarget[]> {
  const communities = await loadMyCommunities(undefined, [], available => {
    onAvailableCommunities?.(available.map(toTarget))
  })
  return communities.map(toTarget)
}

export function buildDiscussionMarkdown(relatedUrls: NewsCommunityDiscussionUrl[]): string {
  const seen = new Set<string>()
  const sourceLinks: string[] = []
  for (const url of relatedUrls) {
    if (seen.has(url.id)) continue
    seen.add(url.id)
    sourceLinks.push(`- [${url.url}](${url.url})`)
  }
  return sourceLinks.length > 0 ? `Source article:\n\n${sourceLinks.join('\n')}` : ''
}

export async function linkRelatedUrls(postId: string, relatedUrls: NewsCommunityDiscussionUrl[]) {
  const seen = new Set<string>()
  const uniqueUrls: NewsCommunityDiscussionUrl[] = []
  for (const url of relatedUrls) {
    if (seen.has(url.id)) continue
    seen.add(url.id)
    uniqueUrls.push(url)
  }
  if (uniqueUrls.length === 0) return
  const results = await Promise.allSettled(
    uniqueUrls.map(url => createEntityRelation('post', postId, 'related', 'url', url.id)),
  )
  if (results.some(result => result.status === 'rejected')) {
    onError(null, {
      fallback: 'Discussion created, but some article links failed to attach.',
      skipSentry: true,
    })
  }
}

export async function createLinkedCommunityDiscussion(
  community: NewsCommunityDiscussionTarget,
  relatedUrls: NewsCommunityDiscussionUrl[],
  options: {
    isPrivateCommunity: boolean
    itemTitle?: string | null
    recaptchaToken?: string | null
    turnstileToken?: string | null
  },
) {
  const response = await createCommunityPost(community.slug, {
    community_id: community.id,
    post_type: 'discussion',
    title: options.itemTitle ? `Discuss: ${options.itemTitle}` : 'Community discussion',
    markdown: buildDiscussionMarkdown(relatedUrls),
    broadcast: options.isPrivateCommunity ? 'users' : 'everyone',
    privacy: options.isPrivateCommunity ? 'private' : 'public',
    cf_turnstile_response: options.turnstileToken ?? undefined,
    recaptcha_token: options.recaptchaToken ?? undefined,
  })
  await linkRelatedUrls(response.post.id, relatedUrls)
  return { post: response.post, communityPostReview: response.community_post_review }
}

function toTarget(community: Community): NewsCommunityDiscussionTarget {
  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    visibility: community.visibility,
    post_approval_required_at: community.post_approval_required_at ?? null,
  }
}
