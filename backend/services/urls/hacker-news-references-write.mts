import { enqueueHackerNewsFlagsBestEffort } from '@queues/hacker-news-flags/enqueues'
import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import { getHackerNewsWorkLimit, hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import {
  HACKER_NEWS_COMMENT_CAP_PER_URL,
  HACKER_NEWS_STORY_CAP_PER_URL,
  type HackerNewsCommentReference,
  type HackerNewsStoryReference,
} from './hacker-news-references-types.mts'

export type HackerNewsReferenceRefresh = {
  urlId: string
  storyCount: number
  commentCount: number
  stories: HackerNewsStoryReference[]
  comments: HackerNewsCommentReference[]
}

/**
 * Replace the cached facts for canonical URLs. Totals include hits beyond the stored caps.
 */
export async function replaceHackerNewsReferences(
  batch: HackerNewsReferenceRefresh[],
): Promise<void> {
  if (batch.length === 0) return
  if (new Set(batch.map(item => item.urlId)).size !== batch.length) {
    throw new Error('Duplicate URL in Hacker News refresh batch')
  }

  const sorted = batch.toSorted((a, b) => a.urlId.localeCompare(b.urlId))
  await hackerNewsWorkConfig.waitForInitialization()
  const batchSize = getHackerNewsWorkLimit('write_batch_size')
  for (let offset = 0; offset < sorted.length; offset += batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each call writes a bounded chunk of URL IDs, not an individual URL.
    await replaceHackerNewsReferenceChunk(sorted.slice(offset, offset + batchSize)) // oxlint-disable-line no-await-in-loop -- sequential capped transactions bound connection pressure and preserve lock order.
  }
}

async function replaceHackerNewsReferenceChunk(
  sorted: HackerNewsReferenceRefresh[],
): Promise<void> {
  await using query = await beginTransaction()
  // Canonical changes lock the same URL rows before deleting references. The lock also makes
  // the canonical check stable until commit, including when a lookup started before a merge.
  const locked = await query<{ id: string }>(
    `/* lockHackerNewsRefreshUrls */
    SELECT id FROM urls WHERE id = ANY($1::uuid[]) AND canonical_url_id IS NULL
    ORDER BY id FOR NO KEY UPDATE`,
    [sorted.map(item => item.urlId)],
  )
  const canonicalIds = new Set(locked.rows.map(row => row.id))
  const accepted = sorted.filter(item => canonicalIds.has(item.urlId))
  if (accepted.length === 0) return

  // Retention takes the same totals locks, so compare presence under that lock.
  const previous = await query<{ url_id: string; present: boolean }>(
    `/* lockPreviousHackerNewsPresence */ SELECT url_id,
      (story_count > 0 OR comment_count > 0) AS present
      FROM url_hacker_news_totals WHERE url_id = ANY($1::uuid[])
      ORDER BY url_id FOR UPDATE`,
    [accepted.map(item => item.urlId)],
  )
  const presence = new Map(previous.rows.map(row => [row.url_id, row.present]))
  const changedIds = accepted.flatMap(item =>
    (presence.get(item.urlId) ?? false) !== (item.storyCount > 0 || item.commentCount > 0)
      ? [item.urlId]
      : [],
  )
  if (changedIds.length)
    registerPostCommitAction(query, async () => {
      await enqueueHackerNewsFlagsBestEffort(changedIds)
    })

  const payload = JSON.stringify(
    accepted.map(item => ({
      url_id: item.urlId,
      story_count: item.storyCount,
      comment_count: item.commentCount,
      stories: item.stories.slice(0, HACKER_NEWS_STORY_CAP_PER_URL),
      comments: item.comments.slice(0, HACKER_NEWS_COMMENT_CAP_PER_URL),
    })),
  )

  // This is the first write and its row locks serialize competing refreshes for each URL.
  // ast-grep-ignore: no-three-sequential-awaits -- one transaction must lock totals before child replacement; statements share its connection.
  await query(
    `/* upsertHackerNewsTotals */
    INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count, looked_up_at)
    SELECT url_id, story_count, comment_count, CURRENT_TIMESTAMP
    FROM jsonb_to_recordset($1::jsonb) AS x(url_id uuid, story_count int, comment_count int)
    ORDER BY url_id
    ON CONFLICT (url_id) DO UPDATE SET story_count = EXCLUDED.story_count,
      comment_count = EXCLUDED.comment_count, looked_up_at = EXCLUDED.looked_up_at`,
    [payload],
  )
  await query(
    `/* deleteStaleHackerNewsStories */
    WITH candidates AS (
      SELECT old.url_id, old.hacker_news_item_id
      FROM jsonb_to_recordset($1::jsonb) AS x(url_id uuid, stories jsonb)
      JOIN url_hacker_news_stories AS old ON old.url_id = x.url_id
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(x.stories) AS s(hacker_news_item_id bigint)
        WHERE s.hacker_news_item_id = old.hacker_news_item_id
      )
      ORDER BY old.url_id, old.hacker_news_item_id
      LIMIT $2
    )
    DELETE FROM url_hacker_news_stories AS old USING candidates
    WHERE old.url_id = candidates.url_id
      AND old.hacker_news_item_id = candidates.hacker_news_item_id`,
    [payload, accepted.length * HACKER_NEWS_STORY_CAP_PER_URL],
  )
  await query(
    `/* upsertHackerNewsStories */
    INSERT INTO url_hacker_news_stories (url_id, hacker_news_item_id, points, reply_count, posted_at)
    SELECT x.url_id, s.hacker_news_item_id, s.points, s.reply_count, s.posted_at
    FROM jsonb_to_recordset($1::jsonb) AS x(url_id uuid, stories jsonb)
    CROSS JOIN LATERAL jsonb_to_recordset(x.stories)
      AS s(hacker_news_item_id bigint, points int, reply_count int, posted_at timestamptz)
    ORDER BY x.url_id, s.hacker_news_item_id
    ON CONFLICT (url_id, hacker_news_item_id) DO UPDATE SET
      points = EXCLUDED.points, reply_count = EXCLUDED.reply_count, posted_at = EXCLUDED.posted_at
    WHERE (url_hacker_news_stories.points, url_hacker_news_stories.reply_count, url_hacker_news_stories.posted_at)
      IS DISTINCT FROM (EXCLUDED.points, EXCLUDED.reply_count, EXCLUDED.posted_at)`,
    [payload],
  )
  await query(
    `/* deleteStaleHackerNewsComments */
    WITH candidates AS (
      SELECT old.url_id, old.hacker_news_item_id
      FROM jsonb_to_recordset($1::jsonb) AS x(url_id uuid, comments jsonb)
      JOIN url_hacker_news_comments AS old ON old.url_id = x.url_id
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(x.comments) AS c(hacker_news_item_id bigint)
        WHERE c.hacker_news_item_id = old.hacker_news_item_id
      )
      ORDER BY old.url_id, old.hacker_news_item_id
      LIMIT $2
    )
    DELETE FROM url_hacker_news_comments AS old USING candidates
    WHERE old.url_id = candidates.url_id
      AND old.hacker_news_item_id = candidates.hacker_news_item_id`,
    [payload, accepted.length * HACKER_NEWS_COMMENT_CAP_PER_URL],
  )
  await query(
    `/* upsertHackerNewsComments */
    INSERT INTO url_hacker_news_comments (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
    SELECT x.url_id, c.hacker_news_item_id, c.parent_story_item_id, c.posted_at
    FROM jsonb_to_recordset($1::jsonb) AS x(url_id uuid, comments jsonb)
    CROSS JOIN LATERAL jsonb_to_recordset(x.comments)
      AS c(hacker_news_item_id bigint, parent_story_item_id bigint, posted_at timestamptz)
    ORDER BY x.url_id, c.hacker_news_item_id
    ON CONFLICT (url_id, hacker_news_item_id) DO UPDATE SET
      parent_story_item_id = EXCLUDED.parent_story_item_id, posted_at = EXCLUDED.posted_at
    WHERE (url_hacker_news_comments.parent_story_item_id, url_hacker_news_comments.posted_at)
      IS DISTINCT FROM (EXCLUDED.parent_story_item_id, EXCLUDED.posted_at)`,
    [payload],
  )
  await query.commit()
}
