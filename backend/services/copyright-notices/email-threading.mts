import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  type CopyrightEmailThreadInput,
} from './email-thread-references.mts'
import type { CopyrightEmailThreadMatch } from './email-thread-match.mts'

export type { CopyrightEmailThreadMatch } from './email-thread-match.mts'

export async function recordCopyrightEmailThreadReferences(
  input: CopyrightEmailThreadInput,
): Promise<CopyrightEmailThreadMatch | null> {
  const referenceRows = buildCopyrightEmailThreadReferenceRows(input)
  if (referenceRows.length === 0) return null
  // Replays derive only from committed facts; a retired parse never recreates references.
  return deriveCopyrightEmailThread(input, referenceRows)
}
