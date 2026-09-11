import {
  updateExactCheckpoint as updatePublished,
  type CheckpointUpdateContext,
} from 'vouchington-tooling/gha-pr-checkpoint'
import { CODEC, type CheckpointStatus, type GitHubComment } from './shepherd-checkpoint.mts'

export type { CheckpointUpdateContext }

export function updateExactCheckpoint(
  comment: GitHubComment,
  context: CheckpointUpdateContext,
  status: Extract<CheckpointStatus, 'failed' | 'running'>,
  session: { id?: string; url?: string },
): string {
  return updatePublished(comment, context, status, session, CODEC)
}
