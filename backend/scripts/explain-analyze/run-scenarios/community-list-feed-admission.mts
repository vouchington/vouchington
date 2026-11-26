import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { addCommunityListItem } from '@services/communities/list-items/add'
import { getCommunityListFeedLimit } from '@services/lists/import-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const QUERY = 'addCommunityListFeed:bounded'
const REMOVED_MEMBERSHIPS = 8

async function seedFeedAdmission(communityId: string, active: number, cap: number) {
  const { rows } = await write<{ candidate_id: string }>(
    `/* seedCommunityListFeedAdmission */
    WITH community AS (
      INSERT INTO communities (id, name, slug, created_by_id, created_via)
      VALUES ($1, 'EXPLAIN feed admission', $2, $3, 'system') RETURNING id
    ), eligible_feeds AS (
      SELECT id FROM rss_feeds
      WHERE deleted_at IS NULL AND hard_delete_requested_at IS NULL
      ORDER BY id LIMIT $4::int + 1 + $6::int
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM eligible_feeds
    ), memberships AS (
      INSERT INTO community_list_rss_feeds (community_id, rss_feed_id, added_by_id, removed_at)
      SELECT community.id, ranked.id, $3,
        CASE WHEN ranked.n > $4 + 1 THEN CURRENT_TIMESTAMP END
      FROM community CROSS JOIN ranked
      WHERE ranked.n <= $5::int OR ranked.n > $4 + 1
      RETURNING id
    )
    SELECT id AS candidate_id FROM ranked WHERE n = $4 + 1`,
    [
      communityId,
      `explain-feed-admission-${communityId}`,
      seedUser.id,
      cap,
      active,
      REMOVED_MEMBERSHIPS,
    ],
  )
  return rows[0]!.candidate_id
}

async function listFixtureFeedMemberships(communityId: string) {
  const { rows } = await write<{ id: string; rss_feed_id: string; removed: boolean }>(
    `/* inspectCommunityFeedAdmission */
    SELECT id, rss_feed_id, removed_at IS NOT NULL AS removed
    FROM community_list_rss_feeds WHERE community_id = $1 ORDER BY id`,
    [communityId],
  )
  return rows
}

async function captureFeedAdmission(scenario: string, cap: number, canInsert: boolean) {
  const communityId = randomUUID()
  const beforeCount = canInsert ? cap - 1 : cap
  try {
    const feedId = await seedFeedAdmission(communityId, beforeCount, cap)
    const before = await listFixtureFeedMemberships(communityId)
    assert.equal(before.filter(row => !row.removed).length, beforeCount)
    assert.equal(before.filter(row => row.removed).length, REMOVED_MEMBERSHIPS)
    registerScenarioContract(scenario, {
      allowEmptyResult: !canInsert,
      expectations: [{ kind: 'maxProcessedRows', relation: 'community_list_rss_feeds', max: cap }],
    })
    await runAndCapture(
      scenario,
      async () => {
        const add = addCommunityListItem(seedUser.id, communityId, 'rss_feed', feedId)
        if (canInsert) {
          const added = await add
          const after = await listFixtureFeedMemberships(communityId)
          assert.equal(added.entity_id, feedId)
          assert.deepEqual(
            after.find(row => row.id === added.id),
            {
              id: added.id,
              rss_feed_id: feedId,
              removed: false,
            },
          )
          assert.deepEqual(
            after.filter(row => row.id !== added.id),
            before,
          )
        } else {
          await assert.rejects(add, {
            status: 422,
            code: 'community_list_feed_limit_reached',
            limit: cap,
          })
          assert.deepEqual(await listFixtureFeedMemberships(communityId), before)
        }
      },
      undefined,
      QUERY,
      {
        // Recreate the 49-row precondition before replaying the captured INSERT.
        afterCapture: canInsert
          ? async () => {
              await write(
                `/* resetCommunityListFeedAdmission */
                DELETE FROM community_list_rss_feeds WHERE community_id = $1 AND rss_feed_id = $2`,
                [communityId, feedId],
              )
            }
          : undefined,
      },
    )
  } finally {
    await write('/* cleanupCommunityFeedAdmission */ DELETE FROM communities WHERE id = $1', [
      communityId,
    ])
  }
}

export async function runCommunityListFeedAdmission(): Promise<void> {
  const cap = getCommunityListFeedLimit()
  assert.equal(cap, 50)
  await captureFeedAdmission('community-list-feed-admission-insert-at-cap', cap, true)
  await captureFeedAdmission('community-list-feed-admission-reject-at-cap', cap, false)
}
