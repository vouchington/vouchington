import type { QueryExecutor } from '@data-stores/psql/types'
import type { HackerNewsFilterFixture } from './hacker-news-filter.mts'

/** Compare cached flags with the shared card selector and canonical reference facts. */
export async function verifyHackerNewsFilterFixtureTruth(
  query: QueryExecutor,
  f: HackerNewsFilterFixture,
  buildPostUrls: (postId: 'candidate.id') => string,
) {
  const q = (text: string, values?: unknown[]) =>
    query(`/* verifyHackerNewsFilterFixtureTruth */ ${text}`, values)
  let mismatches = 0
  let qualifying = 0
  for (let offset = 0; offset < f.postCount; offset += f.batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each call verifies one capped batch of candidate posts against the shared card selector.
    const { rows } = await q(
      `SELECT count(*) FILTER(WHERE candidate.has_hacker_news_references
      IS DISTINCT FROM EXISTS(SELECT 1 FROM (${buildPostUrls('candidate.id')}) selected
        JOIN urls source ON source.id=selected.url_id
        LEFT JOIN urls hop ON hop.id=source.canonical_url_id
        JOIN url_hacker_news_totals totals ON totals.url_id=
          COALESCE(hop.canonical_url_id,source.canonical_url_id,source.id)
        WHERE totals.story_count>0 OR totals.comment_count>0))::int AS mismatches,
      count(*) FILTER(WHERE candidate.has_hacker_news_references)::int AS qualifying
      FROM generate_series($3::int,$3::int+$8::int-1)i
      JOIN posts candidate ON candidate.id=((CASE WHEN i<$4*.2 THEN $5
        WHEN i<$4*.5 THEN $6 ELSE $7 END)||$1||lpad(to_hex(i),6,'0'))::uuid
      WHERE candidate.created_by_id=$2`,
      [
        f.token,
        f.actorId,
        offset,
        f.postCount,
        ...f.postPrefixes,
        Math.min(f.batchSize, f.postCount - offset),
      ],
    )
    mismatches += Number(rows[0]!.mismatches)
    qualifying += Number(rows[0]!.qualifying)
  }
  const { rows } = await q(
    `SELECT count(*) FILTER(WHERE item.has_hacker_news_references
    IS DISTINCT FROM EXISTS(SELECT 1 FROM urls source
      LEFT JOIN urls hop ON hop.id=source.canonical_url_id
      JOIN url_hacker_news_totals totals ON totals.url_id=
        COALESCE(hop.canonical_url_id,source.canonical_url_id,source.id)
      WHERE source.id=item.url_id AND(totals.story_count>0 OR totals.comment_count>0)))::int AS mismatches,
    count(*) FILTER(WHERE item.has_hacker_news_references)::int AS qualifying
    FROM rss_feed_items item JOIN rss_feed_item_guids ids ON ids.id=item.id
    WHERE ids.url_hostname_id=$1`,
    [f.hostnameId],
  )
  const rss = { mismatches: Number(rows[0]!.mismatches), qualifying: Number(rows[0]!.qualifying) }
  if (mismatches || rss.mismatches)
    throw new Error('Stored HN flags differ from the shared card URL set')
  return { posts: { mismatches, qualifying }, rss }
}

/** Exact owned cleanup, with a finite number of capped deletion statements. */
export async function cleanupHackerNewsFilterFixture(
  query: QueryExecutor,
  f: HackerNewsFilterFixture,
) {
  const q = (text: string, values?: unknown[]) =>
    query(`/* cleanupHackerNewsFilterFixture */ ${text}`, values)
  for (let offset = 0; offset < f.postCount; offset += f.batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each cleanup statement deletes one explicitly limited owned fixture batch; the loop has a finite corpus cap.
    const { rows } = await q(
      `WITH candidates AS(SELECT id FROM posts WHERE created_by_id=$1 ORDER BY id LIMIT $2)
      DELETE FROM posts USING candidates WHERE posts.id=candidates.id RETURNING posts.id`,
      [f.actorId, f.batchSize],
    )
    if (rows.length)
      // no-mistakes-disable-next-line query-reached-per-item: one set-based retained-identity delete consumes the preceding capped RETURNING batch, not individual rows.
      await q('DELETE FROM retained_post_identities WHERE id=ANY($1::uuid[])', [
        rows.map(row => row.id),
      ])
  }
  for (let offset = 0; offset < f.rssCount; offset += f.batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each cleanup statement deletes one explicitly limited owned fixture batch; the loop has a finite corpus cap.
    const { rows } = await q(
      `WITH candidates AS(SELECT id FROM rss_feed_item_guids WHERE url_hostname_id=$1 ORDER BY id LIMIT $2)
      DELETE FROM rss_feed_item_guids USING candidates WHERE rss_feed_item_guids.id=candidates.id RETURNING rss_feed_item_guids.id`,
      [f.hostnameId, f.batchSize],
    )
    if (rows.length)
      // no-mistakes-disable-next-line query-reached-per-item: one set-based retained-identity delete consumes the preceding capped RETURNING batch, not individual rows.
      await q('DELETE FROM retained_rss_feed_item_identities WHERE id=ANY($1::uuid[])', [
        rows.map(row => row.id),
      ])
  }
  await q('DELETE FROM rss_feeds WHERE id=$1', [f.feedId])
  await q('DELETE FROM topics WHERE id=$1', [f.topicId])
  await q('DELETE FROM retained_topic_identities WHERE id=$1', [f.topicId])
  for (let offset = 0; offset < 6000; offset += f.batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each cleanup statement deletes one explicitly limited owned fixture batch; the loop has a finite corpus cap.
    await q(
      `WITH candidates AS(SELECT id FROM urls WHERE hostname_id=$1 ORDER BY id LIMIT $2)
      DELETE FROM urls USING candidates WHERE urls.id=candidates.id`,
      [f.hostnameId, f.batchSize],
    )
  }
  await q('DELETE FROM url_hostnames WHERE id=$1', [f.hostnameId])
  await q('DELETE FROM users WHERE id=$1', [f.actorId])
  await q('DELETE FROM retained_user_identities WHERE id=$1', [f.actorId])
}
