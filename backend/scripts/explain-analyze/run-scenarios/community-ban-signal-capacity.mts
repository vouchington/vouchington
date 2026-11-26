import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { BAN_EVASION_BAN_LOOKBACK_DAYS } from '@services/communities/ban-evasion/config'
import { checkContentHashMatchToBannedPosts } from '@services/communities/ban-evasion/signals'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { resolveSeedAnchor, SEED_ANCHOR_DATE_ENV } from '../seed-data/seed-anchor.mts'
import { runCommunityBanEmbeddingCapacity } from './community-ban-embedding-capacity.mts'

const QUERY = 'checkContentHashMatchToBannedPosts'
const TRIGGER_SCENARIO = 'community-ban-hash-triggering-post'
const HISTORY_SCENARIO = 'community-ban-hash-candidate-history'
const HISTORICAL_POSTS = 128
const ACTIVE_BANS = 64

async function seedBanSignalPosts(userIds: string[], communityIds: string[]) {
  const suffix = randomUUID().slice(0, 12)
  const { dayAnchorMs } = resolveSeedAnchor(process.env[SEED_ANCHOR_DATE_ENV])
  await using query = await beginTransaction()
  await query(
    `/* seedCommunityBanHashUsers */
    INSERT INTO users (id, username)
    SELECT id, 'explain-hash-' || $2 || '-' || n
    FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n)`,
    [userIds, suffix],
  )
  await query(
    `/* seedCommunityBanHashScopes */
    INSERT INTO communities (id, name, slug, created_by_id, created_via)
    SELECT id, 'Ban hash fixture', 'explain-hash-' || $2 || '-' || n, $3, 'system'
    FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n)`,
    [communityIds, suffix, seedUser.id],
  )
  await query(
    `/* seedCommunityBanHashBans */
    WITH cases AS (
      INSERT INTO moderation_cases (reported_user_id)
      SELECT id FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n) WHERE n > 1
      RETURNING id, reported_user_id
    )
    INSERT INTO community_bans (id, community_id, user_id, banned_by_id, expires_at, lifted_at, case_id)
    SELECT uuidv7($5::timestamptz - CURRENT_TIMESTAMP
      - CASE WHEN n = 5 THEN ($4::int + 1) * interval '1 day' ELSE interval '2 days' END),
      ($2::uuid[])[CASE WHEN n = 6 THEN 2 ELSE 1 END], users.id, $3,
      CASE WHEN n = 4 THEN CURRENT_TIMESTAMP - interval '1 day' END,
      CASE WHEN n = 3 THEN CURRENT_TIMESTAMP - interval '1 day' END, cases.id
    FROM unnest($1::uuid[]) WITH ORDINALITY AS users(id, n) JOIN cases ON users.id = cases.reported_user_id`,
    [userIds, communityIds, seedUser.id, BAN_EVASION_BAN_LOOKBACK_DAYS, new Date(dayAnchorMs)],
  )
  const { rows } = await query<{ id: string; title: string }>(
    `/* seedCommunityBanHashPosts */
    INSERT INTO posts
      (id, community_id, created_by_id, post_type, title, markdown, created_via, approved_at,
       broadcast, privacy, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT uuidv7(-post_number * interval '30 minutes'),
      ($2::uuid[])[CASE WHEN author_number = 6 THEN 2 ELSE 1 END], user_id,
      'discussion', author_number || '-' || post_number, 'Capacity fixture', 'system',
      CURRENT_TIMESTAMP, 'everyone', 'public', digest, digest
    FROM unnest($1::uuid[]) WITH ORDINALITY AS users(user_id, author_number)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN author_number = 1 THEN $3::int ELSE 1 END)
      AS fixture(post_number)
    CROSS JOIN LATERAL (
      SELECT sha256(convert_to($4 || CASE
        WHEN author_number = 2 OR (author_number = 1 AND post_number = $3) THEN '-match'
        WHEN author_number BETWEEN 3 AND 6 OR (author_number = 1 AND post_number = 1) THEN '-stale'
        ELSE '-' || author_number || '-' || post_number
      END, 'UTF8')) AS digest
    ) AS hashes
    RETURNING id, title`,
    [userIds, communityIds, HISTORICAL_POSTS, suffix],
  )
  await query.commit()
  return rows
}

