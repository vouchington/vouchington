import { ClientRequest } from '@/lib/api/client/request'
import type { NotificationsUnreadSummaryResponseBody } from '@/types/api-responses'
import { inboxUnreadFixture } from '@/storybook/mocks/inbox-unread-fixture'

let inboxMutations = false
let inboxView: NotificationsUnreadSummaryResponseBody | undefined
const previousPost = ClientRequest.prototype.post
const previousPatch = ClientRequest.prototype.patch
const previousDelete = ClientRequest.prototype.delete

export function enableInboxMutations(): NotificationsUnreadSummaryResponseBody {
  inboxMutations = true
  inboxView = inboxUnreadFixture()
  return inboxView
}

export function disableInboxMutations(): void {
  inboxMutations = false
  inboxView = undefined
}

function forgetNotification(id: string): void {
  if (!inboxView) return
  inboxView.results = inboxView.results.filter(result => result.id !== id)
  inboxView.notifications = Object.fromEntries(
    Object.entries(inboxView.notifications).filter(([notificationId]) => notificationId !== id),
  )
  inboxView.unread_count = inboxView.results.length
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
    if (inboxView) {
      inboxView.unread_count = 0
      inboxView.results = []
      inboxView.notifications = {}
    }
    return Promise.resolve(undefined as T)
  }
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.patch = function storybookInboxPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['patch']>[2],
): Promise<T> {
  if (inboxMutations && isNotification(endpoint)) {
    const id = endpoint.split('/').pop()
    if (id) forgetNotification(id)
    return Promise.resolve(undefined as T)
  }
  return previousPatch.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.delete = function storybookInboxDelete<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['delete']>[1],
): Promise<T> {
  if (inboxMutations && isNotification(endpoint)) {
    const id = endpoint.split('/').pop()
    if (id) forgetNotification(id)
    return Promise.resolve(undefined as T)
  }
  return previousDelete.call(this, endpoint, options) as Promise<T>
}
