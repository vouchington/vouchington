import { ClientRequest } from '@/lib/api/client/request'
import type { EmailPreferences } from '@/lib/api/client/email-preferences'
import type {
  CommunitiesSearchResponseBody,
  Community,
  ListsSearchResponseBody,
  NotificationsUnreadSummaryResponseBody,
  UserModerationContextResponse,
} from '@/types/api-responses'
import { storybookAutocompleteResponse } from '@/storybook/design-system/autocomplete-fixtures'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import {
  disableInboxMutations,
  enableInboxMutations,
} from '@/storybook/mocks/inbox-mutation-fixture'
import { inboxUnreadFixture } from '@/storybook/mocks/inbox-unread-fixture'

const emptyPage = { has_next_page: false, end_cursor: null, start_cursor: null }
const creditCards = communities[0]!

let notificationSettingsFixture: EmailPreferences | undefined
let inboxFixture: NotificationsUnreadSummaryResponseBody | undefined
let myCommunitiesFixture: CommunitiesSearchResponseBody | undefined
let myListsFixture: ListsSearchResponseBody | undefined
let moderationContextFixture: UserModerationContextResponse | undefined
let userSearchFixture = false
let topicSearchFixture = false
let categoryRelationsFixture = false
const clientRequestGet = ClientRequest.prototype.get

export function setNotificationSettingsFixture(preferences: EmailPreferences): void {
  notificationSettingsFixture = preferences
}

export function clearNotificationSettingsFixture(): void {
  notificationSettingsFixture = undefined
}

export function setInboxFixture(): void {
  enableInboxMutations()
  inboxFixture = inboxUnreadFixture()
}

export function clearInboxFixture(): void {
  disableInboxMutations()
  inboxFixture = undefined
}

export function clearMyCommunitiesFixture(): void {
  myCommunitiesFixture = undefined
}

export function setMyCommunitiesFixture(): void {
  myCommunitiesFixture = {
    results: [{ __entity_type: 'community', id: creditCards.id }],
    page_info: emptyPage,
    communities: { [creditCards.id]: creditCards as unknown as Community },
    users: {},
    community_metrics: {},
  }
}

export function clearMyListsFixture(): void {
  myListsFixture = undefined
}

export function setMyListsFixture(): void {
  const listId = 'list-card-reviews'
  myListsFixture = {
    results: [{ __entity_type: 'list', id: listId }],
    page_info: emptyPage,
    lists: {
      [listId]: {
        __entity_type: 'list',
        id: listId,
        owner_user_id: publicUsers[0]!.id,
        name: 'Card reviews',
        description: null,
        visibility: 'private',
        created_at: '2026-01-15T00:00:00.000Z',
        updated_at: '2026-01-15T00:00:00.000Z',
        removed_at: null,
      },
    },
  }
}

export function clearModerationContextFixture(): void {
  moderationContextFixture = undefined
}

export function setUserSearchFixture(): void {
  userSearchFixture = true
}

export function clearUserSearchFixture(): void {
  userSearchFixture = false
}

export function setTopicSearchFixture(): void {
  topicSearchFixture = true
}

export function clearTopicSearchFixture(): void {
  topicSearchFixture = false
}

export function setCategoryRelationsFixture(): void {
  categoryRelationsFixture = true
}

export function clearCategoryRelationsFixture(): void {
  categoryRelationsFixture = false
}

export function setModerationContextFixture(): void {
  moderationContextFixture = {
    context: {
      account_age_ms: 86_400_000,
      trust_tier: 2,
      active_suspension: null,
      content_removal_count: 0,
      community_removal_count: 0,
    },
    notes: [
      {
        id: 'mod-note-cardholder',
        created_at: '2026-05-01T00:00:00.000Z',
        target_user_id: publicUsers[0]!.id,
        author_user_id: publicUsers[0]!.id,
        community_id: creditCards.id,
        body: 'Asked for a product-change screenshot before the next review.',
        deleted_at: null,
      },
    ],
    page_info: { has_next_page: false },
  }
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
  if (
    endpoint === '/api/v1/communities' &&
    options?.searchParams?.member_id === 'me' &&
    myCommunitiesFixture !== undefined
  ) {
    return Promise.resolve(myCommunitiesFixture as T)
  }
  if (endpoint === '/api/v1/lists' && myListsFixture !== undefined) {
    return Promise.resolve(myListsFixture as T)
  }
  if (endpoint === '/api/v1/lists/contains' && myListsFixture !== undefined) {
    return Promise.resolve({ list_ids: Object.keys(myListsFixture.lists) } as T)
  }
  if (endpoint.startsWith('/api/v1/entity-relations/') && categoryRelationsFixture) {
    return Promise.resolve({
      results: [],
      page_info: emptyPage,
      entity_relations: {},
    } as T)
  }
  if (endpoint.endsWith('/moderation-context') && moderationContextFixture !== undefined) {
    return Promise.resolve(moderationContextFixture as T)
  }
  if (endpoint === '/api/v1/users' && userSearchFixture) {
    return Promise.resolve(storybookAutocompleteResponse(endpoint) as T)
  }

  // Function.call does not preserve the generic return type of a method, although this is the
  // original ClientRequest.get implementation invoked with its original receiver.
  return clientRequestGet.call(this, endpoint, options) as Promise<T>
}
