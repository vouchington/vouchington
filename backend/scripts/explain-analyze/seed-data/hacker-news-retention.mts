import { write } from '@data-stores/psql'

const FIRST_URL_INDEX = 100_000
const FIRST_HOSTNAME_INDEX = 200_000
const SEEDED_URL_COUNT = 20_000

/** Seed enough old and live rows to measure the bounded Hacker News retention selector. */
export async function seedHackerNewsRetention(expiredRows = 500): Promise<void> {
  await write(
    `/* seedExplainHackerNewsRetention:hostnames */
     INSERT INTO url_hostnames (id, hostname, publicly_introduced_at)
     SELECT format('019e0000-0200-7000-8000-%s', lpad(to_hex(series.index), 12, '0'))::uuid,
       format('hn-retention-%s.example.com', series.index), CURRENT_TIMESTAMP
     FROM generate_series($1::integer, $1::integer + $2::integer - 1) AS series(index)
     ON CONFLICT DO NOTHING`,
    [FIRST_HOSTNAME_INDEX, 1000],
  )

  await write(
    `/* seedExplainHackerNewsRetention:urls */
     INSERT INTO urls (id, url, hostname_id, search_params)
     SELECT format('019e0000-0300-7000-8000-%s', lpad(to_hex(series.index), 12, '0'))::uuid,
       format('https://hn-retention-%s.example.com/hn-retention/%s',
         $3::integer + series.index % 1000, series.index),
       format('019e0000-0200-7000-8000-%s', lpad(to_hex(
         $3::integer + series.index % 1000), 12, '0'))::uuid,
       '{}'::jsonb
     FROM generate_series($1::integer, $1::integer + $2::integer - 1) AS series(index)
     ON CONFLICT DO NOTHING`,
    [FIRST_URL_INDEX, SEEDED_URL_COUNT, FIRST_HOSTNAME_INDEX],
  )

  await write(
    `/* seedExplainHackerNewsRetention:totals */
     INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count, looked_up_at)
     SELECT url.id, 0, 0,
       CASE WHEN series.index < $3::integer
         THEN CURRENT_TIMESTAMP - INTERVAL '100 years'
         ELSE CURRENT_TIMESTAMP - INTERVAL '1 day'
       END
     FROM generate_series($1::integer, $1::integer + $2::integer - 1) AS series(index)
     JOIN urls url ON url.id = format(
       '019e0000-0300-7000-8000-%s', lpad(to_hex(series.index), 12, '0'))::uuid
     ON CONFLICT (url_id) DO UPDATE
       SET story_count = EXCLUDED.story_count,
           comment_count = EXCLUDED.comment_count,
           looked_up_at = EXCLUDED.looked_up_at`,
    [FIRST_URL_INDEX, SEEDED_URL_COUNT, FIRST_URL_INDEX + expiredRows],
  )

  await write(
    `/* seedExplainHackerNewsRetention:stories */
     INSERT INTO url_hacker_news_stories
       (url_id, hacker_news_item_id, points, reply_count, posted_at)
     SELECT totals.url_id, 2_000_000 + series.index, 1, 0, CURRENT_TIMESTAMP
    FROM generate_series($1::integer, $1::integer + $2::integer - 1) AS series(index)
     JOIN url_hacker_news_totals totals ON totals.url_id = format(
       '019e0000-0300-7000-8000-%s', lpad(to_hex(series.index), 12, '0'))::uuid
     ON CONFLICT (url_id, hacker_news_item_id) DO NOTHING`,
    [FIRST_URL_INDEX, Math.min(expiredRows, 25)],
  )

  await write(
    `/* seedExplainHackerNewsRetention:comments */
     INSERT INTO url_hacker_news_comments
       (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
     SELECT totals.url_id, 3_000_000 + series.index, 4_000_000 + series.index,
       CURRENT_TIMESTAMP
    FROM generate_series($1::integer, $1::integer + $2::integer - 1) AS series(index)
     JOIN url_hacker_news_totals totals ON totals.url_id = format(
       '019e0000-0300-7000-8000-%s', lpad(to_hex(series.index), 12, '0'))::uuid
     ON CONFLICT (url_id, hacker_news_item_id) DO NOTHING`,
    [FIRST_URL_INDEX, Math.min(expiredRows, 25)],
  )

  await write(
    `/* seedExplainHackerNewsRetention:analyze */
     ANALYZE urls, url_hacker_news_totals,
       url_hacker_news_stories, url_hacker_news_comments`,
  )
}
