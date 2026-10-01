import type { SessionEntry } from 'agent-blackboard'

// Historic hook-written journal entries (#9337) stay in Blackboard until they are archived, even
// though no hook appends them anymore (#1201): agents write their own journal entries. They kept
// `type: "journal"` and carry this structural `checkpoint` field, which is the only marker that
// tells one apart from an agent-written entry — the rendered markdown heading is never inspected
// (#10978). Session-shape classification (shape.mts) reads it so those sessions stay
// `checkpoint-only`; mirrors dev/retrospective-save/retrospective-entry.mts (#9149).
const CHECKPOINT_KINDS = ['compaction', 'command-failure', 'pr-create', 'push'] as const

const CHECKPOINT_ENTRY_FIELD = 'checkpoint'

export function isCheckpointEntry(entry: SessionEntry): boolean {
  const value = entry.data[CHECKPOINT_ENTRY_FIELD]
  return typeof value === 'string' && (CHECKPOINT_KINDS as readonly string[]).includes(value)
}
