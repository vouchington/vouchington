import {
  selectResumeCheckpoint as selectPublished,
  type CheckpointSelectionContext as SelectionContext,
} from 'vouchington-tooling/gha-pr-checkpoint'
import { CODEC, type Checkpoint, type GitHubComment } from './shepherd-checkpoint.mts'

export function selectResumeCheckpoint(
  comments: GitHubComment[],
  context: SelectionContext,
): { checkpoint: Checkpoint; commentId: number } | undefined {
  return selectPublished(comments, context, CODEC) as
    | { checkpoint: Checkpoint; commentId: number }
    | undefined
}
