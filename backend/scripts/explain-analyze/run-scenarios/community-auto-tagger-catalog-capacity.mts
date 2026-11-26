import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import {
  getCommunityAutoTaggerAgentRows,
  getCommunityAutoTaggerAgentSlugs,
} from '@services/moderation/community-auto-tagger-data'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { ownedCommunities } from '../seed-data/owned-communities.mts'

const SCENARIO = 'community-auto-tagger-catalog-at-cap'
const QUERY = 'getCommunityAutoTaggerAgentRows'
const BACKGROUND_AGENTS = 300

async function seedOtherModerators(userIds: string[], otherCommunityId: string): Promise<void> {
  const name = `explain-tagger-${userIds[0]!.slice(0, 12)}`
  await write(
    `/* seedCommunityTaggerBackgroundUsers */
    INSERT INTO users (id, username, platform_account_kind)
    SELECT id, $2 || '-' || n, 'system'
    FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, n)`,
    [userIds, name],
  )
  await write(
    `/* seedCommunityTaggerBackgroundAgents */
    WITH seeded_agents AS (
      INSERT INTO agents (system_user_id, agent_type, activated_at)
      SELECT id, 'moderator', CURRENT_TIMESTAMP FROM unnest($1::uuid[]) AS fixture(id)
      RETURNING id, system_user_id
    ), catalog AS (
      INSERT INTO moderator_agents (agent_id, slug)
      SELECT id, $3 || '-' || system_user_id FROM seeded_agents
      RETURNING agent_id
    )
    INSERT INTO community_auto_tagger_agents (community_id, agent_id)
    SELECT $2, agent_id FROM catalog`,
    [userIds, otherCommunityId, name],
  )
}

async function seedCommunityTaggerToggles(communityIds: string[]) {
  const slugs = getCommunityAutoTaggerAgentSlugs()
  const { rows } = await write<{
    agent_id: string
    slug: string
    catalog_rows: number
    active_moderators: number
    toggle_rows: number
  }>(
    `/* seedCommunityTaggerToggles */
    WITH expected AS MATERIALIZED (
      SELECT mod.agent_id, mod.slug, wanted.n
      FROM unnest($2::text[]) WITH ORDINALITY AS wanted(slug, n)
      JOIN moderator_agents mod USING (slug)
    ), seeded_toggles AS (
      INSERT INTO community_auto_tagger_agents (community_id, agent_id, enabled_by_id, disabled_at)
      SELECT scope.id, expected.agent_id, $3,
        CASE WHEN scope.n = 1 AND expected.n = 2 THEN CURRENT_TIMESTAMP END
      FROM expected CROSS JOIN unnest($1::uuid[]) WITH ORDINALITY AS scope(id, n)
      WHERE scope.n = 2 OR expected.n <= 2
      RETURNING agent_id
    )
    SELECT agent_id, slug,
      (SELECT count(*)::int FROM moderator_agents) AS catalog_rows,
      (SELECT count(*)::int FROM agents WHERE agent_type = 'moderator'
        AND activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL) AS active_moderators,
      (SELECT count(*)::int FROM community_auto_tagger_agents) +
        (SELECT count(*)::int FROM seeded_toggles) AS toggle_rows
    FROM expected ORDER BY n`,
    [communityIds, slugs, seedUser.id],
  )
  return {
    slugs,
    expected: rows.map(({ agent_id, slug }) => ({ agent_id, slug })),
    catalogRows: rows[0]!.catalog_rows,
    activeModerators: rows[0]!.active_moderators,
    toggleRows: rows[0]!.toggle_rows,
  }
}

export async function runCommunityAutoTaggerCatalogCapacity(): Promise<void> {
  const fixture = ownedCommunities(2)
  const noiseUserIds = Array.from({ length: BACKGROUND_AGENTS }, () => randomUUID())
  try {
    await fixture.seed()
    await seedOtherModerators(noiseUserIds, fixture.ids[1]!)
    const { slugs, expected, catalogRows, activeModerators, toggleRows } =
      await seedCommunityTaggerToggles(fixture.ids)
    assert.equal(slugs.length, 7)
    assert.deepEqual(
      expected.map(row => row.slug),
      slugs,
    )
    // Main can scan the catalog once and revisit toggle rows for each requested slug.
    // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7188861892
    registerScenarioContract(SCENARIO, {
      seededRows: { moderator_agents: catalogRows, community_auto_tagger_agents: toggleRows },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'moderator_agents', max: catalogRows },
        { kind: 'maxProcessedRows', relation: 'agents', max: activeModerators },
        {
          kind: 'maxProcessedRows',
          relation: 'community_auto_tagger_agents',
          max: slugs.length * toggleRows,
        },
        { kind: 'maxInputRows', nodeType: 'Sort', max: slugs.length },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        const rows = await getCommunityAutoTaggerAgentRows(fixture.ids[0]!)
        assert.deepEqual(
          rows.map(row => ({ agent_id: row.agent_id, slug: row.slug })),
          expected,
        )
        assert.deepEqual(
          rows.map(row => [row.enabled_at !== null, row.disabled_at !== null, row.enabled_by_id]),
          [
            [true, false, seedUser.id],
            [true, true, seedUser.id],
            ...slugs.slice(2).map(() => [false, false, null]),
          ],
        )
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY] },
    )
  } finally {
    await fixture.cleanup()
    await write(
      '/* cleanupCommunityTaggerBackground */ DELETE FROM users WHERE id = ANY($1::uuid[])',
      [noiseUserIds],
    )
  }
}
