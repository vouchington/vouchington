import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql/types'

export type HackerNewsFilterFixture = {
  token: string
  actorId: string
  hostnameId: string
  topicId: string
  feedId: string
  urlIds: string[]
  postPrefixes: string[]
  rssPrefix: string
  postCount: number
  rssCount: number
  batchSize: number
}

/** Bounded synthetic filter corpus; callers own its transaction and cleanup. */
export async function seedHackerNewsFilterFixture(
  query: QueryExecutor,
  options: { postCount: number; rssCount: number; batchSize?: number },
): Promise<HackerNewsFilterFixture> {
  const { postCount, rssCount, batchSize = 5000 } = options
  if (
    !Number.isInteger(postCount) ||
    !Number.isInteger(rssCount) ||
    !Number.isInteger(batchSize) ||
    postCount < 1000 ||
    postCount > 1_000_000 ||
    rssCount < 0 ||
    rssCount > 100_000 ||
    batchSize < 1 ||
    batchSize > 5000
  )
    throw new Error('Hacker News fixture exceeds its bounded corpus contract')
  const token = randomUUID().replaceAll('-', '').slice(0, 6)
  const now = new Date()
  const recent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12))
  const middle = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 15, 12))
  const old = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 15, 12))
  const prefix = (date: Date) => {
    const h = date.getTime().toString(16).padStart(12, '0')
    return `${h.slice(0, 8)}-${h.slice(8)}-7000-8000-`
  }
  const q = async (text: string, values?: unknown[]) =>
    query(`/* seedHackerNewsFilterFixture */ ${text}`, values)
  const { rows: identities } = await q(
    'SELECT uuidv7() AS actor,uuidv7() AS hostname,uuidv7() AS topic,uuidv7() AS feed',
  )
  const row = identities[0]!
  const fixture: HackerNewsFilterFixture = {
    token,
    actorId: row.actor as string,
    hostnameId: row.hostname as string,
    topicId: row.topic as string,
    feedId: row.feed as string,
    urlIds: [],
    postPrefixes: [prefix(recent), prefix(middle), prefix(old)],
    rssPrefix: prefix(recent),
    postCount,
    rssCount,
    batchSize,
  }
  await q('INSERT INTO users(id,username)VALUES($1,$2)', [fixture.actorId, `hn-plan-${token}`])
  await q('INSERT INTO url_hostnames(id,hostname)VALUES($1,$2)', [
    fixture.hostnameId,
    `hn-plan-${token}.example.com`,
  ])
  const { rows: urls } = await q(
    `INSERT INTO urls(url,hostname_id,search_params)
    SELECT 'https://hn-plan-'||$1||'.example.com/'||i,$2,'{}'::jsonb
    FROM generate_series(0,999) i RETURNING id,url`,
    [token, fixture.hostnameId],
  )
  fixture.urlIds = urls
    .toSorted((a, b) => String(a.url).localeCompare(String(b.url)))
    .map(r => r.id as string)
  await q(
    `UPDATE urls SET canonical_url_id=($2::uuid[])[ordinality::int-500]
    FROM unnest($2::uuid[])WITH ORDINALITY x(id,ordinality)
    WHERE urls.id=x.id AND ordinality>500 AND urls.hostname_id=$1`,
    [fixture.hostnameId, fixture.urlIds],
  )
  await q(
    `INSERT INTO url_hacker_news_totals(url_id,story_count,comment_count,looked_up_at)
    SELECT id,0,0,CURRENT_TIMESTAMP FROM unnest($1::uuid[])x(id)`,
    [fixture.urlIds.slice(0, 500)],
  )
  for (let start = 0; start < postCount; start += batchSize) {
    const count = Math.min(batchSize, postCount - start)
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `INSERT INTO posts(id,created_via,post_type,title,created_by_id,approved_at,url_id,
      votes_score_up,votes_count_up,bedrock_nova_multimodal_v1_content_sha256,llm_moderation_content_sha256)
      SELECT ((CASE WHEN i<$4*.2 THEN $5 WHEN i<$4*.5 THEN $6 ELSE $7 END)
        ||$1||lpad(to_hex(i),6,'0'))::uuid,'system',CASE WHEN i%2=0 THEN 'link'::post_types ELSE 'discussion'::post_types END,'HN plan '||i,$2,CURRENT_TIMESTAMP,CASE WHEN i%2=0 THEN ($9::uuid[])[i%1000+1] END,
        (i*17)%101,(i*17)%101,decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex')
      FROM generate_series($3::int,$3::int+$8::int-1)i`,
      [token, fixture.actorId, start, postCount, ...fixture.postPrefixes, count, fixture.urlIds],
    )
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `INSERT INTO relation__post__related__url(subject_id,object_id,created_by_id,votes_score_up,votes_count_up)
      SELECT ((CASE WHEN i<$4*.2 THEN $5 WHEN i<$4*.5 THEN $6 ELSE $7 END)
        ||$1||lpad(to_hex(i),6,'0'))::uuid,($9::uuid[])[i%1000+1],$2,1,1
      FROM generate_series($3::int,$3::int+$8::int-1)i`,
      [token, fixture.actorId, start, postCount, ...fixture.postPrefixes, count, fixture.urlIds],
    )
  }
  await q(
    `INSERT INTO topics(id,created_via,name,slug,bedrock_nova_multimodal_v1_content_sha256)VALUES($1,'system',$2,$2,decode(repeat('00',32),'hex'))`,
    [fixture.topicId, `hn-plan-${token}`],
  )
  await q(
    `INSERT INTO rss_feeds(id,rss_feed_url_id,topic_id,title,created_via)
    VALUES($1,$2,$3,$4,'system')`,
    [fixture.feedId, fixture.urlIds[0], fixture.topicId, `HN plan ${token}`],
  )
  await q(
    `INSERT INTO rss_feed_setting_changes(change_type,rss_feed_id,is_enabled,reason)
    VALUES('enablement',$1,TRUE,'Owned HN fixture'),('discoverability',$1,TRUE,'Owned HN fixture')`,
    [fixture.feedId],
  )
  await q(
    `INSERT INTO relation__user__follow__rss_feed(subject_id,object_id,created_by_id)
    VALUES($1,$2,$1)`,
    [fixture.actorId, fixture.feedId],
  )
  for (let start = 0; start < rssCount; start += batchSize) {
    const count = Math.min(batchSize, rssCount - start)
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `INSERT INTO rss_feed_item_guids(id,url_hostname_id,guid)
      SELECT ($1||$2||lpad(to_hex(i),6,'0'))::uuid,$3,'hn-plan-'||$2||'-'||i
      FROM generate_series($4::int,$4::int+$5::int-1)i`,
      [fixture.rssPrefix, token, fixture.hostnameId, start, count],
    )
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `INSERT INTO rss_feed_items(id,url_id,data,bedrock_nova_multimodal_v1_content_sha256)
      SELECT ($1||$2||lpad(to_hex(i),6,'0'))::uuid,($3::uuid[])[i%1000+1],
        jsonb_build_object('title','HN plan item '||i,'isoDate',$6::text),decode(repeat('00',32),'hex')
      FROM generate_series($4::int,$4::int+$5::int-1)i`,
      [fixture.rssPrefix, token, fixture.urlIds, start, count, recent.toISOString()],
    )
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `INSERT INTO rss_feed_item_sources(rss_feed_id,rss_feed_item_id,published_at)
      SELECT $1,($2||$3||lpad(to_hex(i),6,'0'))::uuid,$6
      FROM generate_series($4::int,$4::int+$5::int-1)i`,
      [fixture.feedId, fixture.rssPrefix, token, start, count, recent],
    )
  }
  return fixture
}

