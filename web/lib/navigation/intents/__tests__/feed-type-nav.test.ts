import { describe, expect, it } from 'vitest'
import { feedTypeNav } from '../feed-type-nav'
import { getActiveIntent } from '../resolver'
import { NAV_INTENTS } from '../../intents'

describe('feedTypeNav', () => {
  it('maps video to Videos intent / Channels list', () => {
    const nav = feedTypeNav('video')
    expect(nav).toEqual({ intent: 'videos', listTitleKey: 'nav.channels', listPath: '/channels' })
  })

  it('maps podcast to Podcasts intent / Podcasts list', () => {
    const nav = feedTypeNav('podcast')
    expect(nav).toEqual({
      intent: 'podcasts',
      listTitleKey: 'nav.podcasts',
      listPath: '/podcasts',
    })
  })

  it('maps article to News intent / News Sources list', () => {
    const nav = feedTypeNav('article')
    expect(nav).toEqual({
      intent: 'news',
      listTitleKey: 'nav.newsSources',
      listPath: '/news-sources',
    })
  })

  it('maps mixed to Web Search intent / Sources list (/news-sources only shows article feeds)', () => {
    const nav = feedTypeNav('mixed')
    expect(nav).toEqual({ intent: 'web-search', listTitleKey: 'nav.sources', listPath: '/sources' })
  })

  it('maps null to News intent (baseline)', () => {
    const nav = feedTypeNav(null)
    expect(nav).toEqual({
      intent: 'news',
      listTitleKey: 'nav.newsSources',
      listPath: '/news-sources',
    })
  })

  it('maps undefined to News intent (baseline)', () => {
    const nav = feedTypeNav(undefined)
    expect(nav).toEqual({
      intent: 'news',
      listTitleKey: 'nav.newsSources',
      listPath: '/news-sources',
    })
  })

  it.each([
    ['video', 'videos'],
    ['podcast', 'podcasts'],
    ['article', 'news'],
    ['mixed', 'web-search'],
  ] as const)(
    'feedTypeNav(%s).intent is a real NavIntentId in NAV_INTENTS',
    (feedType, expectedIntent) => {
      const nav = feedTypeNav(feedType)
      expect(nav.intent).toBe(expectedIntent)
      expect(NAV_INTENTS.some(i => i.id === nav.intent)).toBe(true)
    },
  )

  it.each([['video'], ['podcast'], ['article'], ['mixed']] as const)(
    'getActiveIntent(feedTypeNav(%s).listPath) === feedTypeNav(%s).intent (parity guard)',
    feedType => {
      const nav = feedTypeNav(feedType)
      expect(getActiveIntent(nav.listPath)).toBe(nav.intent)
    },
  )

  it.each([['video'], ['podcast'], ['article'], ['mixed'], [null], [undefined]] as const)(
    'non-discoverable feed_type=%s falls back to /sources (Web Search)',
    feedType => {
      const nav = feedTypeNav(feedType, false)
      expect(nav).toEqual({
        intent: 'web-search',
        listTitleKey: 'nav.sources',
        listPath: '/sources',
      })
    },
  )
})
