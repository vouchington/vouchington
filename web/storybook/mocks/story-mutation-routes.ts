import {
  patchedPost,
  storyField,
  storyMutationAt,
  storyTail,
  storyText,
  referralValidation,
} from './story-mutation-bodies'
import { storyMutationPost } from './story-mutation-post-routes'

export { storyMutationPost }

export function storyMutationPatch(endpoint: string, body: unknown): unknown | undefined {
  if (/^\/api\/v1\/posts\/[^/]+$/.test(endpoint)) return patchedPost(endpoint, body)
  if (/^\/api\/v1\/communities\/[^/]+$/.test(endpoint)) {
    return {
      community: { archived_at: storyField(body, 'archive') === true ? storyMutationAt : null },
    }
  }
  if (/^\/api\/v1\/communities\/[^/]+\/posts\/[^/]+$/.test(endpoint)) return {}
  if (/^\/api\/v1\/my\/messages\/[^/]+$/.test(endpoint)) {
    return { participant_add_policy: storyText(body, 'participant_add_policy') || 'owner_only' }
  }
  if (/\/agent-prompts\/[^/]+$/.test(endpoint)) {
    return {
      community_agent_prompt: { id: storyTail(endpoint), prompt: storyText(body, 'prompt') },
    }
  }
  if (endpoint.startsWith('/api/v1/hostnames/') || endpoint.includes('/ratings/')) return {}
  if (/^\/api\/v1\/communities\/[^/]+\/reports\/[^/]+$/.test(endpoint)) return {}
  if (/^\/api\/v1\/referral-link-validations\/[^/]+$/.test(endpoint))
    return referralValidation(body)
  return undefined
}

export function storyMutationDelete(endpoint: string): unknown | undefined {
  if (endpoint.includes('/mod-notes/')) return { ok: true }
  if (endpoint.includes('/invites/') || endpoint.endsWith('/members')) return {}
  if (/^\/api\/v1\/posts\/[^/]+$/.test(endpoint)) return {}
  if (endpoint.endsWith('/lock') || endpoint.includes('/items/posts/')) return {}
  if (endpoint.includes('/agent-prompts/') || endpoint.includes('/participants/')) return {}
  if (endpoint.endsWith('/escalation') || endpoint.endsWith('/claim')) return {}
  if (endpoint.startsWith('/api/v1/official-referral-links/')) return {}
  if (endpoint.includes('/link-validations/')) return {}
  if (endpoint.includes('/ratings/')) return {}
  if (endpoint.endsWith('/vote') || endpoint.includes('/bookmarks/')) return {}
  return undefined
}

export function storyMutationPut(endpoint: string): unknown | undefined {
  if (endpoint.endsWith('/claim')) {
    return {
      claim: {
        id: 'claim-story',
        community_id: 'community-story',
        report_id: null,
        post_id: null,
        claimed_by_id: 'user-story',
        claimed_at: storyMutationAt,
        released_at: null,
      },
      claimed_by_other: false,
    }
  }
  if (endpoint.endsWith('/images')) return { images: [] }
  if (endpoint.endsWith('/vote') || endpoint.includes('/bookmarks/')) return {}
  return undefined
}
