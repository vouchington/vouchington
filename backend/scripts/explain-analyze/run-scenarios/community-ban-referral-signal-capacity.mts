import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { checkReferralLinksToBannedPosts } from '@services/communities/ban-evasion/signals'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const SCENARIO = 'community-ban-referral-link-signal'
const QUERY = 'checkReferralLinksToBannedPosts'

async function seedReferralSignalLinks(userIds: string[], staleCandidateId: string) {
  const { rows } = await write<{ id: string }>(
    `/* seedCommunityBanReferralSignalLinks */
    WITH stale_candidate AS (
      INSERT INTO users (id, username) VALUES ($2, 'explain-referral-signal-' || $2::uuid)
      RETURNING id
    ), inputs AS (
      SELECT id, n FROM unnest($1::uuid[]) WITH ORDINALITY AS scope(id, n)
      UNION ALL SELECT id, 0 FROM stale_candidate
    )
    INSERT INTO user_referral_program_links
      (user_id, referral_program_topic_id, url_id, activated_at, deactivated_at, deleted_at, created_via)
    SELECT id, CASE WHEN n = 7 THEN $4::uuid ELSE $3::uuid END,
      CASE WHEN n IN (1, 2) THEN $5::uuid WHEN n > 9 THEN $6::uuid ELSE $7::uuid END,
      CASE WHEN n <> 8 THEN CURRENT_TIMESTAMP END,
      CASE WHEN n = 8 THEN CURRENT_TIMESTAMP END,
      CASE WHEN n = 9 THEN CURRENT_TIMESTAMP END, 'system'
    FROM inputs RETURNING id`,
    [
      userIds,
      staleCandidateId,
      seedUuid(0, '09'),
      seedUuid(1, '09'),
      seedUuid(0, '03'),
      seedUuid(1, '03'),
      seedUuid(2, '03'),
    ],
  )
  return rows.map(row => row.id)
}

export async function runCommunityBanReferralSignalCapacity(
  communityId: string,
  userIds: string[],
): Promise<void> {
  const [candidateId, bannedId] = userIds
  assert.ok(candidateId && bannedId)
  const staleCandidateId = randomUUID()
  const linkIds = await seedReferralSignalLinks(userIds, staleCandidateId)
  try {
    assert.equal(linkIds.length, userIds.length + 1)
    registerScenarioContract(SCENARIO, {
      allowEmptyResult: true,
      expectations: [
        // Main's broader plan probes a crowded URL before filtering on the banned user.
        // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192430938
        { kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: 3_784 },
        { kind: 'maxProcessedRows', relation: 'community_bans', max: 66 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 1 },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        assert.deepEqual(await checkReferralLinksToBannedPosts(communityId, candidateId), {
          matched: true,
          score: 1,
          sourceUserId: bannedId,
        })
        assert.deepEqual(await checkReferralLinksToBannedPosts(communityId, staleCandidateId), {
          matched: false,
          score: 0,
        })
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, QUERY] },
    )
  } finally {
    await using query = await beginTransaction()
    await query(
      '/* cleanupCommunityBanReferralSignalLinks */ DELETE FROM user_referral_program_links WHERE id = ANY($1::uuid[])',
      [linkIds],
    )
    await query('/* cleanupCommunityBanReferralSignalUser */ DELETE FROM users WHERE id = $1', [
      staleCandidateId,
    ])
    await query.commit()
  }
}
