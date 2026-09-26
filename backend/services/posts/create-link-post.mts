import type { PrivateUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { Post } from './types.mts'
import { read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createPost, preparePostWithCommunityReviews } from './create.mts'

export type CreateLinkPostInput = {
  /** Resolved URL id. Pass either url_id or url, not both. */
  url_id?: string
  /** Raw URL string. Resolved to url_id inside the transaction via addUrl. */
  url?: string
  /** Optional user-supplied title. If omitted, resolved from RSS item / crawl / URL. */
  title?: string
  /** Optional user commentary in markdown. */
  markdown?: string
}

/**
 * Create a link post that links a single external URL.
 * Any non-blocked URL is valid (no discoverability gate).
 * The URL may be resolved from a raw href via addUrl inside the post transaction.
 */
export async function createLinkPost(
  provenance: ContentProvenance,
  creator: PrivateUser,
  input: CreateLinkPostInput,
  options: { query?: TransactionQuery } = {},
): Promise<Post> {
  const { url_id, url, markdown } = input

  // Resolve title: use supplied title, then fall back to DB-resolved title from the URL.
  // We resolve before the transaction using url_id when available (url-only goes through
  // addUrl inside create.mts and the title fallback uses hostname/pathname from the raw URL).
  const title = input.title?.trim() || (url_id ? await resolveLinkPostTitle(url_id) : null) || ''

  return createPost(
    provenance,
    creator,
    {
      post_type: 'link',
      url_id,
      url: url_id ? undefined : url,
      title,
      markdown: markdown ?? '',
    },
    undefined,
    options,
  )
}

export async function prepareLinkPost(
  provenance: ContentProvenance,
  creator: PrivateUser,
  input: CreateLinkPostInput,
  options: { query?: TransactionQuery } = {},
) {
  const { url_id, url, markdown } = input
  const title = input.title?.trim() || (url_id ? await resolveLinkPostTitle(url_id) : null) || ''
  return preparePostWithCommunityReviews(
    provenance,
    creator,
    { post_type: 'link', url_id, url: url_id ? undefined : url, title, markdown: markdown ?? '' },
    undefined,
    options,
  )
}

/**
 * Resolve a display title for the given url_id.
 * Fallback chain: RSS item title → crawl title → full URL string (always non-empty).
 */
async function resolveLinkPostTitle(urlId: string): Promise<string> {
  const { rows } = await read(
    sql`/* resolveLinkPostTitle */
    SELECT
      COALESCE(
        (
          SELECT NULLIF(TRIM(rfi.data->>'title'), '')
          FROM rss_feed_items rfi
          WHERE rfi.url_id = ${urlId}
            AND rfi.deleted_at IS NULL
          ORDER BY rfi.id DESC
          LIMIT 1
        ),
        (
          SELECT NULLIF(TRIM(c.title), '')
          FROM crawls c
          WHERE c.url_id = ${urlId}
            AND c.completed_at IS NOT NULL
            AND c.network_error IS NULL
            AND c.response_status_code BETWEEN 200 AND 299
          ORDER BY c.id DESC
          LIMIT 1
        ),
        (SELECT NULLIF(TRIM(u.url), '') FROM urls u WHERE u.id = ${urlId} LIMIT 1)
      ) AS resolved_title
  `,
  )
  return (rows[0]?.resolved_title as string | null) ?? urlId
}
