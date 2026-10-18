// Side-effect import: registers the bookmark bloom handler required by the
// upsertEntityRelation bookmark-predicate write below.
import '@services/bookmarks'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertAutomaticTopicUpvote } from '@services/elections-votes/topic/automatic-upvote'
import { createSourceFromUrl } from '@services/rss-feeds/create-source'
import type { CreateSourceOptions } from '@services/rss-feeds/create-source-types'
import { findExistingFeedByUrl } from '@services/rss-feeds/find-existing-feed'
import { assertUrlsAllowedByWebRisk } from '@services/web-risk/check'
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
  importRowId: string
  assertRssFeedLimit?: () => Promise<void>
  follow?: boolean
  crawlerRssOptions?: CreateSourceOptions['crawlerRssOptions']
  /** One deadline for the feed's network work; see `createSourceFromUrl`. */
  signal?: AbortSignal
}

export async function importSingleRssFeed(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  rawUrl: string,
  {
    assertRssFeedLimit,
    follow = true,
    crawlerRssOptions,
    signal,
    importRowId,
  }: ImportSingleRssFeedOptions,
): Promise<ImportRssFeedResult> {
  const validation = validateRssFeedUrl(rawUrl)
  if (!validation.valid) {
    return { input: rawUrl, status: 'error', error: validation.error }
  }

  const canonicalUrl = validation.canonicalUrl
  const existingFeed = await findExistingRssFeedByUrl(canonicalUrl)

  if (existingFeed) {
    const safetyUrls = new Set([
      canonicalUrl,
      existingFeed.matchedUrl,
      existingFeed.feed.resolved_feed_url,
    ])
    await assertUrlsAllowedByWebRisk([...safetyUrls], { signal })
    const [, alreadyFollowing] = await Promise.all([
      upsertAutomaticTopicUpvote(currentUser, existingFeed.feed.topic_id),
      isUserFollowingRssFeed(currentUser.id, existingFeed.feed.id),
    ])
    if (alreadyFollowing) {
      return {
        input: rawUrl,
        status: 'already_following',
        entity_id: existingFeed.feed.id,
      }
    }

    if (follow) {
      await upsertEntityRelation(currentUser, followRssFeedRelation, { id: currentUser.id }, [
        { id: existingFeed.feed.id },
      ])
      await recordRssFeedImportRequest(currentUser.id, rawUrl, existingFeed.feed.id, importRowId)
      return {
        input: rawUrl,
        status: 'followed',
        entity_id: existingFeed.feed.id,
      }
    }

    return {
      input: rawUrl,
      status: 'imported',
      entity_id: existingFeed.feed.id,
    }
  }

  // No existing feed — create a new source (topic + rss_feed) directly
  const sourceResult = await createSourceFromUrl(currentUser, provenance, canonicalUrl, {
    assertContributionLimit: assertRssFeedLimit,
    follow,
    signal,
    importRowId,
    crawlerRssOptions,
  })
  if (follow) {
    await recordRssFeedImportRequest(currentUser.id, rawUrl, sourceResult.rss_feed_id, importRowId)
  }

  return {
    input: rawUrl,
    status: 'source_created',
    entity_id: sourceResult.rss_feed_id,
  }
}

async function findExistingRssFeedByUrl(url: string): Promise<{
  feed: NonNullable<Awaited<ReturnType<typeof findExistingFeedByUrl>>>
  matchedUrl: string
} | null> {
  const exact = await findExistingFeedByUrl(url, { readOnly: false })
  if (exact) return { feed: exact, matchedUrl: url }
  if (!url.startsWith('http://')) return null
  const httpsUrl = url.replace(/^http:\/\//, 'https://')
  const httpsFeed = await findExistingFeedByUrl(httpsUrl, { readOnly: false })
  return httpsFeed ? { feed: httpsFeed, matchedUrl: httpsUrl } : null
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

export async function recordRssFeedImportRequest(
  userId: string,
  inputValue: string,
  rssFeedId: string,
  importRowId: string,
): Promise<void> {
  await write(
    sql`/* recordRssFeedImportRequest */
      INSERT INTO user_import_requests (
        user_id,
        entity_type,
        rss_feed_id,
        rss_feed_import_row_id,
        followed_at,
        input_value
      )
      VALUES (
        ${userId},
        'rss_feed',
        ${rssFeedId},
        ${importRowId},
        CURRENT_TIMESTAMP,
        ${inputValue.trim()}
      )
      ON CONFLICT (rss_feed_import_row_id)
      WHERE rss_feed_import_row_id IS NOT NULL
      DO NOTHING
    `,
  )
}
