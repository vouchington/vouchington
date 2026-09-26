import {
  automodSimulation,
  communityDiscussion,
  createdPost,
  imageUploadCompletion,
  imageUploadUrl,
  modNote,
  communityAgentPrompt,
  purchaseIntent,
  storyMutationAt,
  storyText,
} from './story-mutation-bodies'
import { categoryRelationPost } from './category-relations-store'
import { conversationParticipant } from './story-mutation-participant'

function exactPost(endpoint: string, body: unknown): unknown | undefined {
  if (endpoint === '/api/v1/markdown/preview') {
    const markdown = storyText(body, 'markdown')
    return { html: markdown.trim() ? `<p>${markdown}</p>` : '' }
  }
  if (endpoint === '/api/v1/posts') return createdPost(body)
  if (endpoint === '/api/v1/appeals') return { appeal: { id: 'appeal-story' }, isDuplicate: false }
  if (endpoint === '/api/v1/disputes') {
    return {
      dispute: {
        id: 'dispute-story',
        post_id: storyText(body, 'post_id'),
        topic_id: storyText(body, 'topic_id'),
        reason: storyText(body, 'reason') || 'other',
        status: 'pending',
        post_content: null,
        created_at: storyMutationAt,
      },
      is_duplicate: false,
    }
  }
  if (endpoint === '/api/v1/hostnames') {
    return { id: 'hostname-story', hostname: storyText(body, 'hostname') }
  }
  if (endpoint === '/api/v1/memberships/billing-portal-sessions') {
    return { portal_session: { url: 'https://billing.stripe.com/p/session/storybook' } }
  }
  if (endpoint === '/api/v1/membership-purchase-intents') return purchaseIntent(body)
  return undefined
}

function communityInvite(body: unknown) {
  const email = storyText(body, 'email')
  const username = storyText(body, 'username')
  return {
    community_invite: {
      __entity_type: 'community_invite' as const,
      id: 'invite-story',
      code: 'STORY1',
      community_id: 'community-story',
      invited_user_id: username || null,
      invited_email: email || null,
      invited_by_id: 'story-user',
      accepted_at: null,
      accepted_by_user_id: null,
      declined_at: null,
      revoked_at: null,
      created_at: storyMutationAt,
    },
  }
}

function patternPost(endpoint: string, body: unknown): unknown | undefined {
  if (/^\/api\/v1\/communities\/[^/]+\/posts$/.test(endpoint)) return communityDiscussion(body)
  if (endpoint.endsWith('/automod/simulate')) return automodSimulation(body)
  if (endpoint.includes('/automod/recent-actions/') && endpoint.endsWith('/feedback')) {
    return { applied_action: true }
  }
  if (endpoint.includes('/reports/') && endpoint.endsWith('/modmail')) {
    return { conversation: { id: 'modmail-story' } }
  }
  if (endpoint.endsWith('/mod-internal-thread')) {
    return { conversation: { id: 'conversation-story' } }
  }
  if (/^\/api\/v1\/my\/messages\/[^/]+\/participants$/.test(endpoint)) {
    return conversationParticipant(endpoint, body)
  }
  if (endpoint.startsWith('/api/v1/entity-relations/')) return categoryRelationPost(body)
  if (endpoint.endsWith('/items/posts') || endpoint.endsWith('/lock')) return {}
  if (endpoint.endsWith('/allocations') || endpoint.endsWith('/escalation')) return {}
  if (endpoint.endsWith('/ratings') || endpoint.endsWith('/import')) {
    return endpoint.endsWith('/import') ? { posts: 1, items: 1 } : {}
  }
  if (endpoint.endsWith('/warnings')) {
    return {
      warning: {
        id: 'warning-story',
        reason: storyText(body, 'reason'),
        created_at: storyMutationAt,
      },
    }
  }
  if (endpoint === '/api/v1/images/upload-url') return imageUploadUrl(body)
  if (/^\/api\/v1\/images\/[^/]+\/completions$/.test(endpoint))
    return imageUploadCompletion(endpoint)
  if (endpoint.endsWith('/official-referral-links')) {
    return { official_referral_link: { id: 'official-link-story' } }
  }
  if (endpoint.endsWith('/agent-prompts')) return communityAgentPrompt(body)
  if (endpoint.endsWith('/invites')) return communityInvite(body)
  if (endpoint.endsWith('/members')) return {}
  if (endpoint.endsWith('/modmail')) return { thread: { id: 'modmail-thread-story' } }
  if (endpoint.endsWith('/mod-notes')) return modNote(body)
  return undefined
}

function followerActionPost(endpoint: string): unknown | undefined {
  if (endpoint === '/api/v1/reports') {
    return {
      report: {
        id: 'report-story',
        status: 'pending',
        entity_type: 'post',
        entity_id: 'post-story',
      },
      isDuplicate: false,
    }
  }
  if (/\/posts\/[^/]+\/(?:shares|sends)$/.test(endpoint)) {
    return { status: 'accepted', distribution_id: 'distribution-story' }
  }
  return undefined
}

export function storyMutationPost(endpoint: string, body: unknown): unknown | undefined {
  return exactPost(endpoint, body) ?? patternPost(endpoint, body) ?? followerActionPost(endpoint)
}
