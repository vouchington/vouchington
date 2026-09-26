import { ClientRequest } from '@/lib/api/client/request'
import type { EmailPreferences } from '@/lib/api/client/email-preferences'
import type { NotificationsUnreadSummaryResponseBody } from '@/types/api-responses'
import { storybookAutocompleteResponse } from '@/storybook/design-system/autocomplete-fixtures'
import {
  disableInboxMutations,
  enableInboxMutations,
} from '@/storybook/mocks/inbox-mutation-fixture'

let notificationSettingsFixture: EmailPreferences | undefined
let inboxFixture: NotificationsUnreadSummaryResponseBody | undefined
let topicSearchFixture = false
const clientRequestGet = ClientRequest.prototype.get

export function setNotificationSettingsFixture(preferences: EmailPreferences): void {
  notificationSettingsFixture = preferences
}

export function clearNotificationSettingsFixture(): void {
  notificationSettingsFixture = undefined
}

export function setInboxFixture(): void {
  inboxFixture = enableInboxMutations()
}

export function clearInboxFixture(): void {
  disableInboxMutations()
  inboxFixture = undefined
}

export function setTopicSearchFixture(): void {
  topicSearchFixture = true
}

export function clearTopicSearchFixture(): void {
  topicSearchFixture = false
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
  if (endpoint === '/api/v1/topics' && topicSearchFixture) {
    return Promise.resolve(storybookAutocompleteResponse(endpoint, options?.searchParams) as T)
  }

  // Function.call does not preserve the generic return type of a method, although this is the
  // original ClientRequest.get implementation invoked with its original receiver.
  return clientRequestGet.call(this, endpoint, options) as Promise<T>
}
