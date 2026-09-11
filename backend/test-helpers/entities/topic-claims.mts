import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestTopicClaim(options: {
  topicId: string
  claimantUserId: string
  claimedRole?: string
  evidence?: string
  submittedAt?: Date | null
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertTestTopicClaim */
    INSERT INTO topic_claims (
      topic_id,
      claimant_user_id,
      claimed_role,
      evidence,
      submitted_at,
      verification_hostname_id
    )
    SELECT
      ${options.topicId},
      ${options.claimantUserId},
      ${options.claimedRole ?? 'Owner'},
      ${options.evidence ?? 'Deterministic topic claim test fixture.'},
      ${options.submittedAt === undefined ? new Date() : options.submittedAt},
      topics.hostname_id
    FROM topics
    WHERE topics.id = ${options.topicId}
    RETURNING id
  `)
  return rows[0]!.id
}
