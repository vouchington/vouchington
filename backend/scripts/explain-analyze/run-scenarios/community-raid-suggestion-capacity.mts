import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getRaidModeSuggestion } from '@services/communities/restrictions/suggestions'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const SCENARIO = 'community-raid-mode-suggestion'
const QUERY = 'getRaidModeSuggestion'
const LIVE_FLAG_COUNT = 16
const BACKGROUND_FLAG_COUNT = 1_024

async function seedRaidFlags(communityIds: string[]) {
  const { rows } = await write<{ post_id: string; ordinal: number; created_at: Date }>(
    `/* seedCommunityRaidModeFlags */
    WITH communities_fixture AS (
      INSERT INTO communities (id, name, slug, created_by_id, created_via)
      SELECT id, 'Raid mode capacity', 'explain-raid-' || id, $2, 'system'
      FROM unnest($1::uuid[]) AS scope(id) RETURNING id
    ), inputs AS MATERIALIZED (
      SELECT n, uuidv7(-n * interval '10 seconds') AS post_id,
        ($1::uuid[])[CASE WHEN n <= $3 + 3 THEN 1 WHEN n = $3 + 4 THEN 3 ELSE 2 END] AS community_id
      FROM generate_series(1, $3::int + 4 + $4::int) AS fixture(n)
    ), posts_fixture AS (
      INSERT INTO posts (id, community_id, created_by_id, post_type, title, markdown, created_via,
        approved_at, deleted_at, broadcast, privacy, bedrock_nova_multimodal_v1_content_sha256,
        llm_moderation_content_sha256)
      SELECT inputs.post_id, scopes.id, $2, 'discussion', 'Raid mode capacity', 'Fixture post',
        'system', CURRENT_TIMESTAMP, CASE WHEN n = $3 + 1 THEN CURRENT_TIMESTAMP END, 'everyone',
        'public', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
      FROM inputs JOIN communities_fixture scopes ON scopes.id = inputs.community_id
      RETURNING id
    ), flags AS (
      INSERT INTO vote_integrity_flags (id, post_id, flag_type, resolved_at, resolution)
      SELECT uuidv7(-n * interval '1 second'), posts_fixture.id,
        CASE WHEN n = $3 + 3 THEN 'ip_correlation'::vote_integrity_flag_types ELSE 'velocity_spike' END,
        CASE WHEN n IN ($3 + 2, $3 + 4) THEN CURRENT_TIMESTAMP END,
        CASE WHEN n IN ($3 + 2, $3 + 4) THEN 'dismissed'::vote_integrity_resolutions END
      FROM posts_fixture JOIN inputs ON inputs.post_id = posts_fixture.id
      RETURNING post_id, created_at
    )
    SELECT flags.post_id, inputs.n AS ordinal, flags.created_at
    FROM flags JOIN inputs USING (post_id) ORDER BY ordinal`,
    [communityIds, seedUser.id, LIVE_FLAG_COUNT, BACKGROUND_FLAG_COUNT],
  )
  return rows
}

export async function runCommunityRaidSuggestionCapacity(): Promise<void> {
  const communityIds = [randomUUID(), randomUUID(), randomUUID()]
  const [targetId, , emptyId] = communityIds
  assert.ok(targetId && emptyId)
  const flags = await seedRaidFlags(communityIds)
  try {
    const newest = flags[0]
    assert.ok(newest?.ordinal === 1)
    assert.equal(flags.length, LIVE_FLAG_COUNT + 4 + BACKGROUND_FLAG_COUNT)
    registerScenarioContract(SCENARIO, {
      expectations: [
        // Main can rescan the live community posts once per pending velocity flag.
        // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192241128
        { kind: 'maxProcessedRows', relation: 'posts', max: 18_759 },
        // The post-ID index plan also visits three flags filtered by status or type.
        {
          kind: 'maxProcessedRows',
          relation: 'vote_integrity_flags',
          max: LIVE_FLAG_COUNT + BACKGROUND_FLAG_COUNT + 4,
        },
      ],
      crossPartition: { posts: 'An unresolved velocity flag can refer to a post of any age.' },
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        assert.deepEqual(await getRaidModeSuggestion(targetId), {
          velocity_spike: true,
          flag_count: LIVE_FLAG_COUNT,
          latest_flagged_at: newest.created_at,
        })
        assert.deepEqual(await getRaidModeSuggestion(emptyId), {
          velocity_spike: false,
          flag_count: 0,
          latest_flagged_at: null,
        })
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, QUERY] },
    )
  } finally {
    await using query = await beginTransaction()
    await query('/* cleanupRaidModeCapacityPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])', [
      flags.map(flag => flag.post_id),
    ])
    await query(
      '/* cleanupRaidModeCapacityScopes */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
    await query.commit()
  }
}
