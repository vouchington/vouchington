import { validateFeedbackEnvelope } from 'vouchington-tooling/agent-blackboard'

import type { SessionEntry } from '../blackboard/entries.mts'

// Single home for "what is a retrospective entry" so the reader (check.mts) and
// the writer (save.mts) can't drift apart on the discriminator — see #9149.
export const RETROSPECTIVE_ENTRY_TYPE = 'retrospective'

export function isRetrospectiveEntry(entry: SessionEntry): boolean {
  if (entry.data.type !== RETROSPECTIVE_ENTRY_TYPE) return false
  if (entry.data.schemaVersion === undefined) return true
  try {
    validateFeedbackEnvelope(entry.data)
    return true
  } catch {
    return false
  }
}
