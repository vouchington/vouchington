import { beginTransaction, write } from '@data-stores/psql'
import { postPublicationWorkMaxValues } from '@services/post-publication/work-limits'
import { seedUuid } from './common.mts'

const start = 8_000_000
export const publicationTopicFeedCount = 2 * postPublicationWorkMaxValues.capture_batch_size + 2
const total = publicationTopicFeedCount * 2
const fixtureBatchSize = 500
export const publicationTopicFeedIds = Array.from(
  { length: publicationTopicFeedCount },
  (_, index) => seedUuid(start + index * 2, 'f0'),
)

/** Each active feed owns a distinct topic and URL; alternating rows are excluded noise. */
export async function seedPublicationTopicFeedPages(): Promise<void> {
  for (let offset = 0; offset < total; offset += fixtureBatchSize) {
    const from = start + offset
    const to = Math.min(from + fixtureBatchSize, start + total)
    // no-mistakes-disable-next-line query-reached-per-item: fixture batches limit PostgreSQL topic-reference locks to 500 rows per transaction.
    await seedPublicationTopicFeedBatch(from, to)
  }
  await write('/* analyzePublicationTopicFeedPages */ ANALYZE rss_feeds')
}

async function seedPublicationTopicFeedBatch(from: number, to: number): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* seedPublicationTopicFeedPages:topics */
    INSERT INTO topics (id, name, slug, created_via, gemini_embedding_2_content_sha256, bedrock_nova_multimodal_v1_content_sha256)
    SELECT ('019e0000-f000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
      'Publication topic feed ' || n, 'explain-topic-feed-' || n, 'system', decode(repeat('00', 32), 'hex')
    , decode(repeat('00', 32), 'hex') FROM generate_series($1::int, $2::int - 1) n`,
    [from, to],
  )
  await query(
    `/* seedPublicationTopicFeedPages:urls */
    INSERT INTO urls (id, url, hostname_id, search_params)
    SELECT ('019e0000-f100-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
      'https://seed-host-0.example.com/explain-topic-feed-' || n, $3::uuid, '{}'::jsonb
    FROM generate_series($1::int, $2::int - 1) n`,
    [from, to, seedUuid(0, '02')],
  )
  await query(
    `/* seedPublicationTopicFeedPages:feeds */
    INSERT INTO rss_feeds (id, rss_feed_url_id, topic_id, title, created_via)
    SELECT ('019e0000-f200-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
      ('019e0000-f100-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
      ('019e0000-f000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
      'Publication topic feed', 'system'
    FROM generate_series($1::int, $2::int - 1) n`,
    [from, to],
  )
  await query.commit()
}

/** Delete only reserved fixture ranges, including identities retained by topic deletion. */
export async function cleanupPublicationTopicFeedPages(): Promise<void> {
  for (let offset = 0; offset < total; offset += fixtureBatchSize) {
    const from = start + offset
    const to = Math.min(from + fixtureBatchSize, start + total)
    // no-mistakes-disable-next-line query-reached-per-item: fixture cleanup releases topic-reference locks after each 500-row transaction.
    await cleanupPublicationTopicFeedBatch(from, to)
  }
}

async function cleanupPublicationTopicFeedBatch(from: number, to: number): Promise<void> {
  await using query = await beginTransaction()
  for (const [table, tag] of [
    ['rss_feeds', 'f2'],
    ['urls', 'f1'],
    ['topics', 'f0'],
    ['retained_topic_identities', 'f0'],
  ] as const) {
    await query(
      `/* cleanupPublicationTopicFeedPages */ DELETE FROM ${table} WHERE id >= $1::uuid AND id < $2::uuid`,
      [seedUuid(from, tag), seedUuid(to, tag)],
    )
  }
  await query.commit()
}
