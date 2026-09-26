import {
  automodSimulation,
  communityDiscussion,
  createdPost,
  modNote,
  patchedPost,
  purchaseIntent,
  storyField,
  storyMutationAt,
  storyTail,
  storyText,
} from './story-mutation-bodies'

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
    return {
      participant: {
        id: 'participant-story',
        conversation_id: endpoint.split('/')[5] ?? 'conversation-story',
        user_id: storyText(body, 'user_id'),
        role: 'member',
        created_at: storyMutationAt,
        username: null,
        profile_image_id: null,
      },
    }
  }
  if (endpoint.startsWith('/api/v1/entity-relations/')) {
    return {
      relation: {
        id: 'relation-story',
        created_at: storyMutationAt,
        created_by_id: null,
        object_data: {},
      },
    }
  }
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
  if (endpoint.endsWith('/agent-prompts')) return { prompt: { id: 'prompt-story' } }
  if (endpoint.endsWith('/invites')) return { community_invite: { id: 'invite-story' } }
  if (endpoint.endsWith('/members')) return {}
  if (endpoint.endsWith('/modmail')) return { thread: { id: 'modmail-thread-story' } }
  if (endpoint.endsWith('/mod-notes')) return modNote(body)
  return undefined
}

export function storyMutationPost(endpoint: string, body: unknown): unknown | undefined {
  return exactPost(endpoint, body) ?? patternPost(endpoint, body)
}

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
  return undefined
}

export function storyMutationDelete(endpoint: string): unknown | undefined {
  if (endpoint.includes('/mod-notes/')) return { ok: true }
  if (endpoint.includes('/invites/') || endpoint.endsWith('/members')) return {}
  if (/^\/api\/v1\/posts\/[^/]+$/.test(endpoint)) return {}
  if (endpoint.endsWith('/lock') || endpoint.includes('/items/posts/')) return {}
  if (endpoint.includes('/agent-prompts/') || endpoint.includes('/participants/')) return {}
  if (endpoint.endsWith('/escalation') || endpoint.endsWith('/claim')) return {}
  if (endpoint.includes('/ratings/')) return {}
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
  return undefined
}
