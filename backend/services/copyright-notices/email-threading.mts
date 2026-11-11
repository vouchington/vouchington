import { admitCopyrightEmailReferenceFacts } from './email-thread-reference-facts.mts'
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
  if (!(await admitCopyrightEmailReferenceFacts(input.intakeId, referenceRows))) return null
  return deriveCopyrightEmailThread(input, referenceRows)
}
