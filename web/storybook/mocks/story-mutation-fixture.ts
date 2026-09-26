import { ClientRequest } from '@/lib/api/client/request'
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

export function setStoryMutationFixture(): void {
  storyMutations = true
}

export function clearStoryMutationFixture(): void {
  storyMutations = false
}

function respond<T>(response: unknown, fallback: () => Promise<T>): Promise<T> {
  if (response !== undefined) return Promise.resolve(response as T)
  return fallback()
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
