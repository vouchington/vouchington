import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
// Keep static service imports so no-mistakes selects these migration coverage tests
// when any migrated cursor caller changes; dynamic imports execute the cases below.
import '../../friend-recommendations/get-recommendations.mts'
import '../../moderator-actions/search.mts'
import '../../notifications/list.mts'
import '../../customer-support/contacts.mts'
import '../../customer-support/get-support-messages-by-thread-id.mts'
import '../../customer-support/search-support-threads.mts'
import '../../customer-support/threads.mts'
import '../../feeds/posts/get-ids/feed-cursor.mts'
import '../../posts/search/get-ids-page-info.mts'
import '../../recommended-rss-feeds/get-recommendations.mts'
import '../../recommended-topics/get-recommendations.mts'
import '../../referral-program-link-validations/list.mts'
import '../../referral-program-link-validations/rules/get.mts'
import '../../report-integrity/get-flags.mts'

const ID = '00000000-0000-4000-8000-000000000001'
const simple = encodeCursor({ id: ID })
const name = encodeCursor({ name: 'cursor-name', id: ID })
const score = encodeCursor({ score: 1, id: ID })
const ranking = encodeCursor({ ranking: 1, id: ID })
const timestamp = encodeCursor({ timestamp: Date.UTC(2024, 0, 1), id: ID })
const currentUser = { id: ID, roles: [] }

type CursorCase = [string, () => unknown | Promise<unknown>]

function cursorCase(label: string, run: () => unknown | Promise<unknown>): CursorCase {
  return [label, run]
}

const cases: CursorCase[] = [
  cursorCase('getFriendRecommendations', async () =>
    (await import('../../friend-recommendations/get-recommendations.mts')).getFriendRecommendations(
      currentUser as never,
      { after: simple, limit: 1 },
    ),
  ),
  cursorCase('searchModeratorActions', async () =>
    (await import('../../moderator-actions/search.mts')).searchModeratorActions({
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('listNotifications', async () =>
    (await import('../../notifications/list.mts')).listNotifications(ID, {
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('searchSupportContacts', async () =>
    (await import('../../customer-support/contacts.mts')).searchSupportContacts({
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('getSupportMessagesByThreadId', async () =>
    (
      await import('../../customer-support/get-support-messages-by-thread-id.mts')
    ).getSupportMessagesByThreadId(ID, { after: simple, limit: 1 }),
  ),
  cursorCase('getSupportThreadsByContactId', async () =>
    (await import('../../customer-support/threads.mts')).getSupportThreadsByContactId(ID, {
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('parsePostFeedCursor hot', async () =>
    (await import('../../feeds/posts/get-ids/feed-cursor.mts')).parsePostFeedCursor(score, 'hot'),
  ),
  cursorCase('parsePostFeedCursor timestamp', async () =>
    (await import('../../feeds/posts/get-ids/feed-cursor.mts')).parsePostFeedCursor(
      timestamp,
      'new',
    ),
  ),
  cursorCase('decodePostSearchCursor new', async () =>
    (await import('../../posts/search/get-ids-page-info.mts')).decodePostSearchCursor(
      { after: simple },
      'new',
      false,
    ),
  ),
  cursorCase('decodePostSearchCursor following_new', async () =>
    (await import('../../posts/search/get-ids-page-info.mts')).decodePostSearchCursor(
      { after: ranking },
      'following_new',
      false,
    ),
  ),
  cursorCase('decodePostSearchCursor best', async () =>
    (await import('../../posts/search/get-ids-page-info.mts')).decodePostSearchCursor(
      { after: score },
      'best',
      false,
    ),
  ),
  cursorCase('decodePostSearchCursor hot', async () =>
    (await import('../../posts/search/get-ids-page-info.mts')).decodePostSearchCursor(
      { after: score },
      'hot',
      false,
    ),
  ),
  cursorCase('decodePostSearchCursor relevance with ranking', async () =>
    (await import('../../posts/search/get-ids-page-info.mts')).decodePostSearchCursor(
      { after: ranking },
      'relevance',
      true,
    ),
  ),
  cursorCase('decodePostSearchCursor relevance simple', async () =>
    (await import('../../posts/search/get-ids-page-info.mts')).decodePostSearchCursor(
      { after: simple },
      'relevance',
      false,
    ),
  ),
  cursorCase('getRecommendedRssFeeds', async () =>
    (await import('../../recommended-rss-feeds/get-recommendations.mts')).getRecommendedRssFeeds(
      ID,
      {
        after: score,
        limit: 1,
      },
    ),
  ),
  cursorCase('getRecommendedTopics best', async () =>
    (await import('../../recommended-topics/get-recommendations.mts')).getRecommendedTopics(
      currentUser as never,
      { after: name, sort: 'best', limit: 1 },
    ),
  ),
  cursorCase('getRecommendedTopics score', async () =>
    (await import('../../recommended-topics/get-recommendations.mts')).getRecommendedTopics(
      currentUser as never,
      { after: score, sort: 'score', limit: 1 },
    ),
  ),
  cursorCase('listReferralLinkValidations', async () =>
    (await import('../../referral-program-link-validations/list.mts')).listReferralLinkValidations({
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('getReferralLinkValidationRules', async () =>
    (
      await import('../../referral-program-link-validations/rules/get.mts')
    ).getReferralLinkValidationRules(ID, { after: simple, limit: 1 }),
  ),
  cursorCase('getReportIntegrityFlags', async () =>
    (await import('../../report-integrity/get-flags.mts')).getReportIntegrityFlags({
      after: simple,
      limit: 1,
    }),
  ),
]

describe('migrated UUID cursor services part 2', () => {
  it.each(cases)('does not throw on UUID cursor in %s', async (_name, run) => {
    await expect(Promise.resolve(run())).resolves.toBeDefined()
  })

  it('rejects legacy ID-only support-thread cursors', async () => {
    await expect(
      (await import('../../customer-support/search-support-threads.mts')).searchSupportThreads({
        after: simple,
        limit: 1,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor format',
    })
  })

  it('rejects malformed UUID cursors in representative migrated services', async () => {
    await expect(
      (await import('../../notifications/list.mts')).listNotifications(ID, {
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
      (await import('../../notifications/list.mts')).listNotifications(ID, {
        after: encodeCursor({ id: 'not-a-uuid' }),
        limit: 1,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor: id is not a valid UUID',
    })
  })
})
