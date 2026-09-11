import type { SessionEntry } from '../blackboard/entries.mts'

// Single home for "what is a checkpoint entry" so the writer (append.mts, note.mts, tool.mts) and
// the reader (the retrospective-distill session-shape classifier) can't drift apart on the
// discriminator — mirrors dev/retrospective-save/retrospective-entry.mts (#9149).
//
// Checkpoint entries keep `type: "journal"` (see append.mts) so an unattended auto-append can never
// classify as entry-type-unresolved; this field is the sibling marker that tells a checkpoint apart
// from user-authored journal reflection without depending on rendered markdown (#10978). The two
// milestone kinds (`pr-create`, `push`) are flattened into this same union rather than collapsed to
// a coarse `'milestone'` value, so the marker alone recovers which milestone fired — a classifier
// reading only `data.checkpoint` never needs to fall back to parsing note.mts's rendered heading.
export const CHECKPOINT_KINDS = ['compaction', 'command-failure', 'pr-create', 'push'] as const

export type CheckpointKind = (typeof CHECKPOINT_KINDS)[number]

export const CHECKPOINT_ENTRY_FIELD = 'checkpoint'

// Shared by note.mts's three renderers so the rendered heading text has one source, even though the
// classifier itself never depends on it — the structural CHECKPOINT_ENTRY_FIELD marker above is the
// only invariant the distill inspector reads.
export const AUTO_APPEND_HEADING_PREFIX = '## Auto-append: '

export function isCheckpointEntry(entry: SessionEntry): boolean {
  const value = entry.data[CHECKPOINT_ENTRY_FIELD]
  return typeof value === 'string' && (CHECKPOINT_KINDS as readonly string[]).includes(value)
}
