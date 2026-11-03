import { expect, it, describe } from 'vitest'
import { getUrlById } from '@services/urls'
import { beginTransaction, getTestUrlMimeType } from '@voucha/test-helpers'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'

describe('rss-feed-url-id', () => {
  it('writes the url row with the rss content type through the caller transaction', async () => {
    const rssFeedUrl = `https://feed-${crypto.randomUUID()}.example.com/feed.xml`
    await using transaction = await beginTransaction()

    const rssFeedUrlId = await createRssFeedUrlId(rssFeedUrl, { query: transaction })

    expect(await getUrlById(rssFeedUrlId)).toBeNull()
    await transaction.commit()
    expect(await getUrlById(rssFeedUrlId)).toMatchObject({ id: rssFeedUrlId, url: rssFeedUrl })
    expect(await getTestUrlMimeType(rssFeedUrlId)).toBe('application/rss+xml')
  })

  it('upgrades http feed urls to https by default', async () => {
    const hostname = `feed-${crypto.randomUUID()}.example.com`

    const rssFeedUrlId = await createRssFeedUrlId(`http://${hostname}/feed.xml`)

    expect(await getUrlById(rssFeedUrlId)).toMatchObject({ url: `https://${hostname}/feed.xml` })
  })

  it('keeps an http feed url as http when preserveHttp is set', async () => {
    const hostname = `feed-${crypto.randomUUID()}.example.com`

    const rssFeedUrlId = await createRssFeedUrlId(`http://${hostname}/feed.xml`, {
      preserveHttp: true,
    })

    expect(await getUrlById(rssFeedUrlId)).toMatchObject({ url: `http://${hostname}/feed.xml` })
  })
})
