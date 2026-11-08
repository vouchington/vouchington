import { beginTransaction } from '@data-stores/psql'
import { seedUuidAtTimestamp } from './common.mts'
import {
  assertNoLeftoverHackerNewsScalePartitions,
  buildHackerNewsScaleFixture,
  insertHackerNewsScalePartitions,
  type HackerNewsScaleFixture,
} from './hacker-news-scale-storage.mts'

export {
  assertNoLeftoverHackerNewsScalePartitions,
  type HackerNewsScaleFixture,
} from './hacker-news-scale-storage.mts'

/** Last-phase fixture; its owned partitions survive until the disposable database is discarded. */
export async function seedHackerNewsScaleFixture(): Promise<HackerNewsScaleFixture> {
  await assertNoLeftoverHackerNewsScalePartitions()
  const fixture = buildHackerNewsScaleFixture()
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedHackerNewsScaleActor */ INSERT INTO users (id, username)
     VALUES ($1, 'seed-hn-scale-5053')`,
    [fixture.actorId],
  )
  await transaction(
    `/* seedHackerNewsScaleHostname */ INSERT INTO url_hostnames (id, hostname)
     VALUES ($1, 'hn-scale-5053.example.com')`,
    [fixture.hostnameId],
  )
  await transaction(
    `/* seedHackerNewsScaleUrls */ INSERT INTO urls (id, url, hostname_id, search_params)
     SELECT fixture.id, 'https://hn-scale-5053.example.com/' || fixture.ordinal, $2, '{}'::jsonb
     FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)`,
    [fixture.urlIds, fixture.hostnameId],
  )
  await transaction(
    `/* seedHackerNewsScaleTotals */ INSERT INTO url_hacker_news_totals
     (url_id, story_count, comment_count, looked_up_at)
     SELECT id, 0, 0, now() FROM unnest($1::uuid[]) AS fixture(id)`,
    [fixture.urlIds],
  )
  await insertHackerNewsScalePartitions(transaction, fixture)
  // Relation ids must follow both their future-dated subjects and URL identities.
  const relationPrefix = seedUuidAtTimestamp(fixture.decisionInstant.getTime() + 1_000, 0).slice(
    0,
    24,
  )
  await transaction(
    `/* seedHackerNewsScaleVotedUrls */ INSERT INTO relation__post__related__url
     (id, subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT ($1 || lpad(to_hex(40_000_000 + fixture.ordinal), 12, '0'))::uuid,
       fixture.id, $3, $4, 1, 1
     FROM unnest($2::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)`,
    [relationPrefix, fixture.matchingPostIds, fixture.urlIds[0], fixture.actorId],
  )
  await transaction.commit()
  return fixture
}
