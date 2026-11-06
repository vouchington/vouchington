import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { setHackerNewsReferenceFlagsForTest } from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { getPostIds } from '../get-ids.mts'
import { buildPostSearchQuery } from '../query-builder.mts'
import { postsWorkConfig } from '../../work-limits.mts'

describe('Hacker News hot search bounds', () => {
  it('pages inside the newest cohort, falls back to best for longer windows, and ignores hidden HN', async () => {
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
      // Zero-score cohort members keep their cursor stable across SQL NOW() calls.
      for (const [index, score] of [0, 0, 100].entries()) {
        const id = await insertTestPost({
          createdById: user.id,
          createdAt: new Date(Date.now() - (index + 1) * 3_600_000),
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
      for (const time_range of ['1y', 'all'] as const) {
        const best = await getPostIds(user, { ...options, time_range })
        expect(best.results.map(row => row.id)).toEqual([ids[2]])
        const cursor = decodeUuidCursor(
          best.page_info.end_cursor!,
          isScoreCursor,
          'Expected best cursor',
        )
        expect(Number.isFinite(cursor.score)).toBe(true)
        const next = await getPostIds(user, {
          ...options,
          time_range,
          after: best.page_info.end_cursor ?? undefined,
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
        createdAt: new Date(Date.now() - 3 * 60_000),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Approved cohort fixture',
        clearanceStatus: 'approved',
      })
      ids.push(approved)
      const pending = await insertTestPost({
        createdById: owner.id,
        createdAt: new Date(Date.now() - 2 * 60_000),
        title: crypto.randomUUID(),
        slug: crypto.randomUUID(),
        markdown: 'Pending cohort fixture',
        clearanceStatus: 'pending',
      })
      ids.push(pending)
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
