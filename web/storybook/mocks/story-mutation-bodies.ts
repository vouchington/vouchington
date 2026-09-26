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
  const postType = storyField(body, 'post_type') === 'comment' ? 'comment' : 'link'
  return {
    post: {
      id: postType === 'comment' ? 'comment-story' : 'link-post-story',
      post_type: postType,
      slug: postType === 'comment' ? null : 'link-post-story',
      title: postType === 'comment' ? null : 'Story link',
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

export function patchedPost(endpoint: string, body: unknown): unknown {
  const markdown = storyField(body, 'markdown')
  return {
    post: {
      id: storyTail(endpoint),
      post_type: 'discussion',
      slug: 'post-story',
      ...(typeof markdown === 'string' ? { markdown } : {}),
      archived_at: storyField(body, 'archive') === true ? storyMutationAt : null,
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
