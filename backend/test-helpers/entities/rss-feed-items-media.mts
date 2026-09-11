import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setRssFeedItemMediaDetails(
  itemId: string,
  options: {
    mediaType: 'article' | 'audio' | 'video'
    enclosureUrl: string | null
    enclosureType: string | null
    durationSeconds: number | null
    thumbnailUrl: string | null
  },
): Promise<void> {
  await write(sql`/* setRssFeedItemMediaDetails */
    UPDATE rss_feed_items
    SET media_type = ${options.mediaType}::rss_feed_item_media_types,
        enclosure_url = ${options.enclosureUrl},
        enclosure_type = ${options.enclosureType},
        duration_seconds = ${options.durationSeconds},
        thumbnail_url = ${options.thumbnailUrl}
    WHERE id = ${itemId}
  `)
}
