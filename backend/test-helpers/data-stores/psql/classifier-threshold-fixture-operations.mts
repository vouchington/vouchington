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
    deactivateCommunityThreshold: () =>
      write(sql`/* deactivateClassifierFixtureCommunityThreshold */
        UPDATE classifier_candidate_thresholds SET deactivated_at = CURRENT_TIMESTAMP
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
  }
}
