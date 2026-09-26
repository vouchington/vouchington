import { posts } from '@/storybook/entities/fixtures/posts'

export const storyMutationAt = '2026-09-26T00:00:00.000Z'

export function storyField(body: unknown, key: string): unknown {
  if (typeof body !== 'object' || body === null || !(key in body)) return undefined
  return (body as Record<string, unknown>)[key]
}

export function storyText(body: unknown, key: string): string {
  const value = storyField(body, key)
  return typeof value === 'string' ? value : ''
}

export function storyTail(endpoint: string): string {
  return endpoint.split('/').pop() ?? 'story'
}

export function createdPost(body: unknown): unknown {
  const postType = storyText(body, 'post_type') || 'link'
  const isComment = postType === 'comment'
  return {
    post: {
      id: isComment ? 'comment-story' : 'link-post-story',
      post_type: postType,
      slug: isComment ? null : 'link-post-story',
      title: isComment ? null : 'Story link',
      markdown: storyText(body, 'markdown'),
      archived_at: null,
    },
  }
}

export function purchaseIntent(body: unknown): unknown {
  return {
    purchase_intent: {
      id: 'intent-story',
      provider: 'stripe',
      product_id: storyText(body, 'product_id') || 'plus-monthly',
      launch: {
        kind: 'stripe_checkout',
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_storybook',
      },
      replayed: false,
    },
  }
}

export function modNote(body: unknown): unknown {
  return {
    note: {
      id: 'mod-note-story',
      created_at: storyMutationAt,
      target_user_id: 'user-cardholder',
      author_user_id: 'user-cardholder',
      community_id: storyField(body, 'community_id') ?? null,
      body: storyText(body, 'body'),
      deleted_at: null,
    },
  }
}

function editedPostType(endpoint: string, body: unknown): string {
  const explicit = storyText(body, 'post_type')
  if (explicit) return explicit
  const id = storyTail(endpoint)
  return id.startsWith('post-') ? id.slice('post-'.length) : 'discussion'
}

function editedSource(endpoint: string, body: unknown) {
  const id = storyTail(endpoint)
  const postType = editedPostType(endpoint, body)
  return (
    posts.find(post => post.id === id) ??
    posts.find(post => post.post_type === postType) ??
    posts.find(post => post.post_type === 'comment')!
  )
}

export function patchedPost(endpoint: string, body: unknown): unknown {
  const source = editedSource(endpoint, body)
  const markdown = storyField(body, 'markdown')
  const title = storyField(body, 'title')
  return {
    post: {
      ...source,
      id: storyTail(endpoint),
      post_type: editedPostType(endpoint, body),
      ...(typeof markdown === 'string' ? { markdown } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      archived_at: storyField(body, 'archive') === true ? storyMutationAt : source.archived_at,
      clearance_status: source.clearance_status ?? 'approved',
      can_delete: source.can_delete ?? true,
      can_edit_content: source.can_edit_content ?? true,
    },
  }
}

export function communityAgentPrompt(body: unknown): unknown {
  return {
    community_agent_prompt: {
      id: 'prompt-story',
      community_id: 'community-credit-cards',
      created_by_id: 'user-cardholder',
      agent_id: 'agent-community-mod',
      prompt: storyText(body, 'prompt'),
      model_name: 'gpt-4.1-mini',
      model_provider: 'openai',
      slot_allocated: false,
      on_flag_action: 'none',
      activated_at: null,
      deactivated_at: null,
      created_at: storyMutationAt,
      updated_at: storyMutationAt,
      deleted_at: null,
      deleted_by_id: null,
    },
  }
}

export function communityDiscussion(body: unknown): unknown {
  return {
    post: {
      id: 'discussion-story',
      post_type: 'discussion',
      slug: 'discussion-story',
      title: storyText(body, 'title') || 'Community discussion',
      archived_at: null,
    },
    community_post_review: {
      community_id: storyText(body, 'community_id'),
      post_id: 'discussion-story',
      approved_at: storyMutationAt,
      rejected_at: null,
      unpublished_at: null,
    },
  }
}

export function imageUploadUrl(body: unknown): unknown {
  return {
    upload: {
      image_id: 'image-story',
      upload_url: 'http://127.0.0.1/storybook-image-upload',
      content_type: storyText(body, 'content_type') || 'image/png',
      expires_at: storyMutationAt,
    },
  }
}

export function imageUploadCompletion(endpoint: string): unknown {
  return {
    image: {
      id: endpoint.split('/')[4] ?? 'image-story',
      upload_status: 'complete',
    },
  }
}

export function automodSimulation(body: unknown): unknown {
  return {
    simulation: {
      prompt_id: storyText(body, 'prompt_id') || 'prompt-story',
      time_window_hours: 24,
      sample_count: 1,
      would_flag_count: 1,
      would_unpublish_count: 0,
      false_positive_estimate: null,
    },
    results: [
      {
        post_id: 'post-story',
        title: 'Referral pitch',
        declared_language: 'en',
        lingua_rs_detected_language: 'en',
        post_type: 'discussion',
        approved_at: storyMutationAt,
        content_excerpt: 'Referral link without a personal data point',
        flagged: true,
        reason: 'Referral',
        would_unpublish: false,
      },
    ],
  }
}
