import { ClientRequest } from '@/lib/api/client/request'

let storyMutations = false
const previousPost = ClientRequest.prototype.post
const previousPatch = ClientRequest.prototype.patch
const previousDelete = ClientRequest.prototype.delete

export function setStoryMutationFixture(): void {
  storyMutations = true
}

export function clearStoryMutationFixture(): void {
  storyMutations = false
}

function field(body: unknown, key: string): unknown {
  if (typeof body !== 'object' || body === null || !(key in body)) return undefined
  return (body as Record<string, unknown>)[key]
}

function postResponse(endpoint: string, body: unknown): unknown | undefined {
  if (endpoint === '/api/v1/markdown/preview') {
    const markdown = String(field(body, 'markdown') ?? '')
    return { html: markdown.trim() ? `<p>${markdown}</p>` : '' }
  }
  if (endpoint === '/api/v1/posts') {
    const postType = field(body, 'post_type') === 'comment' ? 'comment' : 'link'
    return {
      post: {
        id: postType === 'comment' ? 'comment-story' : 'link-post-story',
        post_type: postType,
        slug: postType === 'comment' ? null : 'link-post-story',
        title: postType === 'comment' ? null : 'Story link',
        markdown: String(field(body, 'markdown') ?? ''),
        archived_at: null,
      },
    }
  }
  if (endpoint === '/api/v1/appeals') return { appeal: { id: 'appeal-story' }, isDuplicate: false }
  if (endpoint === '/api/v1/membership-purchase-intents') {
    return {
      purchase_intent: {
        id: 'intent-story',
        provider: 'stripe',
        product_id: String(field(body, 'product_id') ?? 'plus-monthly'),
        launch: {
          kind: 'stripe_checkout',
          checkout_url: 'https://checkout.stripe.com/c/pay/cs_storybook',
        },
        replayed: false,
      },
    }
  }
  if (endpoint.endsWith('/agent-prompts')) return { prompt: { id: 'prompt-story' } }
  if (endpoint.endsWith('/invites')) return { community_invite: { id: 'invite-story' } }
  if (endpoint.endsWith('/members')) return {}
  if (endpoint.endsWith('/modmail')) return { thread: { id: 'modmail-thread-story' } }
  if (endpoint.endsWith('/mod-notes')) {
    return {
      note: {
        id: 'mod-note-story',
        created_at: '2026-09-26T00:00:00.000Z',
        target_user_id: 'user-cardholder',
        author_user_id: 'user-cardholder',
        community_id: field(body, 'community_id') ?? null,
        body: String(field(body, 'body') ?? ''),
        deleted_at: null,
      },
    }
  }
  return undefined
}

function patchResponse(endpoint: string, body: unknown): unknown | undefined {
  const archivedAt = field(body, 'archive') === true ? '2026-09-26T00:00:00.000Z' : null
  if (/^\/api\/v1\/posts\/[^/]+$/.test(endpoint)) {
    return {
      post: {
        id: 'post-story',
        post_type: 'discussion',
        slug: 'post-story',
        archived_at: archivedAt,
      },
    }
  }
  if (/^\/api\/v1\/communities\/[^/]+$/.test(endpoint)) {
    return { community: { archived_at: archivedAt } }
  }
  if (endpoint.startsWith('/api/v1/hostnames/')) return {}
  return undefined
}

function deleteResponse(endpoint: string): unknown | undefined {
  if (endpoint.includes('/mod-notes/')) return { ok: true }
  if (endpoint.includes('/invites/') || endpoint.endsWith('/members')) return {}
  return undefined
}

ClientRequest.prototype.post = function storybookMutationPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  const response = storyMutations ? postResponse(endpoint, body) : undefined
  if (response !== undefined) return Promise.resolve(response as T)
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.patch = function storybookMutationPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['patch']>[2],
): Promise<T> {
  const response = storyMutations ? patchResponse(endpoint, body) : undefined
  if (response !== undefined) return Promise.resolve(response as T)
  return previousPatch.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.delete = function storybookMutationDelete<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['delete']>[1],
): Promise<T> {
  const response = storyMutations ? deleteResponse(endpoint) : undefined
  if (response !== undefined) return Promise.resolve(response as T)
  return previousDelete.call(this, endpoint, options) as Promise<T>
}
