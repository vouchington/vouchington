import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createReferralFeedWindowFixture } from '@voucha/test-helpers/referral-feed-windows'
import { getReferralLinksFeed } from './get.mts'

describe('referral feed inspected windows', () => {
  it.each([1, 100])(
    'inspects at most ten times a %i-row page, including inactive rows',
    async limit => {
      const hidden = Array.from({ length: limit * 10 }, (_, index) =>
        index % 3 === 0
          ? ('deleted' as const)
          : index % 3 === 1
            ? ('deactivated' as const)
            : ('unfollowed' as const),
      )
      const fixture = await createReferralFeedWindowFixture([...hidden, 'visible'])
      const first = await getReferralLinksFeed(fixture.viewer, 'follow_users', {
        limit,
        after: fixture.after,
      })
      expect(first.results).toEqual([])
      expect(first.users).toEqual({})
      expect(first.page_info).toEqual({
        has_next_page: true,
        start_cursor: null,
        end_cursor: encodeCursor({ id: fixture.ids[limit * 10 - 1]! }),
      })
      const next = await getReferralLinksFeed(fixture.viewer, 'follow_users', {
        limit,
        after: first.page_info.end_cursor!,
      })
      expect(next.results.map(row => row.id)).toEqual([fixture.ids.at(-1)])
    },
  )

  it('does not skip eligible rows buffered beyond the last consumed match', async () => {
    const fixture = await createReferralFeedWindowFixture([
      'visible',
      'unfollowed',
      'visible',
      'visible',
      'visible',
    ])
    const first = await getReferralLinksFeed(fixture.viewer, 'follow_users', {
      limit: 2,
      after: fixture.after,
    })
    expect(first.results.map(row => row.id)).toEqual([fixture.ids[0], fixture.ids[2]])
    expect(first.page_info.end_cursor).toBe(encodeCursor({ id: fixture.ids[2]! }))
    const next = await getReferralLinksFeed(fixture.viewer, 'follow_users', {
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(next.results.map(row => row.id)).toEqual(fixture.ids.slice(3))
    expect(next.page_info.end_cursor).toBe(encodeCursor({ id: fixture.ids[4]! }))
  })

  it('continues short and empty windows until the older match, then reaches the end', async () => {
    const fixture = await createReferralFeedWindowFixture([
      'visible',
      ...Array.from({ length: 39 }, () => 'unfollowed' as const),
      'visible',
    ])
    const first = await getReferralLinksFeed(fixture.viewer, 'follow_users', {
      limit: 2,
      after: fixture.after,
    })
    expect(first.results.map(row => row.id)).toEqual([fixture.ids[0]])
    expect(first.page_info.end_cursor).toBe(encodeCursor({ id: fixture.ids[19]! }))
    const second = await getReferralLinksFeed(fixture.viewer, 'follow_users', {
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(second.results).toEqual([])
    expect(second.page_info.has_next_page).toBe(true)
    expect(second.page_info.end_cursor).toBe(encodeCursor({ id: fixture.ids[39]! }))
    let after = second.page_info.end_cursor!
    const seen: string[] = []
    let terminal = false
    let terminalCursor: string | null | undefined
    for (let pageIndex = 0; pageIndex < 256; pageIndex++) {
      const page = await getReferralLinksFeed(fixture.viewer, 'follow_users', { limit: 2, after })
      seen.push(...page.results.map(row => row.id))
      terminalCursor = page.page_info.end_cursor
      if (!page.page_info.has_next_page) {
        terminal = true
        break
      }
      expect(page.page_info.end_cursor).not.toBe(after)
      after = page.page_info.end_cursor!
    }
    expect(terminal).toBe(true)
    expect(terminalCursor).toBeNull()
    expect(seen).toEqual([fixture.ids.at(-1)])
  })
})
