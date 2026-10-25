import { ClientRequest } from '@vouchington/api-client'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { resetModNoteSequence } from './story-mutation-bodies'
import { resetParticipantSequence } from './story-mutation-participant'
import { resetInviteSequence } from './story-mutation-post-routes'
import { resetStorySourceImport, storySourceImportStatus } from './story-mutation-claim'
import { clearStoryTopicRoutes, setStoryTopicRoutes } from './story-topic-routes'
import {
  storyMutationDelete,
  storyMutationPatch,
  storyMutationPost,
  storyMutationPut,
} from './story-mutation-routes'

let storyMutations = false
const previousPost = ClientRequest.prototype.post
const previousPatch = ClientRequest.prototype.patch
const previousDelete = ClientRequest.prototype.delete
const previousPut = ClientRequest.prototype.put
const previousGet = ClientRequest.prototype.get
const previousFetch = globalThis.fetch

export function setStoryMutationFixture(): void {
  storyMutations = true
  resetModNoteSequence()
  resetParticipantSequence()
  resetInviteSequence()
  resetStorySourceImport()
  setStoryTopicRoutes()
}

export function clearStoryMutationFixture(): void {
  storyMutations = false
  resetModNoteSequence()
  resetParticipantSequence()
  resetInviteSequence()
  resetStorySourceImport()
  clearStoryTopicRoutes()
}

globalThis.fetch = function storybookMutationFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const endpoint =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const status = storyMutations ? storySourceImportStatus(endpoint) : undefined
  if (status !== undefined) {
    return Promise.resolve(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  return previousFetch.call(globalThis, input, init)
}

function respond<T>(response: unknown, fallback: () => Promise<T>): Promise<T> {
  if (response !== undefined) return Promise.resolve(response as T)
  return fallback()
}

ClientRequest.prototype.get = function storybookMutationGet<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['get']>[1],
): Promise<T> {
  if (storyMutations && endpoint.startsWith('/api/v1/bookmarks/')) {
    return Promise.resolve({ bookmarks: {} } as T)
  }
  if (storyMutations && endpoint.includes('/users/followers')) {
    return Promise.resolve({
      results: [publicUsers[0]!],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    } as T)
  }
  return previousGet.call(this, endpoint, options) as Promise<T>
}

ClientRequest.prototype.post = function storybookMutationPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  const response = storyMutations ? storyMutationPost(endpoint, body) : undefined
  return respond(response, () => previousPost.call(this, endpoint, body, options) as Promise<T>)
}

ClientRequest.prototype.patch = function storybookMutationPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['patch']>[2],
): Promise<T> {
  const response = storyMutations ? storyMutationPatch(endpoint, body) : undefined
  return respond(response, () => previousPatch.call(this, endpoint, body, options) as Promise<T>)
}

ClientRequest.prototype.delete = function storybookMutationDelete<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['delete']>[1],
): Promise<T> {
  const response = storyMutations ? storyMutationDelete(endpoint) : undefined
  return respond(response, () => previousDelete.call(this, endpoint, options) as Promise<T>)
}

ClientRequest.prototype.put = function storybookMutationPut<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['put']>[2],
): Promise<T> {
  const response = storyMutations ? storyMutationPut(endpoint) : undefined
  return respond(response, () => previousPut.call(this, endpoint, body, options) as Promise<T>)
}