export async function runCommunityBanSignalCapacity(): Promise<void> {
  const userIds = Array.from({ length: ACTIVE_BANS + 5 }, () => randomUUID())
  const [candidateId, bannedId] = userIds
  const communityIds = [randomUUID(), randomUUID()]
  const [communityId] = communityIds
  assert.ok(communityId && candidateId && bannedId)
  const posts = await seedBanSignalPosts(userIds, communityIds)
  try {
    const stalePostId = posts.find(post => post.title === '1-1')?.id
    const matchingPostId = posts.find(post => post.title === `1-${HISTORICAL_POSTS}`)?.id
    assert.ok(stalePostId && matchingPostId)
    const match = { matched: true, score: 1, sourceUserId: bannedId }
    registerScenarioContract(TRIGGER_SCENARIO, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'posts', max: 3, captureIndex: 0 },
        { kind: 'maxProcessedRows', relation: 'community_bans', max: 1, captureIndex: 0 },
        // Main's custom miss probes the post hash for every active ban.
        // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192123257
        { kind: 'maxProcessedRows', relation: 'posts', max: 321, captureIndex: 1 },
        { kind: 'maxProcessedRows', relation: 'community_bans', max: 66, captureIndex: 1 },
      ],
      crossPartition: {
        posts: 'The source post can predate both the triggering post and its ban.',
      },
    })
    await runAndCapture(
      TRIGGER_SCENARIO,
      async () => {
        assert.deepEqual(
          await checkContentHashMatchToBannedPosts(communityId, candidateId, matchingPostId),
          match,
        )
        assert.deepEqual(
          await checkContentHashMatchToBannedPosts(communityId, candidateId, stalePostId),
          { matched: false, score: 0 },
        )
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, QUERY] },
    )

    registerScenarioContract(HISTORY_SCENARIO, {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'posts', max: 3 },
        { kind: 'maxProcessedRows', relation: 'community_bans', max: 1 },
      ],
      crossPartition: { posts: 'Candidate and banned-user posts can span historical partitions.' },
    })
    await runAndCapture(
      HISTORY_SCENARIO,
      async () => {
        assert.deepEqual(await checkContentHashMatchToBannedPosts(communityId, candidateId), match)
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY] },
    )

    await write(
      `/* seedCommunityBanEmbeddingVectors */
      UPDATE posts
      SET bedrock_nova_multimodal_v1_embedding = (
        CASE WHEN id = $2 OR created_by_id = $3 THEN ARRAY[1,0,0]
          WHEN id = $4 OR created_by_id = ANY($5::uuid[]) THEN ARRAY[0,1,0]
          WHEN created_by_id = $6 THEN ARRAY[0,-1,0]
          ELSE ARRAY[0,0,1] END || array_fill(0, ARRAY[1021])
      )::vector(1024)
      WHERE id = ANY($1::uuid[])`,
      [
        posts.map(post => post.id),
        matchingPostId,
        bannedId,
        stalePostId,
        userIds.slice(2, 6),
        candidateId,
      ],
    )
    await runCommunityBanEmbeddingCapacity(
      communityId,
      candidateId,
      bannedId,
      matchingPostId,
      stalePostId,
    )
  } finally {
    await write('/* cleanupCommunityBanHashPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])', [
      posts.map(post => post.id),
    ])
    await write(
      '/* cleanupCommunityBanHashScopes */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
    await write(
      '/* cleanupCommunityBanHashCases */ DELETE FROM moderation_cases WHERE reported_user_id = ANY($1::uuid[])',
      [userIds],
    )
    await write('/* cleanupCommunityBanHashUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])', [
      userIds,
    ])
  }
}
