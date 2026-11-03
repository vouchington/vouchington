import { expect, it, describe } from 'vitest'
import { getUrlById } from '@services/urls'
import { beginTransaction } from '@voucha/test-helpers'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'

describe('rss-feed-url-id', () => {
  it('writes the url row through the caller transaction', async () => {
    const rssFeedUrl = `https://feed-${crypto.randomUUID()}.example.com/feed.xml`
    await using transaction = await beginTransaction()

    const rssFeedUrlId = await createRssFeedUrlId(rssFeedUrl, { query: transaction })

    expect(await getUrlById(rssFeedUrlId)).toBeNull()
    await transaction.commit()
    expect(await getUrlById(rssFeedUrlId)).toMatchObject({ id: rssFeedUrlId, url: rssFeedUrl })
  })
})
