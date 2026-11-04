import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES = 1_000
export const COMMUNITY_MEMBERSHIP_CAP_MODERATORS = 100
export const COMMUNITY_MEMBERSHIP_CAP_REGULAR_MEMBERS = 10_000
export const COMMUNITY_MEMBERSHIP_CAP_USER_ID = seedUuid(19_999, '01')
export const COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID = seedUuid(0, '22')

/** Many moderated communities for one user plus the default-limit moderator recipient cohort. */
export async function seedCommunityMembershipCaps(): Promise<void> {
  const creatorId = seedUuid(0, '01')

  await using transaction = await beginTransaction()
  for (let offset = 0; offset < COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES; offset += 500) {
    const batchSize = Math.min(500, COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES - offset)
    const values: unknown[] = []
    const rows: string[] = []
    for (let index = offset; index < offset + batchSize; index++) {
      values.push(
        seedUuid(index, '22'),
        `Explain Membership Cap ${index}`,
        `explain-membership-cap-${index}`,
        creatorId,
      )
      const base = values.length - 3
      rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, 'system')`)
    }
    // no-mistakes-disable-next-line query-reached-per-item: each statement inserts one bounded chunk of community fixtures, not one statement per row
    await transaction(
      `/* seedCommunityMembershipCaps */ INSERT INTO communities
         (id, name, slug, created_by_id, created_via)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }

  for (let offset = 0; offset < COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES; offset += 500) {
    const batchSize = Math.min(500, COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES - offset)
    const values: unknown[] = []
    const rows: string[] = []
    for (let index = offset; index < offset + batchSize; index++) {
      values.push(seedUuid(index, '23'), seedUuid(index, '22'), COMMUNITY_MEMBERSHIP_CAP_USER_ID)
      const base = values.length - 2
      rows.push(`($${base}, $${base + 1}, $${base + 2}, 'owner'::community_member_roles)`)
    }
    // no-mistakes-disable-next-line query-reached-per-item: each statement inserts one bounded chunk of membership fixtures, not one statement per row
    await transaction(
      `/* seedCommunityMembershipCaps */ INSERT INTO community_members (id, community_id, user_id, role)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }

  const moderatorValues: unknown[] = []
  const moderatorRows: string[] = []
  for (let index = 0; index < COMMUNITY_MEMBERSHIP_CAP_MODERATORS - 1; index++) {
    moderatorValues.push(
      seedUuid(COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES + index, '23'),
      COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
      seedUuid(18_000 + index, '01'),
    )
    const base = moderatorValues.length - 2
    moderatorRows.push(
      `($${base}, $${base + 1}, $${base + 2}, 'moderator'::community_member_roles)`,
    )
  }
  await transaction(
    `/* seedCommunityMembershipCaps */ INSERT INTO community_members (id, community_id, user_id, role)
     VALUES ${moderatorRows.join(', ')} ON CONFLICT DO NOTHING`,
    moderatorValues,
  )
  await transaction(
    `/* seedCommunityMembershipCaps:regularMembers */
     INSERT INTO community_members (id, community_id, user_id, role)
     SELECT id, $2::uuid, user_id, 'member'::community_member_roles
     FROM unnest($1::uuid[], $3::uuid[]) AS input(id, user_id)
     ORDER BY id
     ON CONFLICT DO NOTHING`,
    [
      Array.from({ length: COMMUNITY_MEMBERSHIP_CAP_REGULAR_MEMBERS }, (_, index) =>
        seedUuid(index, '24'),
      ),
      COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
      Array.from({ length: COMMUNITY_MEMBERSHIP_CAP_REGULAR_MEMBERS }, (_, index) =>
        seedUuid(index, '01'),
      ),
    ],
  )
  await transaction.commit()
}
