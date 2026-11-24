import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const otherCommunityCount = 32
const targetApplicationCount = 576
const targetInviteCount = 1_000
const restrictionCount = 162

export async function seedCommunityModerationListCapacity() {
  const prefix = `explain-moderation-list-${randomUUID()}`
  await using transaction = await beginTransaction()
  const { rows: communities } = await transaction<{ id: string }>(sql`
    /* seedCommunityModerationListCapacityCommunities */
    INSERT INTO communities (id, name, slug, created_by_id, created_via)
    SELECT uuidv7(interval '-90 days'), 'Explain moderation list ' || n,
      ${prefix}::text || '-' || n, ${seedUser.id}, 'system'
    FROM generate_series(0, ${otherCommunityCount}::int) AS input(n)
    ORDER BY n
    RETURNING id
  `)
  const communityIds = communities.map(row => row.id).toSorted()
  const communityId = communityIds[0]!
  const applicantIds = Array.from({ length: targetApplicationCount }, (_, index) =>
    seedUuid(index + 11_000, '01'),
  )

  // One pending cursor, then a recently decided prefix and mixed pending and decided rows.
  const { rows: applications } = await transaction<{
    id: string
    community_id: string
    rejected_at: Date | null
  }>(sql`
    /* seedCommunityModerationListCapacityApplications */
    INSERT INTO community_applications
      (community_id, user_id, created_via, reviewed_by_id, reviewed_at, rejected_at, message)
    SELECT community_id, user_id, 'web', CASE WHEN decided THEN ${seedUser.id}::uuid END,
      CASE WHEN decided THEN CURRENT_TIMESTAMP END, CASE WHEN decided THEN CURRENT_TIMESTAMP END,
      'I would like to join this community.'
    FROM (
      SELECT community_id, ordinal, user_id, n, n <> 1 AND (n <= 256 OR n % 2 = 1) AS decided
      FROM unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
      CROSS JOIN unnest(${applicantIds}::uuid[]) WITH ORDINALITY AS applicant(user_id, n)
      WHERE ordinal = 1 OR n <= ${targetApplicationCount / 4}
    ) AS fixture
    ORDER BY n * CASE WHEN ordinal = 1 THEN 1 ELSE 4 END, ordinal
    RETURNING id, community_id, rejected_at
  `)

  await transaction(sql`
    /* seedCommunityModerationListCapacityAnswers */
    WITH questions AS (
      INSERT INTO community_application_questions (community_id, question, order_index)
      SELECT community_id, 'What would you like to contribute?', 0
      FROM unnest(${communityIds}::uuid[]) AS input(community_id)
      RETURNING id, community_id
    )
    INSERT INTO community_application_answers (application_id, community_id, question_id, value)
    SELECT application.id, question.community_id, question.id, '"Discussion"'::jsonb
    FROM questions question
    JOIN community_applications application USING (community_id)
  `)

  const { rows: invites } = await transaction<{ id: string; community_id: string }>(sql`
    /* seedCommunityModerationListCapacityInvites */
    INSERT INTO community_invites (id, community_id, code_hash, invited_email, invited_by_id, revoked_at)
    SELECT uuidv7((n * CASE WHEN ordinal = 1 THEN 1 ELSE 4 END * 33 + ordinal)
        * interval '1 second' - interval '1 day'),
      community_id, upper(lpad(to_hex(ordinal * 10000 + n), 64, '0')),
      ${prefix}::text || '-' || ordinal || '-' || n || '@example.invalid', ${seedUser.id},
      CASE WHEN n % 3 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
    CROSS JOIN generate_series(1, ${targetInviteCount}::int) AS invite(n)
    WHERE ordinal = 1 OR n <= ${targetInviteCount / 4}
    ORDER BY hashint8(ordinal * 10000 + n), ordinal, n
    RETURNING id, community_id
  `)

  const { rows: restrictions } = await transaction<{
    id: string
    community_id: string
    expires_at: Date | null
    lifted_at: Date | null
  }>(sql`
    /* seedCommunityModerationListCapacityRestrictions */
    INSERT INTO community_restrictions
      (id, community_id, restriction_type, activated_by_id, activated_at, lifted_at, lifted_by_id, expires_at)
    SELECT uuidv7(-age), community_id,
      (CASE WHEN n % 2 = 0 THEN 'no_links' ELSE 'no_new_member_posts' END)::community_restriction_types,
      ${seedUser.id}, CURRENT_TIMESTAMP - age,
      CASE WHEN n < ${restrictionCount} - 2 AND n % 2 = 0 THEN CURRENT_TIMESTAMP - age + interval '2 hours' END,
      CASE WHEN n < ${restrictionCount} - 2 AND n % 2 = 0 THEN ${seedUser.id}::uuid END,
      CASE WHEN n % 2 = 1 THEN CURRENT_TIMESTAMP - age + interval '2 hours' END
    FROM (
      SELECT community_id, ordinal, n, (${restrictionCount}::int + 1 - n) * interval '12 hours' AS age
      FROM unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
      CROSS JOIN generate_series(1, ${restrictionCount}::int) AS restriction(n)
    ) AS fixture
    ORDER BY n, ordinal
    RETURNING id, community_id, expires_at, lifted_at
  `)
  await transaction.commit()

  return {
    communityId,
    communityIds,
    pendingApplicationIds: applications
      .filter(row => row.community_id === communityId && row.rejected_at === null)
      .map(row => row.id)
      .toSorted(),
    inviteIds: invites
      .filter(row => row.community_id === communityId)
      .map(row => row.id)
      .toSorted()
      .toReversed(),
    pastRestrictionIds: restrictions
      .filter(
        row =>
          row.community_id === communityId && (row.expires_at !== null || row.lifted_at !== null),
      )
      .map(row => row.id)
      .toSorted()
      .toReversed(),
    seededApplicationCount: applications.length,
    seededInviteCount: invites.length,
    seededRestrictionCount: restrictions.length,
  }
}
