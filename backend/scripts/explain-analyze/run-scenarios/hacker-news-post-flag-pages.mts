import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import {
  pagePostHackerNewsFlagRepair,
  pagePostHackerNewsFlags,
} from '@services/posts/hacker-news-flag-pages'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'

// Default batch_size in backend/queues/hacker-news-flags/config.mts.
const PAGE_SIZE = 100
const BACKGROUND = 2_000

export async function runHackerNewsPostFlagPages(): Promise<void> {
  const fixture = await seedPostFlagPages(PAGE_SIZE)
  try {
    await write(`/* analyzeHackerNewsPostFlagPages */
      ANALYZE posts, relation__post__related__url`)
    await captureUrlPage('posts', PAGE_SIZE, fixture)
    await captureUrlPage('related', PAGE_SIZE, fixture)
    await captureRepairPage(PAGE_SIZE, fixture.posts)
  } finally {
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupHackerNewsFlagPosts */
      DELETE FROM posts WHERE id = ANY(${fixture.posts}::uuid[])`)
    await cleanup(sql`/* cleanupHackerNewsFlagUrls */
      DELETE FROM urls WHERE hostname_id = ${fixture.hostnameId}`)
    await cleanup(sql`/* cleanupHackerNewsFlagHostname */
      DELETE FROM url_hostnames WHERE id = ${fixture.hostnameId}`)
    await cleanup.commit()
  }
}

async function captureUrlPage(
  phase: 'posts' | 'related',
  size: number,
  fixture: Awaited<ReturnType<typeof seedPostFlagPages>>,
) {
  const scenario = `hacker-news-post-flag-${phase}-at-cap`
  const name = phase === 'posts' ? 'pageHackerNewsOwnUrlPosts' : 'pageHackerNewsRelatedUrlPosts'
  const kind = phase === 'posts' ? 'own' : 'related'
  const after = fixture.posts[0]!
  const upper = fixture.posts[size * 2 + 3]!
  const relation = phase === 'posts' ? 'posts' : 'relation__post__related__url'
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxProcessedRows', relation, max: size, captureIndex: 0 },
      { kind: 'maxProcessedRows', relation, max: 1, captureIndex: 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const expected = fixture.posts.slice(1, size * 2 + 4).filter((_, n) => n % 2 === 1)
      assert.equal(expected.length, size + 1)
      const first = await pagePostHackerNewsFlags(kind, fixture.urlId, after, upper, size)
      assert.deepEqual(first, expected.slice(0, size))
      const last = await pagePostHackerNewsFlags(kind, fixture.urlId, first.at(-1)!, upper, size)
      assert.deepEqual(last, expected.slice(size))
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function captureRepairPage(size: number, posts: string[]) {
  const scenario = 'hacker-news-post-flag-repair-at-cap'
  const name = 'pageHackerNewsPostFlagRepair'
  const upper = posts[size + 1]!
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: size, captureIndex: 0 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 1, captureIndex: 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await pagePostHackerNewsFlagRepair(posts[0]!, upper, size)
      assert.deepEqual(first, posts.slice(1, size + 1))
      const last = await pagePostHackerNewsFlagRepair(first.at(-1)!, upper, size)
      assert.deepEqual(last, [upper])
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function seedPostFlagPages(size: number) {
  await using query = await beginTransaction()
  const hostname = `hn-flag-${randomUUID()}.example.com`
  const { rows: hostnames } = await query<{ id: string }>(sql`
    /* seedHackerNewsFlagHostname */ INSERT INTO url_hostnames (hostname)
    VALUES (${hostname}) RETURNING id`)
  const hostnameId = hostnames[0]!.id
  const targetUrl = `https://${hostname}/target`
  const otherUrl = `https://${hostname}/other`
  const { rows: urls } = await query<{ id: string; url: string }>(sql`
    /* seedHackerNewsFlagUrls */ INSERT INTO urls (url, hostname_id, search_params)
    VALUES (${targetUrl}, ${hostnameId}, '{}'::jsonb),
           (${otherUrl}, ${hostnameId}, '{}'::jsonb)
    RETURNING id, url`)
  const urlId = urls.find(row => row.url.endsWith('/target'))!.id
  const otherUrlId = urls.find(row => row.url.endsWith('/other'))!.id
  const hash = contentHash('hacker-news-post-flag-pages')
  const cohortSize = size * 2 + 5
  // Reserve one UUIDv7 prefix so the unfiltered repair window only sees fixture posts.
  const { rows: posts } = await query<{ id: string; title: string }>(sql`
    /* seedHackerNewsFlagPosts */
    WITH anchor AS (SELECT left(uuidv7()::text, 30) AS prefix)
    INSERT INTO posts (id, created_via, post_type, title, url_id, created_by_id, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT (anchor.prefix || lpad(to_hex(n), 6, '0'))::uuid, 'system', 'link', n::text,
      CASE WHEN n <= ${cohortSize} AND n % 2 = 1 THEN ${urlId}::uuid ELSE ${otherUrlId}::uuid END,
      ${seedUser.id}, CURRENT_TIMESTAMP, ${hash}, ${hash}
    FROM generate_series(1, ${cohortSize + BACKGROUND}) n CROSS JOIN anchor
    ORDER BY n
    RETURNING id, title`)
  const postIds = posts.toSorted((a, b) => Number(a.title) - Number(b.title)).map(row => row.id)
  await query(sql`
    /* seedHackerNewsFlagRelations */
    INSERT INTO relation__post__related__url
      (subject_id, object_id, created_by_id, votes_score_up, votes_count_up, deleted_at)
    SELECT id, CASE WHEN n <= ${cohortSize} THEN ${urlId}::uuid ELSE ${otherUrlId}::uuid END,
      ${seedUser.id}, CASE WHEN n % 4 = 0 THEN 0 ELSE 1 END,
      CASE WHEN n % 4 = 0 THEN 0 ELSE 1 END,
      CASE WHEN n % 4 = 2 THEN CURRENT_TIMESTAMP END
    FROM unnest(${postIds}::uuid[]) WITH ORDINALITY AS fixture(id, n)`)
  await query.commit()
  return { hostnameId, urlId, posts: postIds }
}
