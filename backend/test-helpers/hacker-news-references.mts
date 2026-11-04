import { read, write } from '@data-stores/psql'

type SeedStory = {
  hacker_news_item_id: number
  points: number
  reply_count: number
  posted_at: string
}
type SeedComment = { hacker_news_item_id: number; parent_story_item_id: number; posted_at: string }

export type SeedHackerNewsReferences = {
  url_id: string
  story_count: number
  comment_count: number
  stories?: readonly SeedStory[]
  comments?: readonly SeedComment[]
}

/** Seeds the totals row and item rows of one URL. */
export async function insertHackerNewsReferencesForTest(
  seed: SeedHackerNewsReferences,
): Promise<void> {
  const stories = seed.stories ?? []
  const comments = seed.comments ?? []
  await write(
    `/* insertHackerNewsReferencesForTest */
    WITH totals AS (
      INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count, looked_up_at)
      VALUES ($1::uuid, $2::int, $3::int, CURRENT_TIMESTAMP)
    ),
    inserted_stories AS (
      INSERT INTO url_hacker_news_stories
        (url_id, hacker_news_item_id, points, reply_count, posted_at)
      SELECT $1::uuid, s.hacker_news_item_id, s.points, s.reply_count, s.posted_at
      FROM unnest($4::bigint[], $5::int[], $6::int[], $7::timestamptz[])
        AS s(hacker_news_item_id, points, reply_count, posted_at)
    )
    INSERT INTO url_hacker_news_comments
      (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
    SELECT $1::uuid, c.hacker_news_item_id, c.parent_story_item_id, c.posted_at
    FROM unnest($8::bigint[], $9::bigint[], $10::timestamptz[])
      AS c(hacker_news_item_id, parent_story_item_id, posted_at)
  `,
    [
      seed.url_id,
      seed.story_count,
      seed.comment_count,
      stories.map(s => s.hacker_news_item_id),
      stories.map(s => s.points),
      stories.map(s => s.reply_count),
      stories.map(s => s.posted_at),
      comments.map(c => c.hacker_news_item_id),
      comments.map(c => c.parent_story_item_id),
      comments.map(c => c.posted_at),
    ],
  )
}

/** Check for a lookup row, including a zero-hit lookup hidden by public readers. */
export async function hasHackerNewsLookupForTest(urlId: string): Promise<boolean> {
  const result = await read(
    `/* hasHackerNewsLookupForTest */ SELECT 1 FROM url_hacker_news_totals WHERE url_id = $1`,
    [urlId],
  )
  return result.rows.length > 0
}

/** Capture row versions to check that unchanged cached facts are not rewritten. */
export async function getHackerNewsRowVersionsForTest(urlId: string): Promise<string[]> {
  const result = await write(
    `/* getHackerNewsRowVersionsForTest */
    SELECT 'story:' || hacker_news_item_id || ':' || xmin::text AS version
    FROM url_hacker_news_stories WHERE url_id = $1
    UNION ALL
    SELECT 'comment:' || hacker_news_item_id || ':' || xmin::text
    FROM url_hacker_news_comments WHERE url_id = $1
    ORDER BY version`,
    [urlId],
  )
  return result.rows.map(row => row.version as string)
}

/** Reproduce the two-hop URL chain that concurrent canonical updates can leave behind. */
export async function seedTwoHopCanonicalForTest(
  sourceUrlId: string,
  middleUrlId: string,
  canonicalUrlId: string,
): Promise<void> {
  await write(
    `/* seedTwoHopCanonicalForTest */
    UPDATE urls AS source SET canonical_url_id = links.canonical_url_id
    FROM (VALUES ($1::uuid, $2::uuid), ($2::uuid, $3::uuid)) AS links(url_id, canonical_url_id)
    WHERE source.id = links.url_id`,
    [sourceUrlId, middleUrlId, canonicalUrlId],
  )
}
