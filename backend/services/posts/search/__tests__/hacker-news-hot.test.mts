import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
  setPostVotesScoreUp,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { setHackerNewsReferenceFlagsForTest } from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { decodePostSearchCursor } from '../get-ids-page-info.mts'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { getPostIds } from '../get-ids.mts'
import { postsWorkConfig } from '../../work-limits.mts'
import {
  createSemanticWindowEmbedding,
  insertSemanticWindowPosts,
} from '../../../../test-helpers/post-semantic-window.mts'

// Future-dated posts do not decay, so hot cursors stay stable across SQL NOW() calls.
const NON_DECAYING_INSTANT = Date.parse('9999-12-31T23:59:59Z')

describe('Hacker News hot search bounds', () => {
  it('pages inside the newest hot cohort for every window and ignores hidden HN', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected a hot search test user')
    await Promise.all([
      postsWorkConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    const ids: string[] = []
    const restoreCap = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 2,
    })
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: true,
    })
    try {
      for (const [index, score] of [1, 1, 100].entries()) {
        const id = await insertTestPost({
          createdById: user.id,
          createdAt: new Date(NON_DECAYING_INSTANT - (index + 1) * 3_600_000),
          title: `HN hot bound ${crypto.randomUUID()}`,
          slug: `hn-hot-bound-${crypto.randomUUID()}`,
          markdown: 'Hacker News hot cohort fixture',
        })
        ids.push(id)
        await setPostVotesScoreUp(id, score)
      }
      await setHackerNewsReferenceFlagsForTest(ids, [])
      const options = {
        user_id: user.id,
        has_hacker_news_references: true,
        sort: 'hot',
        limit: 1,
      } as const
      const first = await getPostIds(user, options)
      expect(first.results.map(row => row.id)).toEqual([ids[2]])
      expect(first.page_info.has_next_page).toBe(true)
      const second = await getPostIds(user, {
        ...options,
        after: first.page_info.end_cursor ?? undefined,
      })
      expect(second.results.map(row => row.id)).toEqual([ids[0]])
      for (const time_range of ['1m', '1y', 'all'] as const) {
        const bounded = await getPostIds(user, { ...options, time_range })
        expect(bounded.results.map(row => row.id)).toEqual([ids[2]])
        const cursor = decodePostSearchCursor(
          { after: bounded.page_info.end_cursor!, time_range },
          'hot',
          false,
        )
        expect(Number.isFinite(cursor.hot_score_lt)).toBe(true)
        const next = await getPostIds(user, {
          ...options,
          time_range,
          after: bounded.page_info.end_cursor ?? undefined,
        })
        expect(next.results.map(row => row.id)).toEqual([ids[0]])
      }
      const restoreHidden = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
        references_visible: false,
      })
      try {
        const hidden = await getPostIds(user, { ...options, time_range: 'all' })
        expect(hidden.results.map(row => row.id)).toEqual([ids[2]])
      } finally {
        restoreHidden()
      }
    } finally {
      restoreVisibility()
      restoreCap()
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })

  it('chooses eligible cohort members before pagination for anonymous, owner, other-user and admin views', async () => {
    const [owner, other] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    if (!owner || !other) throw new Error('Expected hot eligibility viewers')
    await Promise.all([
      postsWorkConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 1,
    })
    const ids: string[] = []
    try {
      const approved = await insertTestPost({
        createdById: owner.id,
        createdAt: new Date('2027-11-06T12:00:00.000Z'),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Approved cohort fixture',
        clearanceStatus: 'approved',
      })
      ids.push(approved)
      await setPostVotesScoreUp(approved, 1)
      const pending = await insertTestPost({
        createdById: owner.id,
        createdAt: new Date('2027-11-06T12:01:00.000Z'),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Pending cohort fixture',
        clearanceStatus: 'pending',
      })
      ids.push(pending)
      await setPostVotesScoreUp(pending, 1)
      await setHackerNewsReferenceFlagsForTest(ids, [])
      const options = {
        user_id: owner.id,
        has_hacker_news_references: true,
        sort: 'hot',
        time_range: '1m',
        limit: 2,
      } as const
      expect((await getPostIds(undefined, options)).results.map(row => row.id)).toEqual([approved])
      expect((await getPostIds(other, options)).results.map(row => row.id)).toEqual([approved])
      expect((await getPostIds(owner, options)).results.map(row => row.id)).toEqual([
        pending,
        approved,
      ])
      expect(
        (await getPostIds({ ...other, roles: ['administrator'] }, options)).results.map(
          row => row.id,
        ),
      ).toEqual([pending, approved])
    } finally {
      restore()
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })

  it('trims net-zero posts from the hot cohort', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected a hot net-vote test user')
    await Promise.all([
      postsWorkConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    const restoreCap = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 10,
    })
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: true,
    })
    const ids: string[] = []
    try {
      for (const score of [1, 0]) {
        const id = await insertTestPost({
          createdById: user.id,
          createdAt: new Date(NON_DECAYING_INSTANT - (ids.length + 1) * 3_600_000),
          title: `HN net vote ${crypto.randomUUID()}`,
          slug: `hn-net-vote-${crypto.randomUUID()}`,
          markdown: 'Hacker News net vote fixture',
        })
        ids.push(id)
        await setPostVotesScoreUp(id, score)
      }
      await setHackerNewsReferenceFlagsForTest(ids, [])
      const page = await getPostIds(user, {
        user_id: user.id,
        has_hacker_news_references: true,
        sort: 'hot',
        limit: 10,
      })
      expect(page.results.map(row => row.id)).toEqual([ids[0]])
    } finally {
      restoreVisibility()
      restoreCap()
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })

  it.each(['text', 'semantic', 'hybrid'] as const)(
    'pages hot %s search from the projected cohort',
    async mode => {
      const user = await createTestUserDirect()
      if (!user) throw new Error('Expected a hot ranking test user')
      await Promise.all([
        postsWorkConfig.waitForInitialization(),
        hackerNewsVisibilityConfig.waitForInitialization(),
      ])
      const embedding = createSemanticWindowEmbedding()
      const ids = await insertSemanticWindowPosts(
        user.id,
        2,
        embedding,
        new Date(NON_DECAYING_INSTANT),
      )
      await Promise.all(ids.map(id => setPostVotesScoreUp(id, 1)))
      const query = crypto.randomUUID()
      await seedSearchEmbeddingCache(query, embedding)
      await setHackerNewsReferenceFlagsForTest(ids, [])
      const expected = ids.toSorted((a, b) => b.localeCompare(a))
      const restoreCap = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        hacker_news_hot_candidate_limit: 2,
      })
      const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
        references_visible: true,
      })
      try {
        const options = {
          user_id: user.id,
          has_hacker_news_references: true,
          sort: 'hot',
          time_range: '1m',
          limit: 1,
          ...(mode !== 'semantic' ? { text_search_query: 'fixture' } : {}),
          ...(mode !== 'text' ? { semantic_search_query: query } : {}),
        } as const
        const first = await getPostIds(user, options)
        expect(first.results.map(row => row.id)).toEqual(expected.slice(0, 1))
        expect(first.page_info.has_next_page).toBe(true)
        const second = await getPostIds(user, {
          ...options,
          after: first.page_info.end_cursor ?? undefined,
        })
        expect(second.results.map(row => row.id)).toEqual(expected.slice(1))
      } finally {
        restoreVisibility()
        restoreCap()
        await Promise.all(ids.map(id => deleteTestPost(id)))
      }
    },
  )
})
