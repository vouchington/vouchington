import { UPLOAD_CLEANUP_ACTOR_ID } from './seed-data/upload-cleanup-cohort.mts'

/** Existing user with no matching actor rows. These model FK equality probes, not SET NULL writes. */
export const FK_ACTOR_INDEX_PROBES = [
  {
    id: 'fk-actor-images-deleted-by-no-match',
    relation: 'images',
    text: `/* probeImageDeletionActor */ SELECT id FROM images WHERE deleted_by_id = $1::uuid LIMIT 1`,
    values: [UPLOAD_CLEANUP_ACTOR_ID],
  },
  {
    id: 'fk-actor-agent-moderations-deleted-by-no-match',
    relation: 'agent_moderations',
    text: `/* probeAgentModerationDeletionActor */ SELECT id FROM agent_moderations WHERE deleted_by_id = $1::uuid LIMIT 1`,
    values: [UPLOAD_CLEANUP_ACTOR_ID],
  },
  {
    id: 'fk-actor-moderation-cases-resolved-by-no-match',
    relation: 'moderation_cases',
    text: `/* probeModerationCaseResolutionActor */ SELECT id FROM moderation_cases WHERE resolved_by_id = $1::uuid LIMIT 1`,
    values: [UPLOAD_CLEANUP_ACTOR_ID],
  },
] as const
