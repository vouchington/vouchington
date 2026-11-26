import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { cleanupHackerNewsCardSidecars } from './hacker-news-card-sidecars-cleanup.mts'

const RELATED_URL_COUNT = 10
const URLS_PER_POST = 1 + RELATED_URL_COUNT
const BACKGROUND_URL_COUNT = 2200
const STORED_ITEMS_PER_URL = 25

type ReferenceSeed = {
  urlId: string
  storyCount: number
  commentCount: number
  firstStoryId: number
}

export async function seedHackerNewsCardSidecars(pageSize: number) {
  if (!Number.isInteger(pageSize) || pageSize < 3 || pageSize > 100) {
    throw new RangeError('Hacker News card fixture requires 3 to 100 cards per page')
  }

  const label = `hn-cards-${randomUUID().slice(-12)}`
  const hostname = `${label}.example.com`
  const postUrlCount = pageSize * URLS_PER_POST
  const foregroundUrlCount = postUrlCount + pageSize
  const urlCount = foregroundUrlCount + BACKGROUND_URL_COUNT
  await using query = await beginTransaction()
  const { rows } = await query<{
    actor_id: string
    hostname_id: string
    url_ids: string[]
    post_ids: string[]
    rss_ids: string[]
  }>(
    `/* seedHackerNewsCardSidecars:ids */
     SELECT uuidv7() AS actor_id, uuidv7() AS hostname_id,
       ARRAY(SELECT uuidv7() FROM generate_series(1, $1::int)) AS url_ids,
       ARRAY(SELECT uuidv7(date_trunc('month', statement_timestamp(), 'UTC')
         - statement_timestamp() - INTERVAL '15 days')
         FROM generate_series(1, $2::int)) AS post_ids,
       ARRAY(SELECT uuidv7() FROM generate_series(1, $2::int)) AS rss_ids`,
    [urlCount, pageSize],
  )
  const {
    actor_id: actorId,
    hostname_id: hostnameId,
    url_ids: urlIds,
    post_ids: postIds,
    rss_ids: rssIds,
  } = rows[0]!
  const rssItems = rssIds.map((id, index) => ({ id, url: { id: urlIds[postUrlCount + index]! } }))
  const expectedPostSummaries = Object.fromEntries(
    postIds
      .slice(0, -1)
      .map((id, index) => [
        id,
        index === pageSize - 2
          ? { story_count: 30, comment_count: 31 }
          : { story_count: 31, comment_count: 32 },
      ]),
  )
  const expectedRssSummaries = Object.fromEntries(
    rssItems.slice(0, -1).map(({ id }) => [id, { story_count: 1, comment_count: 1 }]),
  )

  const primaryUrls = postIds.map((_, index) => urlIds[index * URLS_PER_POST]!)
  const aliases: [string, string][] = []
  const references: ReferenceSeed[] = []
  for (const [index, primaryUrl] of primaryUrls.entries()) {
    const offset = index * URLS_PER_POST
    const firstStoryId = 10_000_000 + offset * 100
    if (index === pageSize - 1) continue
    // The primary has more references than its stored items. Counting its alias twice would
    // overcount even if the repeated stored item IDs were removed.
    references.push({ urlId: primaryUrl, storyCount: 30, commentCount: 31, firstStoryId })
    if (index % 2 === 0 || index === pageSize - 2) {
      aliases.push([urlIds[offset + 3]!, primaryUrl])
    }
    if (index === pageSize - 2) continue
    // One related URL shares both item IDs. Another contributes one new item of each kind.
    references.push(
      { urlId: urlIds[offset + 1]!, storyCount: 1, commentCount: 1, firstStoryId },
      {
        urlId: urlIds[offset + 2]!,
        storyCount: 1,
        commentCount: 1,
        firstStoryId: firstStoryId + 50,
      },
    )
  }
  for (const [index, urlId] of urlIds.slice(postUrlCount).entries()) {
    const isEmptyRssCard = index === pageSize - 1
    references.push({
      urlId,
      storyCount: isEmptyRssCard ? 0 : 1,
      commentCount: isEmptyRssCard ? 0 : 1,
      firstStoryId: 20_000_000 + index,
    })
  }
  const referenceUrlIds = references.map(row => row.urlId)
  const storyCounts = references.map(row => row.storyCount)
  const commentCounts = references.map(row => row.commentCount)
  const firstStoryIds = references.map(row => row.firstStoryId)

  await query(
    '/* seedHackerNewsCardSidecars:actor */ INSERT INTO users (id, username) VALUES ($1, $2)',
    [actorId, label],
  )
  await query(
    '/* seedHackerNewsCardSidecars:hostname */ INSERT INTO url_hostnames (id, hostname) VALUES ($1, $2)',
    [hostnameId, hostname],
  )
  await query(
    `/* seedHackerNewsCardSidecars:urls */
     INSERT INTO urls (id, url, hostname_id, search_params)
     SELECT id, 'https://' || $3 || '/' || ordinality, $2, '{}'::jsonb
     FROM unnest($1::uuid[]) WITH ORDINALITY AS seed(id, ordinality)`,
    [urlIds, hostnameId, hostname],
  )
  await query(
    `/* seedHackerNewsCardSidecars:aliases */
     UPDATE urls SET canonical_url_id = seed.canonical_id
     FROM unnest($1::uuid[], $2::uuid[]) AS seed(alias_id, canonical_id)
     WHERE urls.id = seed.alias_id`,
    [aliases.map(([alias]) => alias), aliases.map(([, canonical]) => canonical)],
  )
  await query(
    `/* seedHackerNewsCardSidecars:posts */
     INSERT INTO posts (id, url_id, created_by_id, created_via, post_type, title,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     SELECT post_id, url_id, $3, 'system', 'link', 'Hacker News card fixture',
       decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
     FROM unnest($1::uuid[], $2::uuid[]) AS seed(post_id, url_id)`,
    [postIds, primaryUrls, actorId],
  )
  await query(
    `/* seedHackerNewsCardSidecars:relatedUrls */
     INSERT INTO relation__post__related__url
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT seed.post_id, ($2::uuid[])[((seed.ordinality - 1) * ($4::int + 1) + related.slot + 1)::int],
       $3, 1, 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS seed(post_id, ordinality)
     CROSS JOIN generate_series(1, $4::int) AS related(slot)`,
    [postIds, urlIds.slice(0, postUrlCount), actorId, RELATED_URL_COUNT],
  )
  await query(
    `/* seedHackerNewsCardSidecars:totals */
     INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count)
     SELECT url_id, story_count, comment_count
     FROM unnest($1::uuid[], $2::int[], $3::int[]) AS seed(url_id, story_count, comment_count)`,
    [referenceUrlIds, storyCounts, commentCounts],
  )
  const { rowCount: stories } = await query(
    `/* seedHackerNewsCardSidecars:stories */
     INSERT INTO url_hacker_news_stories (url_id, hacker_news_item_id, points, reply_count, posted_at)
     SELECT seed.url_id, seed.first_story_id + item.ordinal, $4::int - item.ordinal, 1, CURRENT_TIMESTAMP
     FROM unnest($1::uuid[], $2::int[], $3::int[]) AS seed(url_id, story_count, first_story_id)
     CROSS JOIN LATERAL generate_series(0, LEAST(seed.story_count, $4::int) - 1) AS item(ordinal)`,
    [referenceUrlIds, storyCounts, firstStoryIds, STORED_ITEMS_PER_URL],
  )
  const { rowCount: comments } = await query(
    `/* seedHackerNewsCardSidecars:comments */
     INSERT INTO url_hacker_news_comments (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
     SELECT seed.url_id, seed.first_story_id + 100_000_000 + item.ordinal, seed.first_story_id,
       CURRENT_TIMESTAMP - item.ordinal * INTERVAL '1 second'
     FROM unnest($1::uuid[], $2::int[], $3::int[]) AS seed(url_id, comment_count, first_story_id)
     CROSS JOIN LATERAL generate_series(0, LEAST(seed.comment_count, $4::int) - 1) AS item(ordinal)`,
    [referenceUrlIds, commentCounts, firstStoryIds, STORED_ITEMS_PER_URL],
  )
  await query(`/* seedHackerNewsCardSidecars:analyze */
    ANALYZE posts, relation__post__related__url, urls, url_hacker_news_totals,
      url_hacker_news_stories, url_hacker_news_comments`)
  await query.commit()

  return {
    postIds,
    postItemUrlCount: 3 * (pageSize - 2),
    rssItems,
    expectedPostSummaries,
    expectedRssSummaries,
    seededRows: {
      relation__post__related__url: pageSize * RELATED_URL_COUNT,
      url_hacker_news_totals: references.length,
      url_hacker_news_stories: stories ?? 0,
      url_hacker_news_comments: comments ?? 0,
    },
    cleanup: () => cleanupHackerNewsCardSidecars(postIds, hostnameId, actorId),
  }
}
