import type { SessionEntry } from '../blackboard/entries.mts'

// Single home for "what is a retrospective entry" so the reader (check.mts) and
// the writer (save.mts) can't drift apart on the discriminator — see #9149.
export const RETROSPECTIVE_ENTRY_TYPE = 'retrospective'

export function isRetrospectiveEntry(entry: SessionEntry): boolean {
  return entry.data.type === RETROSPECTIVE_ENTRY_TYPE
}
