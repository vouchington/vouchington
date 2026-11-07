import { write } from '@data-stores/psql'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { searchCommunityMembers } from '@services/communities/members/get'
import { listUserMemberCommunities } from '@services/communities/members/member-communities'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const PREFIX = 384
const SIZE = 512
const memberId = (index: number) => seedUuid(index, 'd1')
const userId = (index: number) => seedUuid(index, 'd2')
const communityId = (index: number) => seedUuid(index, 'd3')

/** Deleted targets are eligibility filters: a page walks past the prefix to fill its results. */
export async function runCommunityEligiblePageScenarios(): Promise<void> {
  const memberIds = Array.from({ length: SIZE }, (_, index) => memberId(index))
  const userIds = Array.from({ length: SIZE }, (_, index) => userId(index))
  const communityIds = Array.from({ length: SIZE }, (_, index) => communityId(index))
  await write(
    `/* seedCommunityEligibleUsers */ INSERT INTO users (id, username, deleted_at)
    SELECT id, 'explain-eligible-' || ordinal,
      CASE WHEN ordinal <= $2 THEN CURRENT_TIMESTAMP END
    FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
    ON CONFLICT DO NOTHING`,
    [userIds, PREFIX],
  )
  await write(
    `/* seedCommunityEligibleCommunities */ INSERT INTO communities
      (id, name, slug, created_by_id, created_via, deleted_at)
    SELECT id, 'Explain eligible ' || ordinal, 'explain-eligible-' || ordinal, $2, 'system',
      CASE WHEN ordinal <= $3 THEN CURRENT_TIMESTAMP END
    FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
    ON CONFLICT DO NOTHING`,
    [communityIds, seedUser.id, PREFIX],
  )
  await write(
    `/* seedCommunityEligibleRoster */ INSERT INTO community_members (id, community_id, user_id, role)
    SELECT input.id, $3, input.user_id, 'member'
    FROM unnest($1::uuid[], $2::uuid[]) AS input(id, user_id)
    ON CONFLICT DO NOTHING`,
    [memberIds, userIds, communityIds.at(-1)],
  )
  const target = { ...seedUser, id: userIds.at(-1)! }
  const communityMemberIds = memberIds.map((_, index) => seedUuid(index, 'd4'))
  await write(
    `/* seedCommunityEligibleMemberships */ INSERT INTO community_members (id, community_id, user_id, role)
    SELECT input.id, input.community_id, $3, 'member'
    FROM unnest($1::uuid[], $2::uuid[]) AS input(id, community_id)
    ON CONFLICT DO NOTHING`,
    [communityMemberIds, communityIds, target.id],
  )
  await write('/* analyzeCommunityEligiblePages */ ANALYZE users, communities, community_members')
  try {
    for (const later of [false, true]) {
      const suffix = later ? 'later' : 'first'
      const maxTargets = later ? 100 : SIZE * 2
      registerScenarioContract(`community-members-deleted-prefix-${suffix}`, {
        expectations: [
          { kind: 'maxProcessedRows', relation: 'community_members', max: maxTargets },
          { kind: 'maxProcessedRows', relation: 'users', max: maxTargets },
        ],
      })
      await runAndCapture(`community-members-deleted-prefix-${suffix}`, () =>
        searchCommunityMembers(communityIds.at(-1)!, {
          limit: 25,
          after: later
            ? encodeCursor({ name: memberId(PREFIX + 24), id: memberId(PREFIX + 24) })
            : undefined,
        }),
      )
      registerScenarioContract(`member-communities-deleted-prefix-${suffix}`, {
        expectations: [
          { kind: 'maxProcessedRows', relation: 'community_members', max: maxTargets },
          { kind: 'maxProcessedRows', relation: 'communities', max: maxTargets },
        ],
      })
      await runAndCapture(`member-communities-deleted-prefix-${suffix}`, () =>
        listUserMemberCommunities(target.id, target, {
          limit: 25,
          after: later
            ? encodeScopedUuidCursor(
                communityMemberIds[PREFIX + 24]!,
                `user:${target.id}:communities:member`,
              )
            : undefined,
        }),
      )
    }
  } finally {
    await write(
      '/* deleteCommunityEligibleMemberships */ DELETE FROM community_members WHERE id = ANY($1::uuid[])',
      [memberIds.concat(communityMemberIds)],
    )
    await write(
      '/* deleteCommunityEligibleCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [communityIds],
    )
    await write('/* deleteCommunityEligibleUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])', [
      userIds,
    ])
  }
}
