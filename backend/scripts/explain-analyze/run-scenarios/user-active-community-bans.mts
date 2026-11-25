import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { listUserActiveCommunityBans } from '@services/communities/bans/search'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const limit = 100
const historyCount = 2_000
const mixedCount = 240
const userId = seedUuid(19_996, '01')
const otherUserId = seedUuid(19_995, '01')
const communityIds = [seedUuid(0, '14'), seedUuid(1, '14')]

function banKind(ordinal: number): string {
  if (ordinal < historyCount) return 'expired'
  const mixedOrdinal = ordinal - historyCount
  if (mixedOrdinal % 25 === 0) return 'expired'
  if (mixedOrdinal % 25 === 1) return 'lifted'
  if (mixedOrdinal % 25 === 2) return 'other-user'
  return mixedOrdinal % 2 === 0 ? 'temporary' : 'permanent'
}

export async function runUserActiveCommunityBanCapacityScenarios(): Promise<void> {
  const cases = [randomUUID(), randomUUID()]
  const fixture = Array.from({ length: historyCount + mixedCount }, (_, ordinal) => ({
    id: seedUuid(100_000 + ordinal, '29'),
    community: ordinal % communityIds.length,
    kind: banKind(ordinal),
  }))
  const active = fixture
    .filter(ban => ban.kind === 'temporary' || ban.kind === 'permanent')
    .toReversed()

  try {
    await write(sql`/* seedUserActiveCommunityBanCapacity */
      WITH cases AS (
        INSERT INTO moderation_cases (id, reported_user_id)
        VALUES (${cases[0]}::uuid, ${userId}::uuid), (${cases[1]}::uuid, ${otherUserId}::uuid)
        RETURNING id, reported_user_id
      )
      INSERT INTO community_bans
        (id, community_id, user_id, case_id, expires_at, lifted_at, lifted_by_id)
      SELECT ban.id, (${communityIds}::uuid[])[ban.community + 1], cases.reported_user_id, cases.id,
        CASE ban.kind WHEN 'expired' THEN CURRENT_TIMESTAMP - interval '1 day'
                      WHEN 'temporary' THEN CURRENT_TIMESTAMP + interval '7 days' END,
        CASE WHEN ban.kind = 'lifted' THEN CURRENT_TIMESTAMP END,
        CASE WHEN ban.kind = 'lifted' THEN ${userId}::uuid END
      FROM jsonb_to_recordset(${JSON.stringify(fixture)}::jsonb) AS ban(id uuid, community int, kind text)
      JOIN cases ON cases.reported_user_id =
        CASE WHEN ban.kind = 'other-user' THEN ${otherUserId}::uuid ELSE ${userId}::uuid END
    `)
    await write('/* analyzeUserActiveCommunityBanCapacity */ ANALYZE community_bans')
    const { rows } = await write<{ count: number }>(
      '/* countUserActiveCommunityBanCapacity */ SELECT COUNT(*)::int AS count FROM community_bans',
    )

    const cursor = (id: string) =>
      encodeScopedUuidCursor(id, `user-community-bans:${userId}:active:id-desc`)
    const pages = [
      { scenario: 'user-active-community-bans-at-cap', start: 0, suffix: 'first' },
      {
        scenario: 'user-active-community-bans-continuation-at-cap',
        start: limit,
        suffix: 'continuation',
      },
    ]
    for (const { scenario, start, suffix } of pages) {
      const expected = active.slice(start, start + limit)
      const after = start === 0 ? undefined : cursor(active[start - 1]!.id)
      registerScenarioContract(scenario, {
        expectations: [
          { kind: 'usesIndexes', indexes: ['idx_community_bans__user'], noSort: true },
          // The ordered index visits the page, its lookahead, and five interleaved expired bans.
          { kind: 'maxProcessedRows', relation: 'community_bans', max: limit + 1 + 5 },
        ],
        seededRows: { community_bans: rows[0]!.count },
      })
      await runAndCapture(
        scenario,
        async () => {
          const page = await listUserActiveCommunityBans(userId, { limit, after })
          assert.deepEqual(
            page.results.map(row => [row.id, row.user_id, row.community_slug]),
            expected.map(ban => [ban.id, userId, `seed-community-${ban.community}`]),
          )
          assert.deepEqual(page.page_info, {
            has_next_page: true,
            start_cursor: cursor(expected[0]!.id),
            end_cursor: cursor(expected.at(-1)!.id),
          })
        },
        suffix,
        'listUserActiveCommunityBans',
        { exactCapturedNames: ['listUserActiveCommunityBans'] },
      )
    }
  } finally {
    await write(sql`/* deleteUserActiveCommunityBanCapacity */
      DELETE FROM moderation_cases WHERE id = ANY(${cases}::uuid[])`)
    await write('/* analyzeAfterUserActiveCommunityBanCapacity */ ANALYZE community_bans')
  }
}
