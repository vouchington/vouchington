import {
  encodeCursor,
  encodeScopedPreciseTimestampCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { AGENT_DIRECTORY_CURSOR_SCOPE, agentConversationListCursorScope } from '@modules/agents'
// Keep static service imports so no-mistakes selects these migration coverage tests
// when any migrated cursor caller changes; dynamic imports execute the cases below.
import '../../agents/conversations.mts'
import '../../agents/search.mts'
import '../../attribution/click-log.mts'
import '../../communities/applications/get.mts'
import '../../communities/bans/search.mts'
import '../../communities/invites/get.mts'
import '../../communities/list-items/get.mts'
import '../../communities/members/get.mts'
import '../../communities/publications/approved-posts.mts'
import '../../communities/publications/get.mts'
import '../../communities/publications/list-user-removed.mts'
import '../../communities/restrictions/search.mts'
import '../../communities/search/cursor.mts'
import '../../crawls/search.mts'
import '../../crm-contacts/search.mts'
import '../../crm-messages/get.mts'
import '../../crm-notes/get.mts'
import '../../feeds/referral-links/get.mts'

const ID = '00000000-0000-4000-8000-000000000001'
const simple = encodeCursor({ id: ID })
const name = encodeCursor({ name: 'cursor-name', id: ID })
const score = encodeCursor({ score: 1, id: ID })
const inactiveScore = encodeCursor({ score: 0, id: ID })
const ranking = encodeCursor({ ranking: 1, id: ID })
const currentUser = { id: ID, roles: [] }
const agentConversationScope = agentConversationListCursorScope({
  agentSystemUserId: ID,
  onlyLinked: false,
})
const agentConversationCursor = encodeScopedUuidCursor(ID, agentConversationScope)
const agentDirectoryCursor = encodeScopedUuidCursor(ID, AGENT_DIRECTORY_CURSOR_SCOPE)
const userCommunityBansCursor = encodeScopedUuidCursor(
  ID,
  `user-community-bans:${ID}:active:id-desc`,
)
const userRemovedPostsCursor = encodeScopedPreciseTimestampCursor(
  '2024-01-01T00:00:00.000000Z',
  ID,
  `user-removed-community-posts:${ID}:unpublished-desc-post-id-desc`,
)

type CursorCase = [string, () => unknown | Promise<unknown>]

function cursorCase(label: string, run: () => unknown | Promise<unknown>): CursorCase {
  return [label, run]
}

const cases: CursorCase[] = [
  cursorCase('searchAgentConversations', async () =>
    (await import('../../agents/conversations.mts')).searchAgentConversations(ID, {
      after: agentConversationCursor,
      limit: 1,
    }),
  ),
  cursorCase('searchAgents', async () =>
    (await import('../../agents/search.mts')).searchAgents({
      after: agentDirectoryCursor,
      limit: 1,
    }),
  ),
  cursorCase('getReferralClickLog', async () =>
    (await import('../../attribution/click-log.mts')).getReferralClickLog(ID, {
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('searchApplications', async () =>
    (await import('../../communities/applications/get.mts')).searchApplications(ID, {
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('listUserActiveCommunityBans', async () =>
    (await import('../../communities/bans/search.mts')).listUserActiveCommunityBans(ID, {
      after: userCommunityBansCursor,
      limit: 1,
    }),
  ),
  cursorCase('searchCommunityBans', async () =>
    (await import('../../communities/bans/search.mts')).searchCommunityBans(ID, {
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('searchInvites', async () =>
    (await import('../../communities/invites/get.mts')).searchInvites(ID, {
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('searchCommunityListItems', async () =>
    (await import('../../communities/list-items/get.mts')).searchCommunityListItems(ID, 'topic', {
      after: ranking,
      limit: 1,
    }),
  ),
  cursorCase('searchCommunityMembers', async () =>
    (await import('../../communities/members/get.mts')).searchCommunityMembers(ID, {
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('searchCommunityPosts hot cursor', async () =>
    (await import('../../communities/publications/approved-posts.mts')).searchCommunityPosts(ID, {
      after: score,
      sort: 'hot',
      limit: 1,
    }),
  ),
  cursorCase('searchCommunityPosts new cursor', async () =>
    (await import('../../communities/publications/approved-posts.mts')).searchCommunityPosts(ID, {
      after: simple,
      sort: 'new',
      limit: 1,
    }),
  ),
  cursorCase('searchPendingPosts', async () =>
    (await import('../../communities/publications/get.mts')).searchPendingPosts(ID, {
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('listUserRemovedPosts', async () =>
    (await import('../../communities/publications/list-user-removed.mts')).listUserRemovedPosts(
      ID,
      {
        after: userRemovedPostsCursor,
        limit: 1,
      },
    ),
  ),
  cursorCase('searchCommunityRestrictions', async () =>
    (await import('../../communities/restrictions/search.mts')).searchCommunityRestrictions(ID, {
      after: inactiveScore,
      limit: 1,
    }),
  ),
  cursorCase('parseCommunitySearchCursor name', async () =>
    (await import('../../communities/search/cursor.mts')).parseCommunitySearchCursor(name, 'name'),
  ),
  cursorCase('parseCommunitySearchCursor score', async () =>
    (await import('../../communities/search/cursor.mts')).parseCommunitySearchCursor(
      score,
      'members',
    ),
  ),
  cursorCase('searchCrawlsForUrl', async () =>
    (await import('../../crawls/search.mts')).searchCrawlsForUrl(ID, { after: simple, limit: 1 }),
  ),
  cursorCase('searchCrmContacts', async () =>
    (await import('../../crm-contacts/search.mts')).searchCrmContacts({ after: name, limit: 1 }),
  ),
  cursorCase('getCrmMessagesByConversationId', async () =>
    (await import('../../crm-messages/get.mts')).getCrmMessagesByConversationId(ID, {
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('getCrmNotesByContactId', async () =>
    (await import('../../crm-notes/get.mts')).getCrmNotesByContactId(ID, {
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('getReferralLinksFeed', async () =>
    (await import('../../feeds/referral-links/get.mts')).getReferralLinksFeed(
      currentUser as never,
      'follow_users',
      { after: simple, limit: 1 },
    ),
  ),
]

describe('migrated UUID cursor services part 1', () => {
  it.each(cases)('does not throw on UUID cursor in %s', async (_name, run) => {
    await expect(Promise.resolve(run())).resolves.toBeDefined()
  })

  it('rejects malformed UUID cursors in representative migrated services', async () => {
    await expect(
      (await import('../../agents/conversations.mts')).searchAgentConversations(ID, {
        after: 'not-valid-base64!!!',
        limit: 1,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Invalid cursor format'),
    })
  })

  it('rejects non-UUID cursor ids in representative migrated services', async () => {
    await expect(
      (await import('../../agents/conversations.mts')).searchAgentConversations(ID, {
        after: encodeCursor({ id: 'not-a-uuid', scope: agentConversationScope }),
        limit: 1,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor: id is not a valid UUID',
    })
  })
})
