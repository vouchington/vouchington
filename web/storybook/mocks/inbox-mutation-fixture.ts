import { ClientRequest } from '@/lib/api/client/request'

let inboxMutations = false
const previousPost = ClientRequest.prototype.post
const previousPatch = ClientRequest.prototype.patch
const previousDelete = ClientRequest.prototype.delete

export function enableInboxMutations(): void {
  inboxMutations = true
}

export function disableInboxMutations(): void {
  inboxMutations = false
}

function isNotification(endpoint: string): boolean {
  return /^\/api\/v1\/my\/notifications\/[^/]+$/.test(endpoint)
}

ClientRequest.prototype.post = function storybookInboxPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  if (inboxMutations && endpoint === '/api/v1/my/notifications/read-all') {
    return Promise.resolve(undefined as T)
  }
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.patch = function storybookInboxPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['patch']>[2],
): Promise<T> {
  if (inboxMutations && isNotification(endpoint)) return Promise.resolve(undefined as T)
  return previousPatch.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.delete = function storybookInboxDelete<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['delete']>[1],
): Promise<T> {
  if (inboxMutations && isNotification(endpoint)) return Promise.resolve(undefined as T)
  return previousDelete.call(this, endpoint, options) as Promise<T>
}