/** Low flags two of every five posts so the hot walk stays on the rank leaf. */
export async function setHackerNewsFilterDensity(
  query: QueryExecutor,
  f: HackerNewsFilterFixture,
  high: boolean,
) {
  const flaggedInFiveHundred = high ? 400 : 200
  const q = async (text: string, values?: unknown[]) =>
    query(`/* setHackerNewsFilterDensity */ ${text}`, values)
  await q(
    `UPDATE url_hacker_news_totals SET story_count=CASE WHEN ordinality<=$2 THEN 1 ELSE 0 END
    FROM unnest($1::uuid[]) WITH ORDINALITY x(id,ordinality) WHERE url_id=x.id`,
    [f.urlIds.slice(0, 500), flaggedInFiveHundred],
  )
  for (let start = 0; start < f.postCount; start += f.batchSize) {
    const count = Math.min(f.batchSize, f.postCount - start)
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `UPDATE posts SET has_hacker_news_references=i%500<$2
      FROM generate_series($3::int,$3::int+$8::int-1)i
      WHERE id=((CASE WHEN i<$4*.2 THEN $5 WHEN i<$4*.5 THEN $6 ELSE $7 END)||$1||lpad(to_hex(i),6,'0'))::uuid
      AND posts.has_hacker_news_references IS DISTINCT FROM (i%500<$2)`,
      [f.token, flaggedInFiveHundred, start, f.postCount, ...f.postPrefixes, count],
    )
  }
  for (let start = 0; start < f.rssCount; start += f.batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each call writes one set-based fixture batch capped at 5000 rows; the loop has a finite corpus limit.
    await q(
      `UPDATE rss_feed_items SET has_hacker_news_references=i%500<$2
      FROM generate_series($3::int,$3::int+$4::int-1)i
      WHERE id=($5||$1||lpad(to_hex(i),6,'0'))::uuid
      AND rss_feed_items.has_hacker_news_references IS DISTINCT FROM (i%500<$2)`,
      [
        f.token,
        flaggedInFiveHundred,
        start,
        Math.min(f.batchSize, f.rssCount - start),
        f.rssPrefix,
      ],
    )
  }
}
