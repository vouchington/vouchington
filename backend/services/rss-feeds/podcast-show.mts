import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type PodcastShowMetadata = {
  itunes_author: string | null
  itunes_owner_name: string | null
  itunes_owner_email: string | null
  cover_art_url: string | null
  is_explicit: boolean
  itunes_type: 'episodic' | 'serial' | null
  description: string | null
}

/**
 * Upserts podcast show metadata (from itunes namespace) for a feed.
 * Called during every crawl when parsedFeed.itunes is present.
 * The cover_art_url is stored raw and emitted as an absolute image-host /sideload/ URL at response time.
 */
export async function upsertPodcastShow(
  rssFeedId: string,
  metadata: PodcastShowMetadata,
): Promise<void> {
  await write(
    sql`/* upsertPodcastShow */
      INSERT INTO podcast_shows (
        rss_feed_id,
        itunes_author,
        itunes_owner_name,
        itunes_owner_email,
        cover_art_url,
        is_explicit,
        itunes_type,
        description
      ) VALUES (
        ${rssFeedId},
        ${metadata.itunes_author},
        ${metadata.itunes_owner_name},
        ${metadata.itunes_owner_email},
        ${metadata.cover_art_url},
        ${metadata.is_explicit},
        ${metadata.itunes_type},
        ${metadata.description}
      )
      ON CONFLICT (rss_feed_id) DO UPDATE SET
        itunes_author = EXCLUDED.itunes_author,
        itunes_owner_name = EXCLUDED.itunes_owner_name,
        itunes_owner_email = EXCLUDED.itunes_owner_email,
        cover_art_url = EXCLUDED.cover_art_url,
        is_explicit = EXCLUDED.is_explicit,
        itunes_type = EXCLUDED.itunes_type,
        description = EXCLUDED.description
    `,
  )
}

/**
 * Deletes the podcast show row for a feed when iTunes metadata disappears from the parsed feed.
 */
export async function deletePodcastShow(rssFeedId: string): Promise<void> {
  await write(
    sql`/* deletePodcastShow */
      DELETE FROM podcast_shows WHERE rss_feed_id = ${rssFeedId}
    `,
  )
}
