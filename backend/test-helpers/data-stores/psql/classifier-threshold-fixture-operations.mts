import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

export function buildClassifierThresholdFixtureOperations(data: ClassifierFixtureData) {
  return {
    rejectInvalidInheritedThreshold: () =>
      write(sql`/* rejectClassifierFixtureInvalidInheritedThreshold */
        INSERT INTO classifier_candidate_thresholds (
          classifier_id, candidate_id, prompt_version_id, lower_threshold_override
        ) VALUES (
          ${data.classifierId}, ${data.topicCandidateId}, ${data.promptVersionId}, 0.8000
        )`),
    rejectDefaultThresholdUpdate: () =>
      write(sql`/* rejectClassifierFixtureDefaultThresholdUpdate */
        UPDATE classifier_prompt_versions SET default_upper_threshold = 0.2000
        WHERE id = ${data.promptVersionId}`),
    rejectCandidateThresholdUpdate: () =>
      write(sql`/* rejectClassifierFixtureThresholdUpdate */
        UPDATE classifier_candidate_thresholds SET lower_threshold_override = 0.3500
        WHERE candidate_id = ${data.communityCandidateId}
          AND prompt_version_id = ${data.promptVersionId}`),
    rejectCandidateThresholdIdentityMutation: () =>
      write(sql`/* rejectClassifierFixtureThresholdIdentityMutation */
        UPDATE classifier_candidate_thresholds SET id = uuidv7()
        WHERE id = ${data.topicThresholdId}`),
    rejectActiveThresholdWithDeactivatedActor: () =>
      write(sql`/* rejectClassifierFixtureActiveThresholdDeactivatedActor */
        UPDATE classifier_candidate_thresholds
        SET deactivated_by_id = ${data.auditUserId}
        WHERE id = ${data.topicThresholdId}`),
    rejectThresholdAuditActorRemoval: () =>
      write(sql`/* rejectClassifierFixtureThresholdAuditActorRemoval */
        UPDATE classifier_candidate_thresholds
        SET created_by_id = NULL
        WHERE id = ${data.communityThresholdId}`),
    deactivateCommunityThreshold: () =>
      write(sql`/* deactivateClassifierFixtureCommunityThreshold */
        UPDATE classifier_candidate_thresholds
        SET deactivated_at = CURRENT_TIMESTAMP, deactivated_by_id = ${data.auditUserId}
        WHERE id = ${data.communityThresholdId}`),
    rejectThresholdDeactivationActorRemoval: () =>
      write(sql`/* rejectClassifierFixtureThresholdDeactivationActorRemoval */
        UPDATE classifier_candidate_thresholds
        SET deactivated_by_id = NULL
        WHERE id = ${data.communityThresholdId}`),
    deleteCommunityThreshold: () =>
      write(sql`/* deleteClassifierFixtureCommunityThreshold */
        DELETE FROM classifier_candidate_thresholds WHERE id = ${data.communityThresholdId}`),
    createReplacementCommunityThreshold: async (): Promise<string> => {
      const { rows } = await write<{ id: string }>(sql`
        /* createClassifierFixtureReplacementCommunityThreshold */
        INSERT INTO classifier_candidate_thresholds (
          classifier_id, candidate_id, prompt_version_id, lower_threshold_override
        ) VALUES (
          ${data.classifierId}, ${data.communityCandidateId}, ${data.promptVersionId}, 0.3500
        ) RETURNING id
      `)
      return rows[0]!.id
    },
    getCommunityThresholdAuditUsers: async () => {
      const { rows } = await write<{
        created_by_id: string | null
        deactivated_by_id: string | null
      }>(sql`/* getClassifierFixtureCommunityThresholdAuditUsers */
        SELECT created_by_id, deactivated_by_id
        FROM classifier_candidate_thresholds
        WHERE id = ${data.communityThresholdId}
      `)
      return rows[0]!
    },
    deleteAuditUser: () =>
      write(sql`/* deleteClassifierFixtureAuditUser */
        DELETE FROM users WHERE id = ${data.auditUserId}`),
  }
}
