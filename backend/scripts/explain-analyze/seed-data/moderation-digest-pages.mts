import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { contentHash, seedUuidAtTimestamp } from './common.mts'
import { resolveSeedAnchor, SEED_ANCHOR_DATE_ENV } from './seed-anchor.mts'

const OUTSIDE_COMMUNITIES = 10
export const DIGEST_MEMBERSHIP_PAGE_SIZE = 10
export const DIGEST_SOURCE_PAGE_SIZE = 25
const ROWS_PER_COMMUNITY = DIGEST_SOURCE_PAGE_SIZE + 1
const MINUTE_MS = 60_000
const FIXTURE_START = 720_000

export function moderationDigestWindow() {
  const { dayAnchorMs } = resolveSeedAnchor(process.env[SEED_ANCHOR_DATE_ENV])
  return {
    windowStart: new Date(dayAnchorMs - 60 * MINUTE_MS),
    windowEnd: new Date(dayAnchorMs),
    eligibilityAt: new Date(dayAnchorMs),
  }
}

export function moderationDigestPlanFixture() {
  const tag = `explain-digest-${randomUUID()}`
  const { windowStart } = moderationDigestWindow()
  const id = (group: number, i: number) =>
    seedUuidAtTimestamp(windowStart.getTime() + group * MINUTE_MS, FIXTURE_START + i)
  const ids = (group: number, count: number) =>
    Array.from({ length: count }, (_, i) => id(group, i))
  const communityCount = OUTSIDE_COMMUNITIES + 1
  const sourceRows = communityCount * ROWS_PER_COMMUNITY
  const users = ids(1, ROWS_PER_COMMUNITY)
  const communities = ids(2, communityCount)
  const memberships = ids(3, sourceRows)
  const roots = ids(4, sourceRows)
  const replies = ids(5, ROWS_PER_COMMUNITY)
  const applications = ids(6, sourceRows)
  const reports = ids(7, ROWS_PER_COMMUNITY + OUTSIDE_COMMUNITIES)
  const moderator = users[0]!
  const communityId = communities.at(-1)!
  const targetRoots = roots.slice(-ROWS_PER_COMMUNITY)
  const parentId = targetRoots.at(-1)!
  const hash = contentHash(tag)
  const stamp = new Date(windowStart.getTime() + 10 * MINUTE_MS)
  return {
    moderator,
    communityId,
    targetRoots,
    parentId,
    replies,
    targetMemberships: memberships.slice(-ROWS_PER_COMMUNITY),
    targetApplications: applications.slice(-ROWS_PER_COMMUNITY),
    targetReports: reports.slice(0, ROWS_PER_COMMUNITY),
    moderatorMemberships: memberships.filter((_, index) => index % ROWS_PER_COMMUNITY === 0),
    async seed() {
      await write(
        `/* seedModerationDigestUsers */
        INSERT INTO users(id, username)
        SELECT id, $2 || '-' || n FROM unnest($1::uuid[]) WITH ORDINALITY users(id,n)`,
        [users, tag],
      )
      await write(
        `/* seedModerationDigestCommunities */
        INSERT INTO communities(id,name,slug,created_by_id,created_via)
        SELECT id, $2 || '-' || n, $2 || '-' || n, $3, 'system'
        FROM unnest($1::uuid[]) WITH ORDINALITY communities(id,n)`,
        [communities, tag, moderator],
      )
      await write(
        `/* seedModerationDigestMemberships */
        INSERT INTO community_members(id,community_id,user_id,role,removed_at)
        SELECT id, ($2::uuid[])[(n-1)/$4::int+1], ($3::uuid[])[(n-1)%$4::int+1],
          CASE WHEN n=$5::int THEN 'moderator'::community_member_roles ELSE 'member' END,
          CASE WHEN n=$5::int+1 THEN $6::timestamptz END
        FROM unnest($1::uuid[]) WITH ORDINALITY memberships(id,n)`,
        [
          memberships,
          communities,
          users,
          ROWS_PER_COMMUNITY,
          sourceRows - ROWS_PER_COMMUNITY + 1,
          stamp,
        ],
      )
      await write(
        `/* seedModerationDigestRoots */
        INSERT INTO posts(id,community_id,created_by_id,post_type,created_via,title,markdown,deleted_at,
          bedrock_nova_multimodal_v1_content_sha256,llm_moderation_content_sha256)
        SELECT id, ($2::uuid[])[(n-1)/$4::int+1], $3, 'discussion', 'system', 'Digest fixture', 'Digest fixture',
          CASE WHEN id=$6 THEN $7::timestamptz END, $5, $5
        FROM unnest($1::uuid[]) WITH ORDINALITY roots(id,n)`,
        [roots, communities, moderator, ROWS_PER_COMMUNITY, hash, targetRoots[0], stamp],
      )
      await write(
        `/* seedModerationDigestReplies */
        INSERT INTO posts(id,community_id,created_by_id,post_type,created_via,markdown,parent_post_id,root_post_id,
          deleted_at,bedrock_nova_multimodal_v1_content_sha256,llm_moderation_content_sha256)
        SELECT id, $2, $3, 'comment', 'system', 'Digest reply fixture', $4, $4,
          CASE WHEN n=1 THEN $6::timestamptz END,$5,$5
        FROM unnest($1::uuid[]) WITH ORDINALITY replies(id,n)`,
        [replies, communityId, moderator, parentId, hash, stamp],
      )
      await write(
        `/* seedModerationDigestSources */
        INSERT INTO community_post_reviews(community_id,post_id,submitted_by_id,escalated_at)
        SELECT community_id,id,$2,CASE WHEN id=$3 THEN $4::timestamptz END FROM posts WHERE id=ANY($1::uuid[])`,
        [roots, moderator, targetRoots[1], stamp],
      )
      await write(
        `/* seedModerationDigestApplications */
        INSERT INTO community_applications(id,community_id,user_id,created_via,reviewed_at,rejected_at)
        SELECT id,($2::uuid[])[(n-1)/$4::int+1],($3::uuid[])[(n-1)%$4::int+1],'system',
          CASE WHEN n=$5::int THEN $6::timestamptz END,CASE WHEN n=$5::int THEN $6::timestamptz END
        FROM unnest($1::uuid[]) WITH ORDINALITY applications(id,n)`,
        [
          applications,
          communities,
          users,
          ROWS_PER_COMMUNITY,
          sourceRows - ROWS_PER_COMMUNITY + 1,
          stamp,
        ],
      )
      const otherRoots = roots.filter((_, index) => index % ROWS_PER_COMMUNITY === 0).slice(0, -1)
      await write(
        `/* seedModerationDigestReports */
        WITH cases AS (
          INSERT INTO moderation_cases(post_id)
          SELECT id FROM unnest($2::uuid[]) targets(id)
          RETURNING id,post_id
        )
        INSERT INTO moderation_reports(id,created_via,reporter_user_id,post_id,case_id,reason,original_reason,escalated_at)
        SELECT input.id,'system',($3::uuid[])[(input.n-1)%$5::int+1],
          cases.post_id,cases.id,'spam','spam',CASE WHEN input.n=1 THEN $6::timestamptz END
        FROM unnest($1::uuid[]) WITH ORDINALITY input(id,n) JOIN cases
          ON cases.post_id=CASE WHEN input.n<=$5::int THEN $4::uuid ELSE ($2::uuid[])[input.n-$5::int+1] END`,
        [reports, [parentId, ...otherRoots], users, parentId, ROWS_PER_COMMUNITY, stamp],
      )
    },
    async cleanup() {
      await write('/* cleanupModerationDigestPosts */ DELETE FROM posts WHERE id=ANY($1::uuid[])', [
        [...roots, ...replies],
      ])
      await write(
        '/* cleanupModerationDigestCommunities */ DELETE FROM communities WHERE id=ANY($1::uuid[])',
        [communities],
      )
      await write('/* cleanupModerationDigestUsers */ DELETE FROM users WHERE id=ANY($1::uuid[])', [
        users,
      ])
    },
  }
}
