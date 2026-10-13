import type { CopyrightEmailReviewPath } from '@/types/copyright-notices'

/** A new email, a duplicated Message-ID, or ancestors on more than one case. */
export function isSeparateCopyrightEmailCase(reviewPath: CopyrightEmailReviewPath): boolean {
  return (
    reviewPath === 'initial' ||
    reviewPath === 'duplicate_message_id' ||
    reviewPath === 'ancestor_notice_conflict'
  )
}

export const copyrightEmailReviewPathLabels: Record<CopyrightEmailReviewPath, string> = {
  ancestor_notice_conflict: 'Conflicting cases',
  duplicate_message_id: 'Duplicate Message-ID',
  initial: 'Initial intake',
  matched_thread: 'Matched correspondence',
  unresolved_thread: 'Unresolved reply',
}

export function copyrightEmailManualReviewNote(
  reviewPath: CopyrightEmailReviewPath,
): string | null {
  if (reviewPath === 'duplicate_message_id') {
    return 'Message-ID claimed by more than one intake.'
  }
  if (reviewPath === 'ancestor_notice_conflict') {
    return 'This thread reaches more than one case, so it was not linked automatically.'
  }
  return null
}
