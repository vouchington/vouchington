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
import { decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { getPostIds } from '../get-ids.mts'
import { buildPostSearchQuery } from '../query-builder.mts'
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
      expect(first.results.map(row => row.id)).toEqual([ids[0]])
      expect(first.page_info.has_next_page).toBe(true)
      const second = await getPostIds(user, {
        ...options,
        after: first.page_info.end_cursor ?? undefined,
      })
      expect(second.results.map(row => row.id)).toEqual([ids[1]])
      expect(second.page_info.has_next_page).toBe(false)
      for (const time_range of ['1m', '1y', 'all'] as const) {
        const bounded = await getPostIds(user, { ...options, time_range })
        expect(bounded.results.map(row => row.id)).toEqual([ids[0]])
        const cursor = decodeUuidCursor(
          bounded.page_info.end_cursor!,
          isScoreCursor,
          'Expected hot cursor',
        )
        expect(Number.isFinite(cursor.score)).toBe(true)
        const next = await getPostIds(user, {
          ...options,
          time_range,
          after: bounded.page_info.end_cursor ?? undefined,
        })
        expect(next.results.map(row => row.id)).toEqual([ids[1]])
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
        createdAt: new Date(Date.now() - 3 * 60_000),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Approved cohort fixture',
        clearanceStatus: 'approved',
      })
      ids.push(approved)
      await setPostVotesScoreUp(approved, 1)
      const pending = await insertTestPost({
        createdById: owner.id,
        createdAt: new Date(Date.now() - 2 * 60_000),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Pending cohort fixture',
        clearanceStatus: 'pending',
      })
      ids.push(pending)
      await setPostVotesScoreUp(pending, 1)
      const zeroNet = await insertTestPost({
        createdById: owner.id,
        createdAt: new Date(Date.now() - 60_000),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Net-zero cohort fixture',
        clearanceStatus: 'approved',
      })
      ids.push(zeroNet)
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
      expect((await getPostIds(owner, options)).results.map(row => row.id)).toEqual([pending])
      expect(
        (await getPostIds({ ...other, roles: ['administrator'] }, options)).results.map(
          row => row.id,
        ),
      ).toEqual([pending])
    } finally {
      restore()
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
        expect(second.page_info.has_next_page).toBe(false)
      } finally {
        restoreVisibility()
        restoreCap()
        await Promise.all(ids.map(id => deleteTestPost(id)))
      }
    },
  )

  it('enforces the hard maximum in the SQL limit even if config bypasses admin validation', async () => {
    await postsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 1_000_000,
    })
    try {
      const query = buildPostSearchQuery(undefined, {
        has_hacker_news_references: true,
        sort: 'hot',
        time_range: '1m',
      })
      expect(query.values).toContain(1000)
      expect(query.values).not.toContain(1_000_000)
    } finally {
      restore()
    }
  })
})
