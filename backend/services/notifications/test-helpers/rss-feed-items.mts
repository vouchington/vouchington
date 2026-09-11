import { createHash } from 'node:crypto'
import { addUrl } from '@services/urls'
import { createRandomString, insertTestRssFeedItem } from '@voucha/test-helpers'

export function rssFeedItemContentSha256(itemData: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(itemData)).digest()
}

export async function insertNotificationTestRssFeedItem(
  rssFeedId: string,
  title: string,
  createdAt?: Date,
) {
  const random = createRandomString(10)
  const url = await addUrl(null, `https://example.com/rss-notification-${random}`, {
    content_type: 'text/html',
  })
  const itemData = {
    guid: `rss-notification-${random}`,
    title: `${title} ${random}`,
    link: url!.url,
  }

  return insertTestRssFeedItem({
    rssFeedId,
    urlId: url!.id,
    guid: itemData.guid,
    itemData,
    contentSha256: rssFeedItemContentSha256(itemData),
    createdAt,
  })
}
