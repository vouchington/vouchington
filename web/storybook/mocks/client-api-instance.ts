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
  enableInboxMutations()
  inboxFixture = {
    unread_count: 1,
    results: [{ __entity_type: 'notification', id: 'notif-follow', read_at: null }],
    notifications: {
      'notif-follow': {
        __entity_type: 'notification',
        id: 'notif-follow',
        user_id: 'user-cardholder',
        entity_type: 'follow',
        post_id: null,
        rss_feed_item_id: null,
        actor_user_id: null,
        moderation_report_id: null,
        review_dispute_id: null,
        user_warning_id: null,
        conversation_id: null,
        community_id: null,
        copyright_notice_id: null,
        event_key: null,
        title: '@alex started following you',
        body: 'Alex Morgan followed your profile.',
        actor_label: null,
        target_path: '/user/alex',
        target_entity: null,
        target_intent: null,
        read_at: null,
        pushed_at: null,
        created_at: '2026-05-10T12:00:00.000Z',
        updated_at: '2026-05-10T12:00:00.000Z',
      },
    },
    communities: {},
  }
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
