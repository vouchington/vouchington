// Side-effect import: registers the bookmark bloom handler required by the
// upsertEntityRelation bookmark-predicate write below.
import '@services/bookmarks'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { createSourceFromUrl } from '@services/rss-feeds/create-source'
import { validateRssFeedUrl } from './validate-rss-feed-url.mts'

export type ImportRssFeedResult = {
  input: string
  status: ImportRssFeedStatus
  error?: string
  entity_id?: string
}

export type ImportRssFeedStatus =
  | 'followed'
  | 'imported'
  | 'source_created'
  | 'already_following'
  | 'error'

const followRssFeedRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'rss_feed',
  predicate: 'follow',
})

export type ImportSingleRssFeedOptions = {
  assertRssFeedLimit?: () => Promise<void>
  follow?: boolean
  createSourceFromUrlImpl?: typeof createSourceFromUrl
}

export async function importSingleRssFeed(
  provenance: ContentProvenance,
  currentUser: BasicUser,
  rawUrl: string,
  { assertRssFeedLimit, follow = true, createSourceFromUrlImpl }: ImportSingleRssFeedOptions = {},
): Promise<ImportRssFeedResult> {
  const validation = validateRssFeedUrl(rawUrl)
  if (!validation.valid) {
    return { input: rawUrl, status: 'error', error: validation.error }
  }

  const canonicalUrl = validation.canonicalUrl
  const existingFeed = await findExistingRssFeedByUrl(canonicalUrl)

  if (existingFeed) {
    const alreadyFollowing = await isUserFollowingRssFeed(currentUser.id, existingFeed.id)
    if (alreadyFollowing) {
      return {
        input: rawUrl,
        status: 'already_following',
        entity_id: existingFeed.id,
      }
    }

    if (follow) {
      await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
        { id: existingFeed.id },
      ])
      await recordRssFeedImportRequest(currentUser.id, rawUrl, existingFeed.id)
      return {
        input: rawUrl,
        status: 'followed',
        entity_id: existingFeed.id,
      }
    }

    return {
      input: rawUrl,
      status: 'imported',
      entity_id: existingFeed.id,
    }
  }

  // No existing feed — create a new source (topic + rss_feed) directly
  const sourceResult = await (createSourceFromUrlImpl ?? createSourceFromUrl)(
    provenance,
    currentUser,
    canonicalUrl,
    {
      assertContributionLimit: assertRssFeedLimit,
      follow,
    },
  )
  if (follow) {
    await recordRssFeedImportRequest(currentUser.id, rawUrl, sourceResult.rss_feed_id)
  }

  return {
    input: rawUrl,
    status: 'source_created',
    entity_id: sourceResult.rss_feed_id,
  }
}

async function findExistingRssFeedByUrl(
  url: string,
): Promise<{ id: string; topic_id: string } | null> {
  const urls = url.startsWith('http://') ? [url, url.replace(/^http:\/\//, 'https://')] : [url]
  const { rows } = await read(
    sql`/* findExistingRssFeedByUrl */
      SELECT rf.id, rf.topic_id
      FROM rss_feeds rf
      JOIN urls u ON u.id = rf.rss_feed_url_id
      WHERE u.url = ANY(${urls})
        AND rf.deleted_at IS NULL
      ORDER BY (u.url = ${url}) DESC
      LIMIT 1
    `,
  )
  return (rows[0] as { id: string; topic_id: string } | undefined) ?? null
}

async function isUserFollowingRssFeed(userId: string, rssFeedId: string): Promise<boolean> {
  const { rows } = await read(
    sql`/* isUserFollowingRssFeed */
      SELECT 1
      FROM relation__user__follow__rss_feed
      WHERE subject_id = ${userId}
        AND object_id = ${rssFeedId}
        AND deleted_at IS NULL
      LIMIT 1
    `,
  )
  return rows.length > 0
}

async function recordRssFeedImportRequest(
  userId: string,
  inputValue: string,
  rssFeedId: string,
): Promise<void> {
  await write(
    sql`/* recordRssFeedImportRequest */
      INSERT INTO user_import_requests (
        user_id,
        entity_type,
        rss_feed_id,
        followed_at,
        input_value
      )
      VALUES (
        ${userId},
        'rss_feed',
        ${rssFeedId},
        CURRENT_TIMESTAMP,
        ${inputValue.trim()}
      )
    `,
  )
}
