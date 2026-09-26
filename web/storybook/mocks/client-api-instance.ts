import { ClientRequest } from '@/lib/api/client/request'
import type { EmailPreferences } from '@/lib/api/client/email-preferences'
import type { NotificationsUnreadSummaryResponseBody } from '@/types/api-responses'

let notificationSettingsFixture: EmailPreferences | undefined
let inboxFixture: NotificationsUnreadSummaryResponseBody | undefined
const clientRequestGet = ClientRequest.prototype.get

export function setNotificationSettingsFixture(preferences: EmailPreferences): void {
  notificationSettingsFixture = preferences
}

export function clearNotificationSettingsFixture(): void {
  notificationSettingsFixture = undefined
}

export function setInboxFixture(): void {
  inboxFixture = {
    unread_count: 1,
    results: [{ id: 'notif-follow' }],
    notifications: {
      'notif-follow': {
        id: 'notif-follow',
        entity_type: 'follow',
        title: '@alex started following you',
        body: 'Alex Morgan followed your profile.',
        read_at: null,
        created_at: '2026-05-10T12:00:00.000Z',
        target_path: '/user/alex',
      },
    },
    communities: {},
  } as NotificationsUnreadSummaryResponseBody
}

export function clearInboxFixture(): void {
  inboxFixture = undefined
}

ClientRequest.prototype.get = function storybookClientRequestGet<T>(
  endpoint: string,
  options?: {
    searchParams?: Record<string, string | number | boolean | undefined>
    signal?: AbortSignal
  },
): Promise<T> {
  if (
    endpoint === '/api/v1/my/email-preferences' &&
    options?.searchParams === undefined &&
    notificationSettingsFixture !== undefined
  ) {
    return Promise.resolve({ email_preferences: notificationSettingsFixture } as T)
  }
  if (endpoint === '/api/v1/my/notifications/unread' && inboxFixture !== undefined) {
    return Promise.resolve(inboxFixture as T)
  }

  // Function.call does not preserve the generic return type of a method, although this is the
  // original ClientRequest.get implementation invoked with its original receiver.
  return clientRequestGet.call(this, endpoint, options) as Promise<T>
}
