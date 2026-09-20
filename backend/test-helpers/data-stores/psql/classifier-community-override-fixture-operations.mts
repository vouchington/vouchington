import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

export function buildClassifierCommunityOverrideFixtureOperations(data: ClassifierFixtureData) {
  return {
    enableGlobalCandidateForCommunity: async () => {
      const { rows } = await write<{ id: string; enabled_at: Date }>(sql`
        /* enableClassifierFixtureGlobalCandidate */
        INSERT INTO classifier_candidate_community_overrides (
          community_id, candidate_id, enabled_by_id
        )
        VALUES (${data.communityId}, ${data.topicCandidateId}, ${data.auditUserId})
        RETURNING id, enabled_at
      `)
      return rows[0]!
    },
    disableGlobalCandidateForCommunity: () =>
      write(sql`/* disableClassifierFixtureGlobalCandidate */
        UPDATE classifier_candidate_community_overrides
        SET disabled_at = CURRENT_TIMESTAMP, disabled_by_id = ${data.auditUserId}
        WHERE community_id = ${data.communityId}
          AND candidate_id = ${data.topicCandidateId}
          AND disabled_at IS NULL`),
    getGlobalCandidateCommunityOverrideLifecycles: async () => {
      const { rows } = await write<{ id: string; enabled_at: Date; active: boolean }>(sql`
        /* getClassifierFixtureGlobalCandidateOverrideLifecycles */
        SELECT id, enabled_at, disabled_at IS NULL AS active
        FROM classifier_candidate_community_overrides
        WHERE community_id = ${data.communityId}
          AND candidate_id = ${data.topicCandidateId}
        ORDER BY enabled_at, id
      `)
      return rows
    },
    rejectGlobalCandidateCommunityOverrideIdentityMutation: (overrideId: string) =>
      write(sql`/* rejectClassifierFixtureGlobalCandidateOverrideIdentityMutation */
        UPDATE classifier_candidate_community_overrides
        SET enabled_at = enabled_at - INTERVAL '1 second'
        WHERE id = ${overrideId}`),
    rejectGlobalCandidateCommunityOverrideReactivation: (overrideId: string) =>
      write(sql`/* rejectClassifierFixtureGlobalCandidateOverrideReactivation */
        UPDATE classifier_candidate_community_overrides
        SET disabled_at = NULL
        WHERE id = ${overrideId}`),
    rejectCommunityOverrideForLocalCandidate: () =>
      write(sql`/* rejectClassifierFixtureLocalCandidateOverride */
        INSERT INTO classifier_candidate_community_overrides (community_id, candidate_id)
        VALUES (${data.communityId}, ${data.communityCandidateId})`),
    rejectActiveCommunityOverrideWithDisabledActor: () =>
      write(sql`/* rejectClassifierFixtureActiveOverrideDisabledActor */
        INSERT INTO classifier_candidate_community_overrides (
          community_id, candidate_id, disabled_by_id
        ) VALUES (${data.communityId}, ${data.topicCandidateId}, ${data.auditUserId})`),
    getGlobalCandidateCommunityOverrideAuditUsers: async () => {
      const { rows } = await write<{
        enabled_by_id: string | null
        disabled_by_id: string | null
      }>(sql`/* getClassifierFixtureGlobalCandidateOverrideAuditUsers */
        SELECT enabled_by_id, disabled_by_id
        FROM classifier_candidate_community_overrides
        WHERE community_id = ${data.communityId}
          AND candidate_id = ${data.topicCandidateId}
        ORDER BY enabled_at, id
      `)
      return rows
    },
  }
}
