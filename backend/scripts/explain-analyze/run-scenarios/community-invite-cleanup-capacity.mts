import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { deletePendingInvitesForMember } from '@services/communities/invites/delete-pending-for-member'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedHostnameIds, seedUser } from '../run-support.mts'

const SCENARIO = 'community-invite-member-cleanup-at-cap'
const QUERY = 'deletePendingInvitesForMember'
const ADDRESS_CAP = 10
const UNRELATED_INVITES = 300
const OTHER_COMMUNITY_INVITES = 3_000

async function seedInvites(userId: string, communityIds: string[]) {
  const name = `explain-invites-${userId.slice(0, 12)}`
  const { rows } = await write<{ id: string; expected_removed: boolean }>(
    `/* seedCommunityInviteCleanupCapacity */
    WITH invitee AS (
      INSERT INTO users (id, username) VALUES ($1, $2) RETURNING id
    ), scopes AS (
      INSERT INTO communities (id, name, slug, created_by_id, created_via)
      SELECT id, 'Invite cleanup fixture', $2 || '-' || scope.n, $4, 'system'
      FROM unnest($3::uuid[]) WITH ORDINALITY AS scope(id, n) RETURNING id
    ), membership AS (
      INSERT INTO community_members (community_id, user_id)
      SELECT scopes.id, invitee.id FROM scopes CROSS JOIN invitee
      WHERE scopes.id = ($3::uuid[])[1] RETURNING id
    ), domain AS (
      SELECT id, hostname FROM url_hostnames WHERE id = $5
    ), addresses AS (
      INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
      SELECT invitee.id, $2 || '-' || n || '@' || domain.hostname, domain.id, n = 1
      FROM invitee CROSS JOIN domain CROSS JOIN generate_series(1, $6::int) n RETURNING id
    ), inputs AS MATERIALIZED (
      SELECT uuidv7() AS id, scopes.id AS community_id, n, domain.hostname
      FROM scopes CROSS JOIN domain
      CROSS JOIN LATERAL generate_series(
        1, CASE WHEN scopes.id = ($3::uuid[])[1] THEN $6 + 4 + $7::int ELSE $6 + 1 + $8::int END
      ) n
    ), invitations AS (
      INSERT INTO community_invites (id, community_id, code_hash, invited_by_id, invited_user_id,
        invited_email, accepted_at, accepted_by_id, declined_at, revoked_at)
      SELECT id, community_id, upper(encode(sha256(convert_to(id::text, 'UTF8')), 'hex')), $4,
        CASE WHEN n IN ($6 + 1, $6 + 2) THEN $1 END,
        CASE WHEN n <= $6 THEN $2 || '-' || n || '@' || hostname
          WHEN n IN ($6 + 3, $6 + 4) THEN $2 || '-1@' || hostname
          WHEN n > $6 + 4 THEN $2 || '-unrelated-' || n || '@' || hostname END,
        CASE WHEN n = $6 + 2 THEN CURRENT_TIMESTAMP END,
        CASE WHEN n = $6 + 2 THEN $1 END,
        CASE WHEN n = $6 + 3 THEN CURRENT_TIMESTAMP END,
        CASE WHEN n = $6 + 4 THEN CURRENT_TIMESTAMP END
      FROM inputs RETURNING id
    )
    SELECT invitations.id, inputs.community_id = ($3::uuid[])[1] AND n <= $6 + 1 AS expected_removed
    FROM invitations JOIN inputs USING (id) ORDER BY invitations.id`,
    [
      userId,
      name,
      communityIds,
      seedUser.id,
      seedHostnameIds[0],
      ADDRESS_CAP,
      UNRELATED_INVITES,
      OTHER_COMMUNITY_INVITES,
    ],
  )
  return rows
}

export async function runCommunityInviteCleanupCapacity(): Promise<void> {
  const userId = randomUUID()
  const communityIds = [randomUUID(), randomUUID()]
  try {
    const seeded = await seedInvites(userId, communityIds)
    await write(
      '/* analyzeCommunityInviteCleanup */ ANALYZE community_invites, user_email_addresses',
    )
    const expectedSurvivors = seeded.filter(row => !row.expected_removed).map(row => row.id)
    assert.equal(seeded.length, UNRELATED_INVITES + OTHER_COMMUNITY_INVITES + 2 * ADDRESS_CAP + 5)
    assert.equal(seeded.length - expectedSurvivors.length, ADDRESS_CAP + 1)
    registerScenarioContract(SCENARIO, {
      // DELETE has no RETURNING. Verify the exact surviving IDs in the same transaction.
      allowEmptyResult: true,
      seededRows: { community_invites: seeded.length },
      expectations: [
        // Main's generic plan scans the whole invite fixture.
        // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7192015543
        { kind: 'maxProcessedRows', relation: 'community_invites', max: seeded.length },
        { kind: 'maxProcessedRows', relation: 'user_email_addresses', max: ADDRESS_CAP },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        await using query = await beginTransaction()
        await deletePendingInvitesForMember(communityIds[0]!, userId, { query })
        const { rows } = await query<{ id: string }>(
          `/* inspectCommunityInviteCleanup */
          SELECT id FROM community_invites WHERE community_id = ANY($1::uuid[]) ORDER BY id`,
          [communityIds],
        )
        assert.deepEqual(
          rows.map(row => row.id),
          expectedSurvivors,
        )
        await query.rollback()
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, 'inspectCommunityInviteCleanup'] },
    )
  } finally {
    await write(
      '/* cleanupCommunityInviteCapacityScopes */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
    await write('/* cleanupCommunityInviteCapacityUser */ DELETE FROM users WHERE id = $1', [
      userId,
    ])
  }
}
