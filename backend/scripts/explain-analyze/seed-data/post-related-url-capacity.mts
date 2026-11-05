import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const POST_URL_CAPACITY_SEED = {
  user: seedUuid(0, 'f6'),
  hostname: seedUuid(0, 'f6'),
  posts: [0, 1, 2, 3].map(index => seedUuid(index, 'f6')),
  urlStart: seedUuid(100, 'f6'),
  urlEnd: seedUuid(21101, 'f6'),
  activeUrl: seedUuid(100, 'f6'),
  deletedUrl: seedUuid(11100, 'f6'),
  newUrl: seedUuid(21100, 'f6'),
  relationRows: 57000,
}

/** Owned hot subjects, deleted history, and unrelated active rows challenge both count subplans. */
export async function seedPostUrlCapacity(): Promise<void> {
  const s = POST_URL_CAPACITY_SEED
  await using query = await beginTransaction()
  await query(
    `/* seedPostUrlCapacity:user */
    INSERT INTO users (id, username) VALUES ($1, 'seed-post-url-capacity')`,
    [s.user],
  )
  await query(
    `/* seedPostUrlCapacity:hostname */
    INSERT INTO url_hostnames (id, hostname) VALUES ($1, 'seed-post-url-capacity.example.com')`,
    [s.hostname],
  )
  await query(
    `/* seedPostUrlCapacity:posts */
    INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT id, $2, 'discussion', 'Capacity seed', 'Capacity seed', 'system',
      decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex')
    FROM unnest($1::uuid[]) input(id)`,
    [s.posts, s.user],
  )
  await query(
    `/* seedPostUrlCapacity:urls */
    INSERT INTO urls (id, url, hostname_id, search_params)
    SELECT ('019e0000-f600-7000-8000-' || lpad(to_hex(n+100),12,'0'))::uuid,
      'https://seed-post-url-capacity.example.com/' || n, $1, '{}'::jsonb
    FROM generate_series(0,21000) n`,
    [s.hostname],
  )
  await query(
    `/* seedPostUrlCapacity:relations */
    INSERT INTO relation__post__related__url (subject_id, object_id, created_by_id, deleted_at)
    SELECT input.post_id, url.id, $2,
      CASE WHEN url.id >= $3 THEN CURRENT_TIMESTAMP ELSE NULL END
    FROM unnest($1::uuid[], ARRAY[1000,10000,11000,5000]) input(post_id,active_count)
    CROSS JOIN urls url
    WHERE url.id >= $4 AND url.id < $5
      AND (url.id < ('019e0000-f600-7000-8000-' || lpad(to_hex(input.active_count+100),12,'0'))::uuid
        OR (input.post_id <> $6 AND url.id >= $3))`,
    [s.posts, s.user, s.deletedUrl, s.urlStart, s.newUrl, s.posts[3]],
  )
  const { rows } = await query<{ count: number }>(
    `/* countSeededPostUrlCapacity */ SELECT count(*)::integer AS count
      FROM relation__post__related__url WHERE subject_id = ANY($1::uuid[])`,
    [s.posts],
  )
  assert.equal(rows[0]?.count, s.relationRows)
  await query.commit()
}

export async function cleanupPostUrlCapacity(): Promise<void> {
  const s = POST_URL_CAPACITY_SEED
  await using query = await beginTransaction()
  await query(
    `/* cleanupPostUrlCapacity:relations */
    DELETE FROM relation__post__related__url WHERE subject_id = ANY($1::uuid[])`,
    [s.posts],
  )
  await query(`/* cleanupPostUrlCapacity:posts */ DELETE FROM posts WHERE id = ANY($1::uuid[])`, [
    s.posts,
  ])
  await query(`/* cleanupPostUrlCapacity:urls */ DELETE FROM urls WHERE id >= $1 AND id < $2`, [
    s.urlStart,
    s.urlEnd,
  ])
  await query(`/* cleanupPostUrlCapacity:hostname */ DELETE FROM url_hostnames WHERE id = $1`, [
    s.hostname,
  ])
  await query(`/* cleanupPostUrlCapacity:user */ DELETE FROM users WHERE id = $1`, [s.user])
  await query(
    `/* cleanupPostUrlCapacity:postIdentities */ DELETE FROM retained_post_identities WHERE id = ANY($1::uuid[])`,
    [s.posts],
  )
  await query(
    `/* cleanupPostUrlCapacity:userIdentity */ DELETE FROM retained_user_identities WHERE id = $1`,
    [s.user],
  )
  const { rows } = await query<{ count: number }>(
    `/* countCleanedPostUrlCapacity */ SELECT count(*)::integer AS count
      FROM relation__post__related__url WHERE subject_id = ANY($1::uuid[])`,
    [s.posts],
  )
  assert.equal(rows[0]?.count, 0)
  await query.commit()
}
