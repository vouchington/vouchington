#!/usr/bin/env node

import {
  parseCheckpoint as parsePublished,
  renderCheckpoint as renderPublished,
  sortedCheckpointCandidates as sortedPublished,
  validateCheckpoint as validatePublished,
  type Checkpoint as PublishedCheckpoint,
  type CheckpointCodecOptions,
  type CheckpointStatus,
  type GitHubComment,
} from 'vouchington-tooling/gha-pr-checkpoint'

export { isTrustedCheckpointComment } from 'vouchington-tooling/gha-pr-checkpoint'

export const CHECKPOINT_MARKER = 'shepherd-checkpoint:v1'

/** Auto Harness production session id: `sess-` plus four random bytes as lowercase hex. */
export const HARNESS_SESSION_ID = /^sess-[0-9a-f]{8}$/u

export type Checkpoint = Omit<PublishedCheckpoint, 'marker'> & {
  marker: typeof CHECKPOINT_MARKER
}

export type { CheckpointStatus, GitHubComment }

export const CODEC: CheckpointCodecOptions = {
  marker: CHECKPOINT_MARKER,
  sessionIdPattern: HARNESS_SESSION_ID,
}

export function renderCheckpoint(checkpoint: Checkpoint): string {
  return renderPublished(checkpoint, { marker: CHECKPOINT_MARKER })
}

export function parseCheckpoint(body: string): Checkpoint | undefined {
  return parsePublished(body, CODEC) as Checkpoint | undefined
}

export function validateCheckpoint(value: unknown): Checkpoint | undefined {
  return validatePublished(value, CODEC) as Checkpoint | undefined
}

export function sortedCheckpointCandidates(
  comments: GitHubComment[],
): { comment: GitHubComment; checkpoint: Checkpoint }[] {
  return sortedPublished(comments, CODEC) as {
    comment: GitHubComment
    checkpoint: Checkpoint
  }[]
}
